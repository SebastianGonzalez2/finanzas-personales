import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { parseSettlement } from "../../src/domain/recurrence-settlements.ts";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listPositions,
  saveCreditOperation,
} from "../../src/server/credit-operations.ts";
import { saveCard } from "../../src/server/cards.ts";
import {
  findLoan,
  listLoans,
  saveLoanOperation,
} from "../../src/server/loans.ts";
import {
  commandHash,
  listMovementTotals,
  saveMovement,
} from "../../src/server/movements.ts";
import { listPeople } from "../../src/server/recurring-shares.ts";
import {
  createRecurrence,
  loadRecurrence,
} from "../../src/server/recurrences.ts";
import {
  applySettlement,
  linkableRecurrenceEvents,
  trackedPeriods,
} from "../../src/server/recurrence-settlements.ts";
import {
  saveSharedExpense,
  sharedExpenseDetail,
} from "../../src/server/shared-expenses.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const today = "2026-04-15";
const january = "2026-01-01";
const parse = (value) => {
  assert.ok(!("error" in value), JSON.stringify(value));
  return value;
};

test("F4-04: acuerdo privado, pago real y cobros por persona y período", async (t) => {
  const pool = new pg.Pool(testDatabaseConfig());
  const owner = randomUUID();
  const other = randomUUID();
  const run = (work, ownerId = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const definition = (fields = {}) =>
    parse(
      parseRecurrence({
        kind: "expense",
        concept: "Alquiler sintético",
        currency: "UYU",
        firstPeriod: january,
        referenceAmount: "20000",
        usualShares: [{ name: "Ana de prueba", percentage: "50" }],
        idempotencyKey: randomUUID(),
        ...fields,
      }),
    );
  const create = (input, user = owner) =>
    run((client, id) => createRecurrence(client, id, input), user);
  const state = (seriesId, ...indices) =>
    run(async (client, id) =>
      trackedPeriods(
        client,
        id,
        await loadRecurrence(client, id, seriesId),
        indices,
      ),
    );
  const balance = async () => {
    const [bank] = await run(listBankBalances);
    return bank.calculatedAmount ?? bank.amount;
  };
  const totals = (month) =>
    run((client, id) => listMovementTotals(client, id, month));
  const apply = (command, user = owner) =>
    run((client, id) => applySettlement(client, id, command, today), user);
  const record = (seriesId, period, fields = {}) =>
    parse(
      parseSettlement(
        {
          action: "record",
          seriesId,
          idempotencyKey: randomUUID(),
          targets: [
            {
              index: period.index,
              version: period.version,
              recorded: period.recorded,
              amount: "20000",
              final: true,
            },
          ],
          amount: "20000",
          effectiveOn: "2026-02-05",
          method: "debit",
          split: {
            ownAmount: "10000",
            parties: [{ name: "Ana de prueba", amount: "10000" }],
          },
          ...fields,
        },
        today,
      ),
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
    assert.equal(
      await run((client, id) =>
        saveOpeningBalance(client, id, {
          currency: "UYU",
          amount: "100000.0000",
          asOfDate: january,
        }),
      ),
      "created",
    );

    const agreement = definition();
    const { id: seriesId, status } = await create(agreement);
    assert.equal(status, "created");
    assert.equal((await create(agreement)).status, "replayed");
    const [contact] = await run(listPeople);
    assert.deepEqual(await run(listPeople, other), []);
    assert.equal(
      (
        await create(
          definition({
            usualShares: [{ personId: contact.id, percentage: "50" }],
          }),
          other,
        )
      ).status,
      "invalid-people",
    );
    assert.equal(
      (
        await create(
          definition({
            usualShares: [
              { personId: contact.id, percentage: "25" },
              { name: " ana de prueba ", percentage: "25" },
            ],
          }),
        )
      ).status,
      "invalid-people",
    );
    await assert.rejects(
      run(
        (client) =>
          client.query(
            "INSERT INTO finance.recurring_share_participants(owner_id,series_id,person_id,percentage) VALUES($1,$2,$3,10)",
            [owner, seriesId, contact.id],
          ),
        other,
      ),
    );
    assert.equal(
      (
        await create(
          definition({
            usualShares: [{ personId: contact.id, percentage: "25" }],
          }),
        )
      ).status,
      "created",
    );
    assert.equal((await run(listPeople)).length, 1);
    const ownSeries = await create(definition(), other);
    assert.equal(ownSeries.status, "created");
    await assert.rejects(
      run(
        (client, id) =>
          client.query(
            "INSERT INTO finance.recurring_share_participants(owner_id,series_id,person_id,percentage) VALUES($1,$2,$3,10)",
            [id, ownSeries.id, contact.id],
          ),
        other,
      ),
    );

    const [first, second] = await state(seriesId, 0, 1);
    await t.test(
      "CA-048: la previsión no toca el banco, el consumo ni las obligaciones",
      async () => {
        assert.equal(first.status, "expected");
        assert.equal(second.status, "expected");
        assert.equal(await balance(), "100000.0000");
        assert.deepEqual(await run(listLoans), []);
        assert.deepEqual(await totals(january), []);
      },
    );

    let expenseId;
    let ana;
    await t.test(
      "pago tardío exacto, aislado e idempotente bajo concurrencia",
      async () => {
        const payment = record(seriesId, first);
        assert.equal((await apply(payment, other)).status, "not-found");
        assert.equal(
          (await apply({ ...payment, split: undefined })).status,
          "conflict",
        );
        assert.equal(
          (
            await apply({
              ...payment,
              split: { ...payment.split, ownAmount: "9999.9999" },
            })
          ).status,
          "conflict",
        );
        // SIMP-02: el saldo bancario ya no rechaza un pago mayor al disponible.
        assert.equal(await balance(), "100000.0000");
        assert.deepEqual(await run(listLoans), []);
        const results = await Promise.all([apply(payment), apply(payment)]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "created",
          "replayed",
        ]);
        expenseId = results[0].id;
        assert.equal(results[1].id, expenseId);
        assert.equal(await balance(), "80000.0000");
        assert.deepEqual(await totals(january), []);
        const [expense] = await totals("2026-02-01");
        assert.equal(expense.kind, "expense");
        assert.equal(expense.amount, "10000.0000");
        const [loan] = await run(listLoans);
        ana = loan.id;
        assert.equal(loan.outstanding, "10000.0000");
        const [paid, untouched] = await state(seriesId, 0, 1);
        assert.equal(paid.recorded, "20000.0000");
        assert.equal(paid.events[0].id, expenseId);
        assert.equal(untouched.status, "expected");
        assert.equal(
          (
            await apply(
              parse(
                parseSettlement(
                  {
                    action: "detach",
                    eventId: expenseId,
                    seriesId,
                    idempotencyKey: randomUUID(),
                    target: {
                      index: paid.index,
                      recorded: paid.recorded,
                      version: paid.version,
                    },
                  },
                  today,
                ),
              ),
            )
          ).status,
          "conflict",
        );
        assert.equal(
          await run(
            (client, id) => sharedExpenseDetail(client, id, expenseId, true),
            other,
          ),
          undefined,
        );
      },
    );

    await t.test(
      "cobro posterior y corrección auditada solo del reparto de enero",
      async () => {
        const collect = {
          action: "settle",
          loanId: ana,
          expectedVersion: 1,
          amount: "3000.0000",
          principal: null,
          financialCharges: null,
          accruedPaid: null,
          note: null,
          effectiveOn: "2026-03-05",
          idempotencyKey: randomUUID(),
        };
        const results = await Promise.all([
          run((client, id) => saveLoanOperation(client, id, collect)),
          run((client, id) => saveLoanOperation(client, id, collect)),
        ]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "created",
          "replayed",
        ]);
        assert.equal(await balance(), "83000.0000");
        assert.deepEqual(await totals("2026-03-01"), []);
        const revise = (own, share) =>
          parse(
            parseSharedExpense({
              action: "revise-split",
              eventId: expenseId,
              expectedVersion: 1,
              idempotencyKey: randomUUID(),
              ownAmount: own,
              parties: [{ loanId: ana, amount: share }],
            }),
          );
        const save = (command, user = owner) =>
          run((client, id) => saveSharedExpense(client, id, command), user);
        const revision = revise("12000", "8000");
        assert.equal((await save(revision, other)).status, "not-found");
        assert.equal((await save(revise("17500", "2500"))).status, "conflict");
        assert.equal((await save(revision)).status, "created");
        assert.equal((await save(revision)).status, "replayed");
        assert.equal((await save(revise("13000", "7000"))).status, "conflict");
        assert.equal(await balance(), "83000.0000");
        assert.equal(
          (await run((client, id) => findLoan(client, id, ana))).outstanding,
          "5000.0000",
        );
        assert.equal((await totals("2026-02-01"))[0].amount, "12000.0000");
        const detail = await run((client, id) =>
          sharedExpenseDetail(client, id, expenseId, true),
        );
        assert.equal(detail.revisions[0].correctedOwn, "12000.0000");
        assert.equal(detail.portions[0].collected, "3000.0000");
        assert.equal(
          (await run((client, id) => loadRecurrence(client, id, seriesId)))
            .usualShares[0].percentage,
          "50.0000",
        );
        assert.equal((await state(seriesId, 1))[0].status, "expected");
      },
    );

    await t.test(
      "un pago existente se reparte y vincula sin un segundo débito",
      async () => {
        const debit = await run((client, id) =>
          saveMovement(
            client,
            id,
            {
              kind: "expense",
              currency: "UYU",
              amount: "8000.0000",
              method: "transfer",
              effectiveOn: "2026-03-06",
              concept: "Transferencia sintética",
              note: null,
              categoryId: null,
              idempotencyKey: randomUUID(),
            },
            commandHash(["F4-04 synthetic transfer"]),
          ),
        );
        assert.equal(debit.status, "created");
        const eligible = await run((client, id) =>
          linkableRecurrenceEvents(client, id, seriesId, "2026-03-06"),
        );
        assert.equal(eligible[0].id, debit.id);
        const link = parse(
          parseSettlement(
            {
              action: "link",
              seriesId,
              amount: "8000",
              eventId: debit.id,
              idempotencyKey: randomUUID(),
              targets: [
                {
                  index: second.index,
                  recorded: second.recorded,
                  version: second.version,
                  amount: "8000",
                  final: true,
                },
              ],
              split: {
                ownAmount: "2000",
                parties: [
                  { name: "Ana de prueba", amount: "2000" },
                  { name: "Belén de prueba", amount: "4000" },
                ],
              },
            },
            today,
          ),
        );
        assert.equal((await apply(link)).status, "created");
        assert.equal((await apply(link)).status, "replayed");
        assert.equal(await balance(), "75000.0000");
        assert.equal((await totals("2026-03-01"))[0].amount, "2000.0000");
        assert.deepEqual(
          (await run((client, id) => listLoans(client, id, debit.id)))
            .map(({ outstanding }) => outstanding)
            .sort(),
          ["2000.0000", "4000.0000"],
        );
        const {
          rows: [budget],
        } = await run((client, id) =>
          client.query(
            "SELECT amount::text FROM finance.budget_expenses WHERE owner_id=$1 AND event_id=$2",
            [id, debit.id],
          ),
        );
        assert.equal(budget.amount, "2000.0000");
      },
    );

    await t.test(
      "cuotas, compra total, y pago de tarjeta sin duplicar consumo",
      async () => {
        const card = await run((client, id) =>
          saveCard(client, id, {
            action: "create",
            idempotencyKey: randomUUID(),
            kind: "credit",
            name: "Tarjeta sintética F4-04",
            issuer: null,
            currencies: [{ currency: "UYU", limit: "80000.0000" }],
          }),
        );
        assert.equal(card.status, "created");
        const [period] = await state(seriesId, 2);
        const amount = "12000";
        const purchase = record(seriesId, period, {
          amount,
          effectiveOn: "2026-04-04",
          method: "credit",
          cardId: card.id,
          targets: [
            {
              index: period.index,
              recorded: period.recorded,
              version: period.version,
              amount,
              final: true,
            },
          ],
          split: {
            ownAmount: "6000",
            parties: [{ name: "Ana de prueba", amount: "6000" }],
          },
          installment: {
            cardAmount: "4000",
            plan: {
              count: 3,
              installmentAmount: "4000",
              firstPeriod: "2026-04",
            },
          },
        });
        const saved = await apply(purchase);
        assert.equal(saved.status, "created", JSON.stringify(saved));
        assert.equal(await balance(), "75000.0000");
        assert.equal((await state(seriesId, 2))[0].recorded, "12000.0000");
        const debt = () =>
          run(
            async (client, id) =>
              (await listPositions(client, id, card.id)).get("UYU").debt,
          );
        assert.equal(await debt(), "4000.0000");
        assert.equal((await totals("2026-04-01"))[0].amount, "2000.0000");
        assert.equal((await totals("2026-05-01"))[0].amount, "2000.0000");
        const paid = await run((client, id) =>
          saveCreditOperation(client, id, {
            action: "payment",
            cardId: card.id,
            effectiveOn: today,
            idempotencyKey: randomUUID(),
            lines: [
              {
                currency: "UYU",
                amount: "4000.0000",
                bankCurrency: "UYU",
                bankAmount: "4000.0000",
                fee: "0.0000",
                allocations: [],
              },
            ],
          }),
        );
        assert.equal(paid.status, "created");
        assert.equal(await balance(), "71000.0000");
        assert.equal(await debt(), "0.0000");
        assert.equal((await totals("2026-04-01"))[0].amount, "2000.0000");
      },
    );
    await t.test(
      "si falla el vínculo final, revierte pago, gasto y cuentas por cobrar",
      async () => {
        const [period] = await state(seriesId, 3);
        const before = await balance();
        const loansBefore = await run(listLoans);
        const command = record(seriesId, period, { effectiveOn: "2026-04-10" });
        await pool.query(`
        CREATE FUNCTION finance.fail_test_allocation() RETURNS trigger LANGUAGE plpgsql AS
          'BEGIN RAISE EXCEPTION ''fallo sintético''; END;';
        CREATE TRIGGER fail_test_allocation BEFORE INSERT ON finance.recurring_allocations
          FOR EACH ROW EXECUTE FUNCTION finance.fail_test_allocation();
      `);
        await assert.rejects(apply(command), {
          message: "Operación de datos rechazada",
        });
        assert.equal(await balance(), before);
        assert.deepEqual(await run(listLoans), loansBefore);
        assert.equal((await state(seriesId, 3))[0].status, "expected");
        await pool.query(
          "DROP TRIGGER fail_test_allocation ON finance.recurring_allocations",
        );
        assert.equal((await apply(command)).status, "created");
      },
    );
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
