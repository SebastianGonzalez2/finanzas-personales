import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { findHistoryEntry, listHistory } from "../../src/server/history.ts";
import {
  findLoan,
  listLoanOperations,
  listLoans,
  saveLoanOperation,
} from "../../src/server/loans.ts";
import { listMovementTotals } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F2-06: capital, cuotas, intereses y conciliación con idempotencia y aislamiento reales", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const lender = "f2-06-lender";
  const borrower = "f2-06-borrower";
  const outsider = "f2-06-outsider";
  const today = "2026-02-14";
  const start = "2026-02-01";
  const command = (fields) => {
    const parsed = parseLoanCommand(
      { effectiveOn: today, idempotencyKey: randomUUID(), ...fields },
      today,
    );
    assert.ok(!("error" in parsed));
    return parsed;
  };
  const opening = (fields) =>
    command({
      currency: "UYU",
      installmentLoan: false,
      concept: "Préstamo de prueba",
      ...fields,
    });
  const send = (actor, payload) =>
    as(actor, (client, id) => saveLoanOperation(client, id, payload));
  const change = (actor, loanId, expectedVersion, fields) =>
    send(actor, command({ loanId, expectedVersion, ...fields }));
  const find = (actor, id) =>
    as(actor, (client, owner) => findLoan(client, owner, id));
  const bank = async (actor) => {
    const [balance] = await as(actor, listBankBalances);
    return balance.calculatedAmount ?? balance.amount;
  };
  const totals = (actor) =>
    as(actor, (client, id) => listMovementTotals(client, id, start));
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
    for (const [actor, amount] of [
      [lender, "10000.0000"],
      [borrower, "2000.0000"],
    ])
      await as(actor, (client, owner) =>
        saveOpeningBalance(client, owner, {
          currency: "UYU",
          amount,
          asOfDate: start,
        }),
      );

    const loan = opening({
      action: "lend",
      direction: "receivable",
      amount: "3000",
    });
    const receipts = await Promise.all([
      send(lender, loan),
      send(lender, loan),
    ]);
    assert.deepEqual(receipts.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    const [{ id: receivable }] = receipts;
    assert.equal(receipts[1].id, receivable);
    assert.equal(await bank(lender), "7000.0000");
    assert.equal((await find(lender, receivable)).outstanding, "3000.0000");
    assert.deepEqual(await totals(lender), []);
    assert.equal(
      (await send(lender, { ...loan, note: "distinto" })).status,
      "conflict",
    );
    const collections = await Promise.all(
      [1, 2].map(() =>
        change(lender, receivable, 1, { action: "settle", amount: "1000" }),
      ),
    );
    assert.deepEqual(collections.map(({ status }) => status).sort(), [
      "conflict",
      "created",
    ]);
    assert.equal(await bank(lender), "8000.0000");
    assert.equal((await find(lender, receivable)).outstanding, "2000.0000");
    assert.deepEqual(await totals(lender), []);

    const received = await send(
      borrower,
      opening({ action: "borrow", direction: "payable", amount: "5000" }),
    );
    assert.equal(received.status, "created");
    const payable = received.id;
    assert.equal(await bank(borrower), "7000.0000");
    assert.equal((await find(borrower, payable)).outstanding, "5000.0000");
    assert.deepEqual(await totals(borrower), []);
    assert.equal(
      (
        await change(borrower, payable, 1, {
          action: "interest",
          amount: "500",
        })
      ).status,
      "created",
    );
    assert.equal(await bank(borrower), "7000.0000");
    assert.equal((await find(borrower, payable)).outstanding, "5500.0000");
    assert.deepEqual(await totals(borrower), [
      { kind: "expense", currency: "UYU", amount: "500.0000" },
    ]);
    assert.equal(
      (await change(borrower, payable, 2, { action: "settle", amount: "1000" }))
        .status,
      "conflict",
    );
    assert.equal(
      (
        await change(borrower, payable, 2, {
          action: "settle",
          amount: "1000",
          accruedPaid: "200",
        })
      ).status,
      "created",
    );
    assert.equal((await find(borrower, payable)).accruedInterest, "300.0000");
    assert.equal(
      (await change(borrower, payable, 3, { action: "settle", amount: "4500" }))
        .status,
      "created",
    );
    assert.equal((await find(borrower, payable)).outstanding, "0.0000");
    assert.equal(await bank(borrower), "1500.0000");
    assert.equal((await totals(borrower))[0].amount, "500.0000");

    const installment = await send(
      borrower,
      opening({
        action: "existing",
        direction: "payable",
        amount: "1000",
        installmentLoan: true,
        installmentAmount: "200",
        frequency: "monthly",
        dueOn: "2026-03-14",
      }),
    );
    assert.equal(installment.status, "created");
    const id = installment.id;
    assert.equal(await bank(borrower), "1500.0000");
    assert.equal(
      (await change(borrower, id, 1, { action: "settle", amount: "200" }))
        .status,
      "created",
    );
    assert.equal(await bank(borrower), "1300.0000");
    let state = await find(borrower, id);
    assert.equal(state.outstanding, "1000.0000");
    assert.equal(state.needsReconciliation, true);
    assert.equal(
      (
        await change(borrower, id, 2, {
          action: "settle",
          amount: "200",
          principal: "150",
          financialCharges: "40",
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (
        await change(borrower, id, 2, {
          action: "settle",
          amount: "200",
          principal: "150",
          financialCharges: "50",
        })
      ).status,
      "created",
    );
    assert.equal((await find(borrower, id)).needsReconciliation, true);
    assert.equal(await bank(borrower), "1100.0000");
    assert.equal((await totals(borrower))[0].amount, "550.0000");
    assert.equal(
      (await change(borrower, id, 3, { action: "adjust", amount: "700" }))
        .status,
      "created",
    );
    state = await find(borrower, id);
    assert.equal(state.outstanding, "700.0000");
    assert.equal(state.needsReconciliation, false);
    assert.equal(state.dueOn, "2026-03-14");
    assert.equal(await bank(borrower), "1100.0000");

    const history = await as(borrower, (client, owner) =>
      listLoanOperations(client, owner, { loanId: id }),
    );
    assert.deepEqual(
      history.map(({ action, bankDelta, outstanding }) => [
        action,
        bankDelta,
        outstanding,
      ]),
      [
        ["adjust", null, "700.0000"],
        ["settle", "-200.0000", "850.0000"],
        ["settle", "-200.0000", "1000.0000"],
        ["existing", null, "1000.0000"],
      ],
    );
    assert.equal(history[0].previousOutstanding, "850.0000");
    const query = parseHistoryParams({
      kind: "loan_operation",
      currency: "UYU",
    });
    assert.equal(
      (await as(borrower, (client, owner) => listHistory(client, owner, query)))
        .entries.length,
      8,
    );
    assert.equal(
      (
        await as(borrower, (client, owner) =>
          findHistoryEntry(client, owner, history[0].id, false),
        )
      ).kind,
      "loan_operation",
    );

    assert.equal(
      (
        await send(
          borrower,
          opening({
            action: "lend",
            direction: "receivable",
            amount: "1100.0001",
          }),
        )
      ).status,
      "conflict",
    );
    assert.equal((await as(borrower, listLoans)).length, 2);
    const agreed = await send(
      lender,
      opening({
        action: "lend",
        direction: "receivable",
        amount: "100",
        agreedTotal: "105",
      }),
    );
    assert.equal((await find(lender, agreed.id)).outstanding, "105.0000");
    assert.equal(await bank(lender), "7900.0000");
    assert.equal(
      (await change(lender, agreed.id, 1, { action: "settle", amount: "105" }))
        .status,
      "created",
    );
    assert.equal(await bank(lender), "8005.0000");
    assert.deepEqual(await totals(lender), []);
    assert.equal(await find(outsider, id), undefined);
    assert.deepEqual(await as(outsider, listLoans), []);
    assert.equal(
      (await change(outsider, id, 4, { action: "adjust", amount: "0" })).status,
      "not-found",
    );
    await as(outsider, async (client) => {
      assert.equal(
        (await client.query("SELECT 1 FROM finance.loan_operations")).rowCount,
        0,
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.loans")).rowCount,
        0,
      );
    });
  } finally {
    try {
      if (initialized)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
