import assert from "node:assert/strict";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseCycleCommand } from "../../src/domain/card-cycles.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { saveOpeningBalance } from "../../src/server/bank-balances.ts";
import { saveCardCycle } from "../../src/server/card-cycles.ts";
import {
  cardPushEnabled,
  claimCardPush,
  deliverCardPush,
  disableCardPush,
  enableCardPush,
  isCardPushEndpoint,
  parseCardPushSubscription,
  sendCardPush,
} from "../../src/server/card-push.ts";
import { saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

function device() {
  const key = createECDH("prime256v1");
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    expirationTime: null,
    keys: {
      p256dh: key.generateKeys("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

test("F4-05: push por tarjeta y dispositivo, RLS, reintentos, vencimiento y mínimo cubierto", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 3 });
  const owner = randomUUID();
  const other = randomUUID();
  const today = "2026-02-07";
  const period = "2026-01";
  const as = (id, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: id }), work);
  const claim = (day = today, id = owner) =>
    as(id, (client, actor) => claimCardPush(client, actor, day));
  const enable = (subscription, id = owner) =>
    as(id, (client, actor) => enableCardPush(client, actor, subscription));
  const disable = (endpoint, id = owner) =>
    as(id, (client, actor) => disableCardPush(client, actor, endpoint));
  const status = (endpoint, id = owner) =>
    as(id, (client, actor) => cardPushEnabled(client, actor, endpoint));
  const deliver = (entry, send, id = owner) =>
    as(id, (client, actor) =>
      deliverCardPush(client, actor, today, entry, send),
    );
  let installed = false;

  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
      installed = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }
    const cardId = await as(owner, async (client, actor) => {
      await saveOpeningBalance(client, actor, {
        currency: "UYU",
        amount: "10000.0000",
        asOfDate: "2026-01-01",
      });
      const { id } = await saveCard(client, actor, {
        action: "create",
        kind: "credit",
        name: "Tarjeta sintética",
        issuer: null,
        currencies: [{ currency: "UYU", limit: null }],
        idempotencyKey: randomUUID(),
      });
      const purchase = parseCreditCommand(
        {
          action: "purchase",
          cardId: id,
          idempotencyKey: randomUUID(),
          concept: "Compra sintética",
          currency: "UYU",
          amount: "4000",
          covered: false,
          effectiveOn: "2026-01-12",
        },
        today,
      );
      assert.equal(
        (await saveCreditOperation(client, actor, purchase)).status,
        "created",
      );
      const schedule = parseCycleCommand({
        scope: "schedule",
        cardId: id,
        closingDay: 25,
        dueDay: 9,
        leadDays: 3,
        version: 0,
        idempotencyKey: randomUUID(),
      });
      assert.equal(
        (await saveCardCycle(client, actor, schedule)).status,
        "created",
      );
      const statement = parseCycleCommand({
        scope: "statement",
        cardId: id,
        period,
        currency: "UYU",
        officialAmount: "4000",
        minimumAmount: "1000",
        dueOn: "2026-02-10",
        version: 0,
        idempotencyKey: randomUUID(),
      });
      assert.equal(
        (await saveCardCycle(client, actor, statement)).status,
        "created",
      );
      return id;
    });
    const financialEffects = () =>
      as(
        owner,
        async (client, id) =>
          (
            await client.query(
              `SELECT (SELECT count(*) FROM finance.financial_events WHERE owner_id = $1) AS events,
           (SELECT sum(amount_signed)::text FROM finance.bank_effects WHERE owner_id = $1) AS bank`,
              [id],
            )
          ).rows[0],
      );
    const before = await financialEffects();

    const first = device();
    const second = device();
    assert.deepEqual(await claim(), []);
    assert.equal(await enable(first), true);
    assert.equal(await enable(first), true);
    assert.equal(await enable(second), true);
    assert.equal(await enable(first, other), false);
    assert.equal(await status(first.endpoint, other), false);
    await disable(first.endpoint, other);
    assert.equal(await status(first.endpoint), true);

    assert.deepEqual(await claim("2026-02-06"), []);
    assert.deepEqual(await claim("2026-02-11"), []);
    assert.deepEqual(await claim(today, other), []);
    const [a, b] = await Promise.all([claim(), claim()]);
    const claims = [...a, ...b];
    assert.equal(claims.length, 2);
    const sent = new Set();
    for (const entry of claims) {
      assert.deepEqual(entry.cycles, [{ cardId, period, currency: "UYU" }]);
      await deliver(
        entry,
        async () => assert.fail("Envío a otro titular"),
        other,
      );
      await deliver(entry, async ({ endpoint }) => {
        assert.ok(!sent.has(endpoint));
        sent.add(endpoint);
        return endpoint === second.endpoint ? 410 : 201;
      });
    }
    assert.deepEqual(sent, new Set([first.endpoint, second.endpoint]));
    assert.equal(await status(second.endpoint), false);
    assert.deepEqual(await claim("2026-02-08"), []);
    assert.deepEqual(await financialEffects(), before);

    const third = device();
    await enable(third);
    const [pending] = await claim();
    assert.ok(pending);
    await disable(third.endpoint);
    await deliver(pending, async () =>
      assert.fail("Envío después de desactivar"),
    );
    await enable(third);
    assert.deepEqual(await claim(), []);

    await enable(device());
    const [failedAttempt] = await claim();
    assert.ok(failedAttempt);
    await assert.rejects(deliver(failedAttempt, async () => 503));
    assert.deepEqual(await claim(), []);

    await enable(device());
    const [beforePayment] = await claim();
    assert.ok(beforePayment);
    const payment = parseCreditCommand(
      {
        action: "payment",
        cardId,
        effectiveOn: today,
        idempotencyKey: randomUUID(),
        lines: [
          {
            currency: "UYU",
            amount: "1000",
            bankCurrency: "UYU",
            bankAmount: "1000",
            statementPeriod: period,
          },
        ],
      },
      today,
    );
    await as(owner, async (client, id) =>
      assert.equal(
        (await saveCreditOperation(client, id, payment)).status,
        "created",
      ),
    );
    await deliver(beforePayment, async () =>
      assert.fail("Envío con mínimo cubierto"),
    );
    await enable(device());
    assert.deepEqual(await claim(), []);
  } finally {
    try {
      if (installed)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});

test("F4-05: valida la suscripción y cifra el push con destino acotado", async (t) => {
  const subscription = device();
  assert.deepEqual(parseCardPushSubscription(subscription), subscription);
  assert.equal(
    parseCardPushSubscription({ ...subscription, expirationTime: 1 }),
    null,
  );
  assert.equal(
    parseCardPushSubscription({
      ...subscription,
      keys: { ...subscription.keys, auth: "invalid" },
    }),
    null,
  );
  for (const url of [
    "http://fcm.googleapis.com/fcm/send/fixture",
    "https://fcm.googleapis.com@127.0.0.1/fcm/send/fixture",
    "https://fcm.googleapis.com.example.invalid/fcm/send/fixture",
    "https://fcm.googleapis.com/other",
    "https://fcm.googleapis.com:444/fcm/send/fixture",
  ])
    assert.equal(isCardPushEndpoint(url), false);
  const key = createECDH("prime256v1");
  const vapid = {
    subject: "mailto:fixture@example.invalid",
    publicKey: key.generateKeys("base64url"),
    privateKey: key.getPrivateKey("base64url"),
  };
  const transport = t.mock.method(
    globalThis,
    "fetch",
    async (endpoint, options) => {
      assert.equal(endpoint, subscription.endpoint);
      assert.equal(options.redirect, "error");
      assert.equal(options.headers["content-encoding"], "aes128gcm");
      assert.equal(options.headers.ttl, "3600");
      assert.ok(options.signal instanceof globalThis.AbortSignal);
      assert.equal(options.body.byteLength, 4096);
      return new globalThis.Response(null, { status: 201 });
    },
  );
  assert.equal(await sendCardPush(subscription, vapid), 201);
  assert.equal(transport.mock.callCount(), 1);
});
