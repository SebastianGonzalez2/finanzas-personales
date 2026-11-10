import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { findLoan, saveLoanOperation } from "../../src/server/loans.ts";
import { listMovementTotals } from "../../src/server/movements.ts";
import { listRefundTotals } from "../../src/server/refund-totals.ts";
import { getRefundEntry, saveRefund } from "../../src/server/refunds.ts";
import {
  saveSharedExpense,
  sharedExpenseDetail,
} from "../../src/server/shared-expenses.ts";
import {
  cardCommand,
  consistencyAmounts,
  consistencyOwners,
  creditPayment,
  creditPurchase,
  loanLend,
  loanSettle,
  openingBalance,
  sharedExpense,
} from "../support/f2-10-fixtures.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

const today = "2026-01-15";
const month = "2026-01-01";

function parsed(result) {
  assert.ok(!("error" in result), result.error);
  return result;
}

test("F2-10: partial payments, retries, overpayments, authorization and races", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 4 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const race = async (ownerId, first, second) => {
    let contender;
    let blocked = false;
    const backend = Promise.withResolvers();
    try {
      const winner = await as(ownerId, async (client, id) => {
        const result = await first(client, id);
        contender = as(ownerId, async (other, owner) => {
          const { rows } = await other.query("SELECT pg_backend_pid() AS pid");
          backend.resolve(rows[0].pid);
          return second(other, owner);
        });
        void contender.catch(backend.reject);
        const pid = await backend.promise;
        const deadline = performance.now() + 3000;
        do {
          const { rows } = await client.query(
            `SELECT pg_backend_pid() = ANY(pg_blocking_pids($1)) AND EXISTS (
               SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted
             ) AS blocked`,
            [pid],
          );
          blocked = rows[0].blocked;
          if (blocked) break;
          await delay(20);
        } while (performance.now() < deadline);
        return result;
      });
      assert.ok(
        blocked,
        "La segunda conexión debe esperar el lock de la primera",
      );
      return [winner, await contender];
    } finally {
      await contender?.catch(() => {});
    }
  };
  const debtOf = async (ownerId) => {
    const cards = await as(ownerId, listCards);
    return cards[0]?.currencies[0].debt;
  };
  const bankOf = async (ownerId) => {
    const [row] = await as(ownerId, listBankBalances);
    return row?.calculatedAmount ?? row?.amount;
  };
  const totalsOf = async (ownerId, monthStart = month) =>
    (
      await as(ownerId, (client, id) =>
        listMovementTotals(client, id, monthStart),
      )
    ).map(({ kind, amount }) => [kind, amount]);
  let schemaReady = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
      schemaReady = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }

    const card = consistencyOwners("f2-10-card");
    let cardId;
    await as(card.owner, async (client, id) => {
      await saveOpeningBalance(client, id, openingBalance());
      ({ id: cardId } = await saveCard(client, id, cardCommand()));
    });

    const pay = (ownerId, command) =>
      as(ownerId, (client, id) => saveCreditOperation(client, id, command));

    assert.equal(
      (
        await pay(
          card.owner,
          parsed(parseCreditCommand(creditPurchase({ cardId }), today)),
        )
      ).status,
      "created",
    );
    assert.equal(await debtOf(card.owner), "1000.0000");
    assert.equal(await bankOf(card.owner), "10000.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "1000.0000"]]);

    // I-11: the same retry key credits the payment once, even when it races.
    const partial = parsed(
      parseCreditCommand(
        creditPayment({ cardId, amount: consistencyAmounts.partialPayment }),
        today,
      ),
    );
    const writePartial = (client, id) =>
      saveCreditOperation(client, id, partial);
    const retried = await race(card.owner, writePartial, writePartial);
    assert.deepEqual(retried.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    assert.equal(retried[0].id, retried[1].id);
    assert.equal(await debtOf(card.owner), "600.0000");
    assert.equal(await bankOf(card.owner), "9600.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "1000.0000"]]);

    // I-02: overpaying never turns card debt negative or adds a new expense.
    const overpayment = parsed(
      parseCreditCommand(
        creditPayment({ cardId, amount: consistencyAmounts.overpayment }),
        today,
      ),
    );
    assert.equal((await pay(card.owner, overpayment)).status, "conflict");
    assert.equal(await debtOf(card.owner), "600.0000");
    assert.equal(await bankOf(card.owner), "9600.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "1000.0000"]]);

    // I-11: distinct keys racing for the remaining debt settle it only once.
    const finalPayments = await Promise.all(
      [0, 1].map(() =>
        pay(
          card.owner,
          parsed(
            parseCreditCommand(
              creditPayment({
                cardId,
                amount: consistencyAmounts.remainingDebt,
              }),
              today,
            ),
          ),
        ),
      ),
    );
    assert.deepEqual(finalPayments.map(({ status }) => status).sort(), [
      "conflict",
      "created",
    ]);
    assert.equal(await debtOf(card.owner), "0.0000");
    assert.equal(await bankOf(card.owner), "9000.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "1000.0000"]]);

    // I-12: another titular cannot read or pay the card by its external ID.
    assert.equal(await debtOf(card.other), undefined);
    assert.equal(
      (
        await pay(
          card.other,
          parsed(parseCreditCommand(creditPayment({ cardId }), today)),
        )
      ).status,
      "not-found",
    );
    assert.equal(await debtOf(card.owner), "0.0000");
    assert.equal(await bankOf(card.owner), "9000.0000");

    // I-02: a valid card debt cannot be paid with money the bank does not have.
    const short = consistencyOwners("f2-10-short");
    let shortCard;
    await as(short.owner, async (client, id) => {
      await saveOpeningBalance(
        client,
        id,
        openingBalance({ amount: "300.0000" }),
      );
      ({ id: shortCard } = await saveCard(client, id, cardCommand()));
    });
    await pay(
      short.owner,
      parsed(parseCreditCommand(creditPurchase({ cardId: shortCard }), today)),
    );
    const drain = parsed(
      parseCreditCommand(
        creditPayment({ cardId: shortCard, amount: "300" }),
        today,
      ),
    );
    const lend = parsed(
      parseLoanCommand(loanLend({ amount: "300", effectiveOn: today }), today),
    );
    const competingDebits = await race(
      short.owner,
      (client, id) => saveCreditOperation(client, id, drain),
      (client, id) => saveLoanOperation(client, id, lend),
    );
    assert.deepEqual(
      competingDebits.map(({ status }) => status),
      ["created", "conflict"],
    );
    assert.equal(
      await as(
        short.owner,
        async (client) =>
          (await client.query("SELECT 1 FROM finance.loans")).rowCount,
      ),
      0,
    );
    assert.equal(await bankOf(short.owner), "0.0000");
    assert.equal(
      (
        await pay(
          short.owner,
          parsed(
            parseCreditCommand(
              creditPayment({ cardId: shortCard, amount: "700" }),
              today,
            ),
          ),
        )
      ).status,
      "conflict",
    );
    assert.equal(await debtOf(short.owner), "700.0000");
    assert.equal(await bankOf(short.owner), "0.0000");

    // I-04: loan principal and partial collection are positions, not income.
    const loan = consistencyOwners("f2-10-loan");
    await as(loan.owner, (client, id) =>
      saveOpeningBalance(client, id, openingBalance()),
    );
    const settle = (ownerId, command) =>
      as(ownerId, (client, id) => saveLoanOperation(client, id, command));
    const opened = await settle(
      loan.owner,
      parsed(parseLoanCommand(loanLend(), today)),
    );
    assert.equal(opened.status, "created");
    const loanId = opened.id;
    const outstanding = async (ownerId = loan.owner) =>
      (await as(ownerId, (client, id) => findLoan(client, id, loanId)))
        ?.outstanding;
    assert.equal(await outstanding(), "1000.0000");
    assert.equal(await bankOf(loan.owner), "9000.0000");
    assert.deepEqual(await totalsOf(loan.owner), []);

    const partialSettle = parsed(
      parseLoanCommand(
        loanSettle({ loanId, amount: consistencyAmounts.loanPartial }),
        today,
      ),
    );
    const settleRetry = await Promise.all([
      settle(loan.owner, partialSettle),
      settle(loan.owner, partialSettle),
    ]);
    assert.deepEqual(settleRetry.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    assert.equal(await outstanding(), "600.0000");
    assert.equal(await bankOf(loan.owner), "9400.0000");
    assert.deepEqual(await totalsOf(loan.owner), []);

    assert.equal(
      (
        await settle(
          loan.owner,
          parsed(
            parseLoanCommand(
              loanSettle({
                loanId,
                expectedVersion: 2,
                amount: consistencyAmounts.overpayment,
              }),
              today,
            ),
          ),
        )
      ).status,
      "conflict",
    );
    assert.equal(await outstanding(), "600.0000");
    assert.equal(await bankOf(loan.owner), "9400.0000");

    const collectRemaining = (client, id) =>
      saveLoanOperation(
        client,
        id,
        parsed(
          parseLoanCommand(
            loanSettle({
              loanId,
              expectedVersion: 2,
              // Both amounts fit, even after one succeeds. Only the stale version
              // should prevent the second collection.
              amount: "300",
            }),
            today,
          ),
        ),
      );
    const settleRace = await race(
      loan.owner,
      collectRemaining,
      collectRemaining,
    );
    assert.deepEqual(
      settleRace.map(({ status }) => status),
      ["created", "conflict"],
    );
    assert.equal(await outstanding(), "300.0000");
    assert.equal(await bankOf(loan.owner), "9700.0000");
    assert.deepEqual(await totalsOf(loan.owner), []);

    // I-12: the loan is invisible and unwritable for another titular.
    assert.equal(await outstanding(loan.other), undefined);
    assert.equal(
      (
        await settle(
          loan.other,
          parsed(
            parseLoanCommand(
              loanSettle({ loanId, expectedVersion: 3, amount: "1" }),
              today,
            ),
          ),
        )
      ).status,
      "not-found",
    );
    assert.equal(await outstanding(), "300.0000");

    // I-05: the bank pays the full shared expense once and collections only
    // reduce the receivable; the expense total stays at the owner's share.
    const shared = consistencyOwners("f2-10-shared");
    await as(shared.owner, (client, id) =>
      saveOpeningBalance(client, id, openingBalance()),
    );
    const created = await as(shared.owner, (client, id) =>
      saveSharedExpense(
        client,
        id,
        parsed(parseSharedExpense(sharedExpense(), today)),
      ),
    );
    assert.equal(created.status, "created");
    const detail = await as(shared.owner, (client, id) =>
      sharedExpenseDetail(client, id, created.id),
    );
    assert.deepEqual(
      detail.loans.map(({ direction, outstanding: amount }) => [
        direction,
        amount,
      ]),
      Array.from({ length: 3 }, () => ["receivable", "1000.0000"]),
    );
    assert.equal(await bankOf(shared.owner), "6000.0000");
    assert.deepEqual(await totalsOf(shared.owner), [["expense", "1000.0000"]]);
    assert.equal(
      await as(shared.other, (client, id) =>
        sharedExpenseDetail(client, id, created.id),
      ),
      undefined,
    );

    const collect = () =>
      parsed(
        parseLoanCommand(
          loanSettle({
            loanId: detail.loans[0].id,
            expectedVersion: 1,
            amount: "800",
          }),
          today,
        ),
      );
    const collectRace = await Promise.all([
      settle(shared.owner, collect()),
      settle(shared.owner, collect()),
    ]);
    assert.deepEqual(collectRace.map(({ status }) => status).sort(), [
      "conflict",
      "created",
    ]);
    const [collected] = await as(shared.owner, (client, id) =>
      sharedExpenseDetail(client, id, created.id),
    ).then(({ loans }) => loans.filter(({ id }) => id === detail.loans[0].id));
    assert.equal(collected.outstanding, "200.0000");
    assert.equal(await bankOf(shared.owner), "6800.0000");
    assert.deepEqual(await totalsOf(shared.owner), [["expense", "1000.0000"]]);

    assert.equal(
      (
        await settle(
          shared.owner,
          parsed(
            parseLoanCommand(
              loanSettle({
                loanId: detail.loans[0].id,
                expectedVersion: 2,
                amount: "300",
              }),
              today,
            ),
          ),
        )
      ).status,
      "conflict",
    );
    assert.equal(await bankOf(shared.owner), "6800.0000");

    // I-06/I-11: fail the final detail write after both monetary effects.
    const mixed = parsed(
      parseCreditCommand(
        {
          ...creditPurchase({ cardId, amount: "600" }),
          mixed: {
            total: "1000",
            debitAmount: "400",
            debitCardId: null,
            categories: [],
          },
        },
        today,
      ),
    );
    await pool.query(`
      CREATE FUNCTION finance.reject_mixed_fixture() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'F2-10: fallo al vincular la compra mixta';
      END $$;
      CREATE TRIGGER reject_mixed_fixture BEFORE INSERT ON finance.mixed_purchases
        FOR EACH ROW EXECUTE FUNCTION finance.reject_mixed_fixture();
    `);
    let writeError;
    await assert.rejects(
      as(card.owner, (client, id) =>
        saveCreditOperation(client, id, mixed).catch((error) => {
          writeError = error;
          throw error;
        }),
      ),
      { message: "Operación de datos rechazada" },
    );
    assert.equal(
      writeError?.message,
      "F2-10: fallo al vincular la compra mixta",
    );
    assert.equal(await debtOf(card.owner), "0.0000");
    assert.equal(await bankOf(card.owner), "9000.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "1000.0000"]]);
    await pool.query(
      "DROP TRIGGER reject_mixed_fixture ON finance.mixed_purchases",
    );

    const purchase = await pay(card.owner, mixed);
    assert.equal(purchase.status, "created");
    assert.deepEqual(await pay(card.owner, mixed), {
      status: "replayed",
      id: purchase.id,
    });
    assert.equal(await debtOf(card.owner), "600.0000");
    assert.equal(await bankOf(card.owner), "8600.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "2000.0000"]]);

    // CA-028/037: two distinct refund requests cannot exceed either original
    // portion. The credit is reported separately in the month received.
    const february = "2026-02-01";
    const creditRefund = () =>
      parsed(
        parseRefundCommand(
          {
            action: "credit",
            effectiveOn: february,
            purchaseId: purchase.id,
            idempotencyKey: randomUUID(),
            parts: [
              { method: "debit", categoryId: null, amount: "300" },
              { method: "credit", categoryId: null, amount: "450" },
            ],
          },
          february,
        ),
      );
    const refund = (client, id) =>
      saveRefund(client, id, creditRefund(), february);
    const [credited, duplicate] = await race(card.owner, refund, refund);
    assert.equal(credited.status, "created");
    assert.equal(duplicate.status, "conflict");
    assert.equal(await debtOf(card.owner), "150.0000");
    assert.equal(await bankOf(card.owner), "8900.0000");
    assert.deepEqual(await totalsOf(card.owner), [["expense", "2000.0000"]]);
    assert.deepEqual(await totalsOf(card.owner, february), []);
    assert.deepEqual(
      await as(card.owner, (client, id) =>
        listRefundTotals(client, id, february),
      ),
      [{ currency: "UYU", amount: "750.0000" }],
    );
    assert.equal(
      await as(card.other, (client, id) =>
        getRefundEntry(client, id, credited.id),
      ),
      undefined,
    );
    assert.equal((await as(card.other, refund)).status, "not-found");

    // I-12: exercise RLS and owner-scoped foreign keys directly as finanzas_app.
    const relations = [
      ["card_currencies", "card_id", cardId, card.owner],
      ["loan_operations", "loan_id", loanId, loan.owner],
      ["shared_expense_details", "event_id", created.id, shared.owner],
      ["refund_parts", "event_id", credited.id, card.owner],
    ];
    for (const [table, column, target, owner] of relations) {
      const {
        rows: [policy],
      } = await pool.query(
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass",
        [`finance.${table}`],
      );
      assert.deepEqual(policy, {
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      const rows = async (client) =>
        (
          await client.query(
            `SELECT 1 FROM finance.${table} WHERE ${column} = $1`,
            [target],
          )
        ).rowCount;
      assert.ok(await as(owner, rows));
      assert.equal(await as(card.other, rows), 0);
    }
    await as(card.other, async (client, id) => {
      const rejectWrite = async (sql, params, code) => {
        await client.query("SAVEPOINT before_denial");
        await assert.rejects(client.query(sql, params), { code });
        await client.query("ROLLBACK TO SAVEPOINT before_denial");
        await client.query("RELEASE SAVEPOINT before_denial");
      };
      const detailSql = `INSERT INTO finance.shared_expense_details
        (owner_id, event_id, version, concept) VALUES ($1, $2, 2, 'Fixture')`;
      await rejectWrite(detailSql, [shared.owner, created.id], "42501");
      await rejectWrite(detailSql, [id, created.id], "23503");
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO finance.financial_events
        (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash)
        VALUES ($1, $2, 'purchase_refund', 'Fixture', $3, $2, repeat('a', 64))`,
        [id, eventId, february],
      );
      await rejectWrite(
        `INSERT INTO finance.purchase_refunds
        (owner_id, event_id, purchase_id, action, currency, amount, applied_amount)
        VALUES ($1, $2, $3, 'credit', 'UYU', 1, 1)`,
        [id, eventId, purchase.id],
        "23503",
      );
      await rejectWrite(
        `INSERT INTO finance.loan_operations
        (owner_id, event_id, loan_id, currency, version, action, amount,
         outstanding, accrued_interest, principal_paid, needs_reconciliation)
        VALUES ($1, $2, $3, 'UYU', 4, 'settle', 1, 299, 0, 1, false)`,
        [id, eventId, loanId],
        "23503",
      );
    });
  } finally {
    try {
      if (schemaReady)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
