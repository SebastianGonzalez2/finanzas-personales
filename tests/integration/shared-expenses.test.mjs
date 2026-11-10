import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import {
  saveCreditOperation,
  voidCreditOperation,
} from "../../src/server/credit-operations.ts";
import { findHistoryEntry, listHistory } from "../../src/server/history.ts";
import { listMonthlyInstallments } from "../../src/server/installments.ts";
import { findLoan, saveLoanOperation } from "../../src/server/loans.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import {
  saveSharedExpense,
  sharedExpenseDetail,
} from "../../src/server/shared-expenses.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F2-08 · RF-025 · CA-035/036: reparto, deuda y cobros con aislamiento real", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const owner = `f2-08-${randomUUID()}`;
  const other = `f2-08-${randomUUID()}`;
  const today = "2026-04-15";
  const month = "2026-04-01";
  const as = (work, actor = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId: actor }), work);
  const expense = (fields) => ({
    action: "create",
    concept: "Cena sintética",
    currency: "UYU",
    amount: "4000",
    effectiveOn: today,
    idempotencyKey: randomUUID(),
    ...fields,
  });
  const shares = {
    ownAmount: "1000",
    parties: ["Ana", "Belén", "Carlos"].map((name) => ({
      name,
      amount: "1000",
    })),
  };
  const parsed = (parse, fields) => {
    const result = parse(fields, today);
    assert.ok(!("error" in result), result.error);
    return result;
  };
  const send = (command, actor = owner) =>
    as((client, id) => saveSharedExpense(client, id, command), actor);
  const detail = (id, actor = owner) =>
    as((client, who) => sharedExpenseDetail(client, who, id), actor);
  const bank = async () => {
    const [row] = await as(listBankBalances);
    return row.calculatedAmount ?? row.amount;
  };
  const totals = async (start = month) =>
    (await as((client, id) => listMovementTotals(client, id, start))).map(
      ({ kind, amount }) => [kind, amount],
    );
  const settle = (loanId, expectedVersion, amount, actor = owner) =>
    as(
      (client, id) =>
        saveLoanOperation(
          client,
          id,
          parsed(parseLoanCommand, {
            action: "settle",
            loanId,
            expectedVersion,
            amount,
            idempotencyKey: randomUUID(),
            effectiveOn: today,
          }),
        ),
      actor,
    );
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

    const pending = parsed(
      parseSharedExpense,
      expense({
        method: "third_party",
        concept: "Entrada sintética",
        amount: "1000",
        creditor: { name: "Diana", dueOn: "2026-05-01" },
      }),
    );
    const { id: payableId } = await send(pending);
    const [payable] = (await detail(payableId)).loans;
    assert.deepEqual(
      [payable.direction, payable.outstanding, payable.dueOn],
      ["payable", "1000.0000", "2026-05-01"],
    );
    assert.deepEqual(await as(listBankBalances), []);
    assert.deepEqual(await totals(), [["expense", "1000.0000"]]);

    await as((client, id) =>
      saveOpeningBalance(client, id, {
        currency: "UYU",
        asOfDate: month,
        amount: "10000.0000",
      }),
    );
    assert.equal((await settle(payable.id, 1, "1000")).status, "created");
    assert.equal((await detail(payableId)).loans[0].outstanding, "0.0000");
    assert.equal(await bank(), "9000.0000");
    assert.deepEqual(await totals(), [["expense", "1000.0000"]]);

    const debit = parsed(
      parseSharedExpense,
      expense({ method: "debit", ...shares }),
    );
    assert.ok(
      "error" in
        parseSharedExpense({ ...debit, ownAmount: "1000.0001" }, today),
    );
    assert.ok(
      "error" in
        parseSharedExpense(
          {
            ...debit,
            parties: [
              { name: " Ana ", amount: "1500" },
              { name: "ana", amount: "1500" },
            ],
          },
          today,
        ),
    );
    const insufficient = parsed(
      parseSharedExpense,
      expense({
        method: "debit",
        ...shares,
        amount: "10000",
        ownAmount: "7000",
      }),
    );
    assert.equal((await send(insufficient)).status, "conflict");
    assert.equal(await bank(), "9000.0000");

    const attempts = await Promise.all([send(debit), send(debit)]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    const [{ id: sharedId }] = attempts;
    assert.equal(attempts[1].id, sharedId);
    assert.equal(
      (await send({ ...debit, note: "Otro envío" })).status,
      "conflict",
    );
    assert.equal(await bank(), "5000.0000");
    assert.deepEqual(await totals(), [["expense", "2000.0000"]]);

    const original = await detail(sharedId);
    assert.deepEqual(
      original.loans.map(({ direction, outstanding }) => [
        direction,
        outstanding,
      ]),
      Array.from({ length: 3 }, () => ["receivable", "1000.0000"]),
    );
    const [ana, belen] = original.loans;
    assert.equal(await detail(sharedId, other), undefined);
    assert.equal(
      await as(
        (client, id) => findHistoryEntry(client, id, sharedId, false),
        other,
      ),
      undefined,
    );
    assert.equal((await settle(ana.id, 1, "400", other)).status, "not-found");
    assert.equal((await settle(ana.id, 1, "400")).status, "created");
    assert.equal((await settle(belen.id, 1, "1000")).status, "created");
    assert.equal(
      (await as((client, id) => findLoan(client, id, ana.id))).outstanding,
      "600.0000",
    );
    assert.equal(await bank(), "6400.0000");
    assert.deepEqual(await totals(), [["expense", "2000.0000"]]);

    const edit = parsed(parseSharedExpense, {
      action: "edit",
      eventId: sharedId,
      expectedVersion: 1,
      concept: "Cena corregida",
      note: "Nota de prueba",
      idempotencyKey: randomUUID(),
    });
    assert.equal((await send(edit, other)).status, "not-found");
    assert.equal((await send(edit)).status, "created");
    assert.equal((await send(edit)).status, "replayed");
    assert.equal(
      (await send({ ...edit, idempotencyKey: randomUUID() })).status,
      "conflict",
    );
    const revised = await detail(sharedId);
    assert.deepEqual(
      revised.revisions.map(({ concept }) => concept),
      ["Cena corregida", debit.concept],
    );
    assert.deepEqual(
      revised.loans.map(({ id }) => id).sort(),
      original.loans.map(({ id }) => id).sort(),
    );
    const history = await as((client, id) =>
      listHistory(
        client,
        id,
        parseHistoryParams({ q: "Cena corregida", method: "debit" }),
      ),
    );
    assert.deepEqual(
      history.entries.map(({ id, amount }) => [id, amount]),
      [[sharedId, "4000.0000"]],
    );
    assert.equal(
      (
        await as((client, id) =>
          reviseMovement(client, id, {
            action: "void",
            eventId: sharedId,
            idempotencyKey: randomUUID(),
          }),
        )
      ).status,
      "unavailable",
    );

    const { id: preexisting } = await as((client, id) =>
      saveMovement(client, id, {
        ...debit,
        idempotencyKey: randomUUID(),
        kind: "expense",
        amount: "400.0000",
      }),
    );
    const split = parsed(parseSharedExpense, {
      action: "split",
      eventId: preexisting,
      ownAmount: "100",
      parties: [{ name: "Eva", amount: "300" }],
      idempotencyKey: randomUUID(),
    });
    assert.equal((await send(split, other)).status, "not-found");
    assert.equal((await send(split)).id, preexisting);
    assert.equal((await send(split)).status, "replayed");
    assert.equal(await bank(), "6000.0000");
    assert.deepEqual(await totals(), [["expense", "2100.0000"]]);

    const { id: cardId } = await as((client, id) =>
      saveCard(client, id, {
        action: "create",
        kind: "credit",
        name: "Crédito sintético",
        issuer: null,
        currencies: [{ currency: "UYU", limit: null }],
        idempotencyKey: randomUUID(),
      }),
    );
    const cardExpense = parsed(
      parseSharedExpense,
      expense({
        method: "credit",
        concept: "Compra compartida en cuotas",
        amount: "3000",
        cardId,
        cardAmount: "3000",
        covered: false,
        ownAmount: "1000",
        parties: [{ name: "Eva", amount: "2000" }],
        plan: { count: 3, installmentAmount: "1000", firstPeriod: "2026-04" },
      }),
    );
    assert.equal((await send(cardExpense, other)).status, "not-found");
    const { id: cardExpenseId } = await send(cardExpense);
    assert.equal(await bank(), "6000.0000");
    assert.equal((await as(listCards))[0].currencies[0].debt, "3000.0000");
    assert.equal(
      (await detail(cardExpenseId)).loans[0].outstanding,
      "2000.0000",
    );
    assert.deepEqual(await totals(), [["expense", "2433.3334"]]);
    const installments = await as((client, id) =>
      listMonthlyInstallments(client, id, "2026-05-01"),
    );
    assert.deepEqual(
      installments.map(({ id, amount }) => [id, amount]),
      [[cardExpenseId, "333.3333"]],
    );
    assert.deepEqual(await totals("2026-06-01"), [["expense", "333.3333"]]);
    assert.equal(
      (
        await as((client, id) =>
          voidCreditOperation(client, id, {
            eventId: cardExpenseId,
            idempotencyKey: randomUUID(),
          }),
        )
      ).status,
      "conflict",
    );
    const payment = parsed(parseCreditCommand, {
      action: "payment",
      cardId,
      idempotencyKey: randomUUID(),
      effectiveOn: today,
      lines: [
        {
          currency: "UYU",
          amount: "3000",
          bankCurrency: "UYU",
          bankAmount: "3000",
        },
      ],
    });
    assert.equal(
      (await as((client, id) => saveCreditOperation(client, id, payment)))
        .status,
      "created",
    );
    assert.equal(await bank(), "3000.0000");
    assert.deepEqual(await totals(), [["expense", "2433.3334"]]);
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
