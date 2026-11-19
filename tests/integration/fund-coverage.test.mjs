import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import {
  setOwnerContext,
  withOwnerTransaction,
} from "../../src/db/owner-context.ts";
import {
  parseMovement,
  parseMovementRevision,
} from "../../src/domain/movements.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import {
  listBankAvailability,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { saveCard } from "../../src/server/cards.ts";
import {
  listPositions,
  saveCreditOperation,
  voidCreditOperation,
} from "../../src/server/credit-operations.ts";
import {
  listEventFundUses,
  listFundSources,
} from "../../src/server/fund-coverage.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { saveSavingsFund } from "../../src/server/savings-funds.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const today = "2026-05-04";
const keyed = (fields) => ({ idempotencyKey: randomUUID(), ...fields });
const portion = (fundId, amount) => ({ fundId, amount });
const expense = (amount, fundPortions, fields) =>
  keyed({
    kind: "expense",
    method: "transfer",
    currency: "UYU",
    concept: "Gasto de prueba",
    amount,
    effectiveOn: today,
    ...(fundPortions && { fundPortions }),
    ...fields,
  });
function parsed(value) {
  assert.ok(!("error" in value), value.error);
  return value;
}
const move = (c, owner, fields) =>
  saveMovement(c, owner, parsed(parseMovement(fields, today)));
const revise = (c, owner, fields) =>
  reviseMovement(c, owner, parsed(parseMovementRevision(keyed(fields), today)));

async function fixture(work) {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

async function opening(client, owner, currency, amount) {
  assert.equal(
    await saveOpeningBalance(client, owner, {
      currency,
      amount,
      asOfDate: "2026-05-01",
    }),
    "created",
  );
}
async function fund(client, owner, name, amount, currency = "UYU") {
  const created = await saveSavingsFund(
    client,
    owner,
    keyed({ action: "create", name, currency }),
  );
  assert.equal(created.status, "created");
  const saved = await saveSavingsFund(
    client,
    owner,
    keyed({
      action: "reserve",
      fundId: created.id,
      version: 1,
      amount,
    }),
  );
  assert.equal(saved.status, "saved");
  return created.id;
}
async function amounts(c, owner, bank, reserved, free) {
  const [balance] = await listBankAvailability(c, owner, ["UYU"]);
  assert.deepEqual(
    [
      balance.calculatedAmount ?? balance.amount,
      balance.reservedAmount,
      balance.availableAmount,
    ],
    [bank, reserved, free],
  );
}

test("F3-05 / CA-041: dos fondos más disponible, un gasto, corrección y anulación", () =>
  fixture(async (c) => {
    const a = "coverage-a",
      b = "coverage-b";
    await setOwnerContext(c, b);
    await opening(c, b, "UYU", "50.0000");
    const foreign = await fund(c, b, "Fondo B", "50.0000");
    await setOwnerContext(c, a);
    await opening(c, a, "UYU", "1200.0000");
    await opening(c, a, "USD", "300.0000");
    const usd = await fund(c, a, "Dólares", "300.0000", "USD");
    const travel = await fund(c, a, "Viaje", "600.0000");
    const other = await fund(c, a, "Emergencias", "400.0000");
    const split = [portion(travel, "600"), portion(other, "400")];
    assert.equal(
      (await move(c, a, expense("1200", [portion(foreign, "1")]))).status,
      "invalid-coverage",
    );
    assert.equal(
      (await move(c, a, expense("1200", [portion(usd, "1")]))).status,
      "invalid-coverage",
    );
    assert.equal(
      (await move(c, a, expense("1200", [portion(travel, "600.0001")]))).status,
      "invalid-coverage",
    );
    // SIMP-02: el disponible libre ya no limita el registro de un gasto.
    await c.query("SAVEPOINT simp02_partial");
    assert.equal(
      (await move(c, a, expense("1200", [portion(travel, "600")]))).status,
      "created",
    );
    await c.query("ROLLBACK TO SAVEPOINT simp02_partial");
    assert.ok(
      "error" in
        parseMovement(
          expense("1200", [
            portion(travel, "1"),
            portion(travel.toUpperCase(), "1"),
          ]),
          today,
        ),
    );
    assert.ok(
      "error" in
        parseMovement(expense("1", [portion(travel, "1.0001")]), today),
    );
    assert.equal(
      (await c.query("SELECT 1 FROM finance.financial_events")).rowCount,
      0,
    );
    await amounts(c, a, "1200.0000", "1000.0000", "200.0000");

    const command = expense("1200", split);
    const created = await move(c, a, command);
    assert.equal(created.status, "created");
    assert.deepEqual(
      await move(c, a, { ...command, fundPortions: split.toReversed() }),
      { status: "replayed", id: created.id },
    );
    assert.equal(
      (await move(c, a, { ...command, fundPortions: [portion(travel, "400")] }))
        .status,
      "conflict",
    );
    await amounts(c, a, "0.0000", "0.0000", "0.0000");
    assert.equal(
      (
        await c.query(
          "SELECT 1 FROM finance.bank_effects WHERE event_id = $1",
          [created.id],
        )
      ).rowCount,
      1,
    );
    assert.deepEqual(
      (await listMovementTotals(c, a, "2026-05-01")).map(
        ({ amount }) => amount,
      ),
      ["1200.0000"],
    );
    assert.equal((await listEventFundUses(c, a, created.id)).length, 2);
    await setOwnerContext(c, b);
    assert.deepEqual(await listEventFundUses(c, b, created.id), []);
    assert.equal(
      (await c.query("SELECT 1 FROM finance.fund_event_allocations")).rowCount,
      0,
    );
    await setOwnerContext(c, a);

    const { idempotencyKey: unused, ...replacement } = expense("1100", [
      portion(travel, "550"),
      portion(other, "350"),
    ]);
    assert.ok(unused);
    const edited = await revise(c, a, {
      action: "edit",
      eventId: created.id,
      movement: replacement,
    });
    assert.equal(edited.status, "revised");
    await amounts(c, a, "100.0000", "100.0000", "0.0000");
    assert.equal((await listEventFundUses(c, a, created.id)).length, 2);
    assert.equal((await listEventFundUses(c, a, edited.id)).length, 2);
    assert.equal(
      (await revise(c, a, { action: "void", eventId: edited.id })).status,
      "revised",
    );
    await amounts(c, a, "1200.0000", "1000.0000", "200.0000");
    assert.deepEqual(await listMovementTotals(c, a, "2026-05-01"), []);
  }));

test("F3-05: crédito compromete sin débito; pago manual consume la porción y puede revertirse", () =>
  fixture(async (c) => {
    const a = "coverage-card-a",
      b = "coverage-card-b";
    await setOwnerContext(c, a);
    await opening(c, a, "UYU", "2000.0000");
    const travel = await fund(c, a, "Viajes", "800.0000");
    const saving = await fund(c, a, "Ahorro", "500.0000");
    const { id: cardId } = await saveCard(
      c,
      a,
      keyed({
        action: "create",
        kind: "credit",
        name: "Tarjeta de prueba",
        issuer: null,
        currencies: [{ currency: "UYU", limit: null }],
        opening: {
          effectiveOn: "2026-05-01",
          lines: [{ currency: "UYU", amount: "100.0000" }],
        },
      }),
    );
    const credit = (fields) =>
      saveCreditOperation(
        c,
        a,
        parsed(
          parseCreditCommand(
            keyed({
              cardId,
              effectiveOn: today,
              ...fields,
            }),
            today,
          ),
        ),
      );
    const purchase = await credit({
      action: "purchase",
      currency: "UYU",
      amount: "600",
      covered: false,
      concept: "Pasaje",
      fundCommitment: portion(travel, "500"),
    });
    assert.equal(purchase.status, "created", purchase.message);
    const commitment = async () =>
      (await listFundSources(c, a, [travel]))[0].committedAmount;
    assert.equal(await commitment(), "500.0000");
    await amounts(c, a, "2000.0000", "1300.0000", "700.0000");
    assert.equal(
      (
        await c.query(
          "SELECT 1 FROM finance.bank_effects WHERE event_id = $1",
          [purchase.id],
        )
      ).rowCount,
      0,
    );
    const release = await saveSavingsFund(
      c,
      a,
      keyed({
        action: "release",
        fundId: travel,
        version: 2,
        amount: "300.0001",
      }),
    );
    assert.match(release.message, /sin comprometer/);
    assert.equal(
      (await move(c, a, expense("350", [portion(travel, "350")]))).status,
      "invalid-coverage",
    );
    await c.query("SAVEPOINT invalid_close");
    await assert.rejects(
      c.query(
        "UPDATE finance.savings_funds SET reserved_amount=0, status='closed' WHERE id=$1",
        [travel],
      ),
      { code: "23514" },
    );
    await c.query("ROLLBACK TO SAVEPOINT invalid_close");
    await c.query("RELEASE SAVEPOINT invalid_close");

    const line = (amount, allocations, fundPortions) => ({
      currency: "UYU",
      amount,
      bankCurrency: "UYU",
      bankAmount: amount,
      allocations,
      fundPortions,
    });
    const pay = (line) => credit({ action: "payment", lines: [line] });
    assert.equal(
      (
        await pay(
          line("300", [
            {
              purchaseId: purchase.id,
              amount: "300",
              fund: portion(saving, "200"),
            },
          ]),
        )
      ).status,
      "conflict",
    );
    assert.equal((await pay(line("600"))).status, "conflict");
    const paid = await pay(
      line("200", [
        {
          purchaseId: purchase.id,
          amount: "200",
          fund: portion(travel, "100"),
        },
      ]),
    );
    assert.equal(paid.status, "created", paid.message);
    await amounts(c, a, "1800.0000", "1200.0000", "600.0000");
    assert.equal(await commitment(), "400.0000");
    assert.deepEqual(
      (await listEventFundUses(c, a, paid.id)).map(({ purchaseId, amount }) => [
        purchaseId,
        amount,
      ]),
      [[purchase.id, "100.0000"]],
    );
    assert.equal(
      (await listPositions(c, a, cardId)).get("UYU").debt,
      "500.0000",
    );
    assert.deepEqual(
      (await listMovementTotals(c, a, "2026-05-01")).map(
        ({ amount }) => amount,
      ),
      ["600.0000"],
    );

    const initial = await pay(line("100", [], [portion(saving, "100")]));
    assert.equal(initial.status, "created", initial.message);
    assert.equal(
      (await listEventFundUses(c, a, initial.id))[0].purchaseId,
      null,
    );
    await amounts(c, a, "1700.0000", "1100.0000", "600.0000");
    const voidPayment = (eventId) =>
      voidCreditOperation(c, a, keyed({ action: "void", eventId }));
    assert.equal((await voidPayment(initial.id)).status, "revised");
    assert.equal((await voidPayment(purchase.id)).status, "conflict");
    assert.equal((await voidPayment(paid.id)).status, "revised");
    await amounts(c, a, "2000.0000", "1300.0000", "700.0000");
    assert.equal(await commitment(), "500.0000");
    assert.equal((await voidPayment(purchase.id)).status, "revised");
    assert.equal(await commitment(), "0.0000");
    await setOwnerContext(c, b);
    assert.equal(
      (await c.query("SELECT 1 FROM finance.fund_payment_allocations"))
        .rowCount,
      0,
    );
    assert.equal(
      (await c.query("SELECT 1 FROM finance.fund_purchase_commitments"))
        .rowCount,
      0,
    );
  }));

test("F3-05: compra mixta reserva crédito y descuenta una sola vez su porción bancaria", () =>
  fixture(async (c) => {
    const owner = "coverage-mixed";
    await setOwnerContext(c, owner);
    await opening(c, owner, "UYU", "1000.0000");
    const id = await fund(c, owner, "Reserva mixta", "800.0000");
    const { id: cardId } = await saveCard(
      c,
      owner,
      keyed({
        action: "create",
        kind: "credit",
        name: "Tarjeta mixta",
        issuer: null,
        currencies: [{ currency: "UYU", limit: null }],
      }),
    );
    const purchase = (debit, commit, correction) =>
      saveCreditOperation(
        c,
        owner,
        parsed(
          parseCreditCommand(
            keyed({
              action: "purchase",
              cardId,
              effectiveOn: today,
              currency: "UYU",
              amount: "400",
              concept: "Compra mixta",
              covered: false,
              fundCommitment: portion(id, commit),
              mixed: {
                total: String(Number(debit) + 400),
                debitAmount: debit,
                categories: [],
                fundPortions: [portion(id, debit)],
                ...(correction && { correction }),
              },
            }),
            today,
          ),
        ),
      );
    const tooMuch = await purchase("500", "400");
    assert.equal(tooMuch.status, "conflict");
    await amounts(c, owner, "1000.0000", "800.0000", "200.0000");
    const created = await purchase("500", "300");
    assert.equal(created.status, "created", created.message);
    await amounts(c, owner, "500.0000", "300.0000", "200.0000");
    assert.equal(
      (await listFundSources(c, owner, [id]))[0].availableAmount,
      "0.0000",
    );
    assert.equal((await listEventFundUses(c, owner, created.id)).length, 2);
    const fixed = await purchase("450", "300", {
      eventId: created.id,
      planVersion: 0,
    });
    assert.equal(fixed.status, "created", fixed.message);
    await amounts(c, owner, "550.0000", "350.0000", "200.0000");
    assert.equal(
      (await listFundSources(c, owner, [id]))[0].availableAmount,
      "50.0000",
    );
    assert.deepEqual(
      (await listMovementTotals(c, owner, "2026-05-01")).map(
        ({ amount }) => amount,
      ),
      ["850.0000"],
    );
    assert.equal(
      (
        await voidCreditOperation(
          c,
          owner,
          keyed({ action: "void", eventId: fixed.id }),
        )
      ).status,
      "revised",
    );
    await amounts(c, owner, "1000.0000", "800.0000", "200.0000");
    assert.equal(
      (await listPositions(c, owner, cardId)).get("UYU").debt,
      "0.0000",
    );
  }));

test("F3-05: dos gastos concurrentes no reutilizan una misma reserva", async () => {
  const owner = "coverage-concurrency";
  const pool = new pg.Pool(testDatabaseConfig());
  const admin = await pool.connect();
  const own = (work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  let installed = false;
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
    installed = true;
    const id = await own(async (c) => {
      await opening(c, owner, "UYU", "300.0000");
      return fund(c, owner, "Una reserva", "150.0000");
    });
    const orders = [
      expense("100", [portion(id, "100")]),
      expense("100", [portion(id, "100")]),
    ];
    const results = await Promise.all(
      orders.map((order) => own((c) => move(c, owner, order))),
    );
    assert.deepEqual(results.map(({ status }) => status).sort(), [
      "created",
      "invalid-coverage",
    ]);
    await own(async (c) => {
      await amounts(c, owner, "200.0000", "50.0000", "150.0000");
      assert.equal(
        (await c.query("SELECT 1 FROM finance.bank_effects")).rowCount,
        1,
      );
      assert.equal(
        (await c.query("SELECT 1 FROM finance.fund_event_allocations"))
          .rowCount,
        1,
      );
    });
  } finally {
    try {
      await admin.query("ROLLBACK");
      if (installed)
        await admin.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      admin.release();
      await pool.end();
    }
  }
});
