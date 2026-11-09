import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { listCards } from "../../src/server/cards.ts";
import {
  reviseInstallments,
  saveCreditOperation,
  voidCreditOperation,
} from "../../src/server/credit-operations.ts";
import {
  listCardInstallments,
  listInstallmentVersions,
  listMonthlyInstallments,
} from "../../src/server/installments.ts";
import { listMovementTotals } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F2-03: CA-022, deuda confirmada, correcciones y cancelación aisladas", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const owner = "f2-03-a";
  const other = "f2-03-b";
  const today = "2026-01-15";
  const cardId = randomUUID();
  const base = { cardId, effectiveOn: today, currency: "UYU" };
  const totals = async (period, actor = owner) =>
    (
      await as(actor, (client, id) =>
        listMovementTotals(client, id, `${period}-01`),
      )
    ).map(({ amount }) => amount);
  const debt = async () => (await as(owner, listCards))[0].currencies[0].debt;
  const bank = async () => {
    const [balance] = await as(owner, listBankBalances);
    return balance.calculatedAmount ?? balance.amount;
  };
  const save = (input) => {
    const command = parseCreditCommand(input, today);
    assert.ok(!("error" in command));
    return as(owner, (client, id) => saveCreditOperation(client, id, command));
  };
  const revise = (command, actor = owner) =>
    as(actor, (client, id) => reviseInstallments(client, id, command, today));
  let initialized = false;
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await migrateInTransaction(client);
      await client.query("COMMIT");
      initialized = true;
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    await as(owner, async (client, id) => {
      await saveOpeningBalance(client, id, {
        currency: "UYU",
        amount: "10000.0000",
        asOfDate: today,
      });
      await client.query(
        "INSERT INTO finance.cards (owner_id,id,kind,name) VALUES ($1,$2,'credit','Prueba')",
        [id, cardId],
      );
      await client.query(
        "INSERT INTO finance.card_currencies (owner_id,card_id,kind,currency) VALUES ($1,$2,'credit','UYU')",
        [id, cardId],
      );
    });
    const purchase = {
      ...base,
      action: "purchase",
      amount: "2000",
      covered: false,
      concept: "CA-022",
      plan: { installmentAmount: "2000", count: 3, firstPeriod: "2026-01" },
      idempotencyKey: randomUUID(),
    };
    const initial = await Promise.all([save(purchase), save(purchase)]);
    assert.deepEqual(initial.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    const [{ id: eventId }] = initial;
    assert.equal(await debt(), "2000.0000");
    assert.equal(await bank(), "10000.0000");
    for (const month of ["2026-01", "2026-02", "2026-03"])
      assert.deepEqual(await totals(month), ["2000.0000"]);
    assert.deepEqual(await totals("2026-04"), []);
    assert.deepEqual(await totals("2026-02", other), []);
    assert.deepEqual(await as(other, listCardInstallments), []);
    assert.deepEqual(
      await as(other, (client, id) =>
        listInstallmentVersions(client, id, eventId),
      ),
      [],
    );
    await as(other, async (client, id) => {
      await client.query("SAVEPOINT before_foreign_plan");
      await assert.rejects(
        client.query(
          `INSERT INTO finance.installment_plans
        (owner_id,event_id,currency,version,installment_amount,installment_count,active_count,first_period,change_type)
        VALUES ($1,$2,'UYU',1,2,3,3,'2026-01-01','created')`,
          [id, eventId],
        ),
        { code: "23503" },
      );
      await client.query("ROLLBACK TO SAVEPOINT before_foreign_plan");
    });

    const payment = await save({
      action: "payment",
      cardId,
      effectiveOn: today,
      idempotencyKey: randomUUID(),
      lines: [
        {
          currency: "UYU",
          amount: "500",
          bankCurrency: "UYU",
          bankAmount: "500",
          allocations: [{ purchaseId: eventId, amount: "500" }],
        },
      ],
    });
    assert.equal(payment.status, "created");
    assert.equal(await debt(), "1500.0000");
    assert.equal(await bank(), "9500.0000");
    assert.deepEqual(await totals("2026-01"), ["2000.0000"]);

    const edit = {
      action: "edit-installments",
      eventId,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      plan: {
        installmentAmount: "1900.0001",
        count: 3,
        firstPeriod: "2026-02",
      },
    };
    assert.equal((await revise(edit, other)).status, "not-found");
    const edits = await Promise.all([revise(edit), revise(edit)]);
    assert.deepEqual(edits.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    assert.equal(
      (await revise({ ...edit, idempotencyKey: randomUUID() })).status,
      "conflict",
    );
    assert.deepEqual(await totals("2026-01"), []);
    assert.deepEqual(await totals("2026-04"), ["1900.0001"]);

    const cancellation = {
      action: "cancel-installments",
      eventId,
      expectedVersion: 2,
      fromPeriod: "2026-03",
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (await revise({ ...cancellation, idempotencyKey: edit.idempotencyKey }))
        .status,
      "conflict",
    );
    assert.equal((await revise(cancellation)).status, "created");
    assert.equal((await revise(cancellation)).status, "replayed");
    assert.deepEqual(await totals("2026-02"), ["1900.0001"]);
    assert.deepEqual(await totals("2026-03"), []);
    assert.deepEqual(await totals("2026-04"), []);
    assert.deepEqual(
      await as(owner, (client, id) =>
        listMonthlyInstallments(client, id, "2026-02-01"),
      ),
      [
        {
          id: eventId,
          concept: "CA-022",
          ordinal: 1,
          currency: "UYU",
          amount: "1900.0001",
          category: null,
        },
      ],
    );
    const versions = await as(owner, (client, id) =>
      listInstallmentVersions(client, id, eventId),
    );
    assert.deepEqual(
      versions.map(({ change, activeCount, firstPeriod }) => [
        change,
        activeCount,
        firstPeriod,
      ]),
      [
        ["cancelled", 1, "2026-02"],
        ["edited", 3, "2026-02"],
        ["created", 3, "2026-01"],
      ],
    );
    assert.equal(await debt(), "1500.0000");
    assert.equal(await bank(), "9500.0000");
    const voidPurchase = {
      action: "void",
      eventId,
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (
        await as(owner, (client, id) =>
          voidCreditOperation(client, id, voidPurchase),
        )
      ).status,
      "conflict",
    );
    assert.equal(
      (
        await as(owner, (client, id) =>
          voidCreditOperation(client, id, {
            ...voidPurchase,
            eventId: payment.id,
          }),
        )
      ).status,
      "revised",
    );
    assert.equal(
      (
        await as(owner, (client, id) =>
          voidCreditOperation(client, id, {
            ...voidPurchase,
            idempotencyKey: randomUUID(),
          }),
        )
      ).status,
      "revised",
    );
    assert.deepEqual(await totals("2026-02"), []);
    assert.equal(await debt(), "0.0000");
    assert.equal(await bank(), "10000.0000");

    const confirmed = await save({
      ...base,
      action: "adjustment",
      amount: "350",
      expectedDebt: "0",
      idempotencyKey: randomUUID(),
    });
    assert.equal(confirmed.status, "created");
    const pendingCharge = await save({
      ...purchase,
      amount: "0",
      effectiveOn: "2026-01-10",
      idempotencyKey: randomUUID(),
    });
    assert.equal(pendingCharge.status, "created");
    assert.deepEqual(await totals("2026-02"), ["2000.0000"]);
    assert.equal(await debt(), "350.0000");
    assert.equal(await bank(), "10000.0000");
  } finally {
    if (initialized)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
