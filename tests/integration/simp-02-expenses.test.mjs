import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import {
  parseMovement,
  parseMovementRevision,
} from "../../src/domain/movements.ts";
import { listHistory } from "../../src/server/history.ts";
import { listMonthlyInstallments } from "../../src/server/installments.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { summaryFlowFx } from "../../src/server/statistics.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const today = "2026-11-19";
const keyed = (fields) => ({ idempotencyKey: randomUUID(), ...fields });
const expense = (fields) =>
  keyed({
    kind: "expense",
    currency: "UYU",
    concept: "Gasto sintético",
    effectiveOn: "2026-11-05",
    ...fields,
  });
function parsed(value) {
  assert.ok(!("error" in value), value.error);
  return value;
}
const save = (c, owner, fields) =>
  saveMovement(c, owner, parsed(parseMovement(fields, today)));
const revise = (c, owner, fields) =>
  reviseMovement(c, owner, parsed(parseMovementRevision(keyed(fields), today)));
const plan = (installmentAmount, count, firstPeriod = "2026-11") => ({
  installmentAmount,
  count,
  firstPeriod,
});

async function monthly(c, eventId) {
  const { rows } = await c.query(
    `SELECT to_char(effective_on, 'YYYY-MM') AS month, amount::text,
            to_char(reference_on, 'YYYY-MM') AS reference, monthly_fx
       FROM finance.budget_expenses WHERE event_id = $1 ORDER BY effective_on`,
    [eventId],
  );
  return rows;
}

async function totals(c, owner, month) {
  return (await listMovementTotals(c, owner, `${month}-01`)).map(
    ({ kind, currency, amount }) => [kind, currency, amount],
  );
}

test("SIMP-02: gastos sin saldo bancario y cuotas mensuales sin tarjeta", async () => {
  const c = new pg.Client(testDatabaseConfig());
  await c.connect();
  try {
    await c.query("BEGIN");
    await migrateInTransaction(c);
    const a = "simp-02-a";
    const b = "simp-02-b";
    await setOwnerContext(c, a);

    // Sin saldo inicial ni medio bancario.
    const single = await save(c, a, expense({ amount: "1234.56" }));
    assert.equal(single.status, "created");
    const {
      rows: [stored],
    } = await c.query(
      "SELECT method FROM finance.ordinary_movements WHERE event_id = $1",
      [single.id],
    );
    assert.equal(stored.method, "unspecified");

    // Validación del contrato.
    for (const invalid of [
      expense({ kind: "income", plan: plan("5000", 6) }),
      expense({ amount: "29999", plan: plan("5000", 6) }),
      expense({ plan: plan("5000", 1) }),
      expense({ plan: plan("0", 6) }),
      expense({
        plan: plan("5000", 6),
        allocations: [
          { categoryId: null, amount: "15000" },
          { categoryId: null, amount: "15000" },
        ],
      }),
    ])
      assert.ok("error" in parseMovement(invalid, today));

    // 30.000 UYU en 6 cuotas de 5.000: una cuota por mes y nunca el total.
    const command = expense({ concept: "Heladera", plan: plan("5000", 6) });
    assert.equal(parsed(parseMovement(command, today)).amount, "30000.0000");
    const purchase = await save(c, a, command);
    assert.equal(purchase.status, "created");
    assert.deepEqual(await save(c, a, command), {
      status: "replayed",
      id: purchase.id,
    });
    assert.deepEqual(await save(c, a, { ...command, plan: plan("3000", 10) }), {
      status: "conflict",
    });
    const months = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
    assert.deepEqual(
      await monthly(c, purchase.id),
      [...months, "2027-04"].map((month) => ({
        month,
        amount: "5000.0000",
        reference: month,
        monthly_fx: true,
      })),
    );
    assert.deepEqual(await totals(c, a, "2026-11"), [
      ["expense", "UYU", "6234.5600"],
    ]);
    assert.deepEqual(await totals(c, a, "2027-04"), [
      ["expense", "UYU", "5000.0000"],
    ]);
    assert.deepEqual(await totals(c, a, "2027-05"), []);
    assert.deepEqual(
      (await listMonthlyInstallments(c, a, "2026-12-01")).map(
        ({ id, ordinal, amount }) => [id, ordinal, amount],
      ),
      [[purchase.id, 2, "5000.0000"]],
    );

    // Estadísticas y Resumen leen las mismas cuotas.
    const range = {
      from: "2026-11-01",
      to: "2027-04-30",
      label: "Cuotas",
      complete: true,
    };
    const flow = await summaryFlowFx(c, a, range, "UYU", today);
    assert.deepEqual(
      flow.months.map(({ period, expense }) => [period, expense]),
      [
        ["2026-11", "6234.5600"],
        ...[...months.slice(1), "2027-04"].map((month) => [month, "5000.0000"]),
      ],
    );
    assert.equal(
      flow.rows.find(({ kind }) => kind === "expense").amount,
      "31234.5600",
    );

    // El historial muestra la compra una sola vez por su total.
    const history = await listHistory(c, a, parseHistoryParams({}));
    const entry = history.entries.find(({ id }) => id === purchase.id);
    assert.equal(entry.amount, "30000.0000");

    // El importe de un gasto en cuotas solo cambia editándolo completo.
    assert.deepEqual(
      await revise(c, a, {
        action: "correct",
        eventId: purchase.id,
        amount: "1",
      }),
      { status: "planned" },
    );
    const edited = await revise(c, a, {
      action: "edit",
      eventId: purchase.id,
      movement: {
        kind: "expense",
        currency: "UYU",
        concept: "Heladera",
        effectiveOn: "2026-11-05",
        method: "unspecified",
        plan: plan("10000", 3),
      },
    });
    assert.equal(edited.status, "revised");
    assert.deepEqual(await monthly(c, purchase.id), []);
    assert.deepEqual(
      (await monthly(c, edited.id)).map(({ month, amount }) => [month, amount]),
      [
        ["2026-11", "10000.0000"],
        ["2026-12", "10000.0000"],
        ["2027-01", "10000.0000"],
      ],
    );
    assert.deepEqual(await totals(c, a, "2027-02"), []);

    // Un plan no puede repartir un importe distinto del gasto.
    await c.query("SAVEPOINT mismatch");
    await assert.rejects(
      c.query(
        `INSERT INTO finance.installment_plans
           (owner_id, event_id, currency, version, installment_amount, installment_count,
            active_count, first_period, change_type, monthly_fx)
         VALUES ($1, $2, 'UYU', 1, 600, 2, 2, '2026-11-01', 'created', true)`,
        [a, single.id],
      ),
      { code: "23503" },
    );
    await c.query("ROLLBACK TO SAVEPOINT mismatch");

    // Aislamiento por titular.
    await setOwnerContext(c, b);
    assert.equal(
      (await c.query("SELECT 1 FROM finance.expense_installments")).rowCount,
      0,
    );
    assert.deepEqual(await totals(c, b, "2026-11"), []);
    assert.deepEqual(
      await revise(c, b, { action: "void", eventId: edited.id }),
      { status: "not-found" },
    );

    // Anular el gasto retira todas sus cuotas.
    await setOwnerContext(c, a);
    assert.equal(
      (await revise(c, a, { action: "void", eventId: edited.id })).status,
      "revised",
    );
    assert.deepEqual(await monthly(c, edited.id), []);
    assert.deepEqual(await totals(c, a, "2026-12"), []);
  } finally {
    await c.query("ROLLBACK");
    await c.end();
  }
});
