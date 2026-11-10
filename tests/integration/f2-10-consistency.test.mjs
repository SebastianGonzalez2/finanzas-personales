import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { findLoan, saveLoanOperation } from "../../src/server/loans.ts";
import { listMovementTotals } from "../../src/server/movements.ts";
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
  const debtOf = async (ownerId) => {
    const cards = await as(ownerId, listCards);
    return cards[0]?.currencies[0].debt;
  };
  const bankOf = async (ownerId) => {
    const [row] = await as(ownerId, listBankBalances);
    return row?.calculatedAmount ?? row?.amount;
  };
  const totalsOf = async (ownerId) =>
    (
      await as(ownerId, (client, id) => listMovementTotals(client, id, month))
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
    const retried = await Promise.all([
      pay(card.owner, partial),
      pay(card.owner, partial),
    ]);
    assert.deepEqual(retried.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
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
    const race = await Promise.all(
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
    assert.deepEqual(race.map(({ status }) => status).sort(), [
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
    assert.equal(
      (
        await pay(
          short.owner,
          parsed(
            parseCreditCommand(
              creditPayment({ cardId: shortCard, amount: "300" }),
              today,
            ),
          ),
        )
      ).status,
      "created",
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

    const settleRace = await Promise.all(
      [0, 1].map(() =>
        settle(
          loan.owner,
          parsed(
            parseLoanCommand(
              loanSettle({
                loanId,
                expectedVersion: 2,
                amount: consistencyAmounts.loanRemaining,
              }),
              today,
            ),
          ),
        ),
      ),
    );
    assert.deepEqual(settleRace.map(({ status }) => status).sort(), [
      "conflict",
      "created",
    ]);
    assert.equal(await outstanding(), "0.0000");
    assert.equal(await bankOf(loan.owner), "10000.0000");
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
    assert.equal(await outstanding(), "0.0000");

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
