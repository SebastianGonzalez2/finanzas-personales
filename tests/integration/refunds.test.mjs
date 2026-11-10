import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import {
  listBankBalances,
  saveBalanceAdjustment,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { loadCardCycle, saveCardCycle } from "../../src/server/card-cycles.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import {
  reviseInstallments,
  saveCreditOperation,
  voidCreditOperation,
} from "../../src/server/credit-operations.ts";
import { listHistory } from "../../src/server/history.ts";
import { listMonthlyInstallments } from "../../src/server/installments.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { listRefundTotals } from "../../src/server/refund-totals.ts";
import {
  getPurchaseRefunds,
  getRefundEntry,
  saveRefund,
} from "../../src/server/refunds.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const owner = "refund-owner";
const other = "another-owner";
const today = "2026-02-27";
const january = "2026-01-20";
const february = "2026-02-20";
const currency = "UYU";
const debit = { method: "debit", categoryId: null };
const credit = { method: "credit", categoryId: null };

async function setup(run) {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await setOwnerContext(client, owner);
    const { id: cardId } = await saveCard(client, owner, {
      action: "create",
      kind: "credit",
      name: "Tarjeta",
      issuer: null,
      currencies: [{ currency, limit: null }],
      idempotencyKey: randomUUID(),
    });
    await saveOpeningBalance(client, owner, {
      currency,
      amount: "10000",
      asOfDate: "2026-01-01",
    });
    const findCard = async () =>
      (await listCards(client, owner)).find(({ id }) => id === cardId);
    const bank = async () => {
      const [row] = await listBankBalances(client, owner);
      return row.calculatedAmount ?? row.amount;
    };
    const refund = (
      action,
      fields,
      effectiveOn = february,
      key = randomUUID(),
    ) => {
      const command = parseRefundCommand(
        {
          action,
          idempotencyKey: key,
          ...(action !== "void" && { effectiveOn }),
          ...fields,
        },
        today,
      );
      assert.ok(!("error" in command), command.error);
      return saveRefund(client, owner, command, today);
    };
    const cardOperation = (fields) => {
      const command = parseCreditCommand(
        {
          cardId,
          effectiveOn: january,
          idempotencyKey: randomUUID(),
          ...fields,
        },
        today,
      );
      assert.ok(!("error" in command), command.error);
      return saveCreditOperation(client, owner, command);
    };
    const buy = (fields) =>
      cardOperation({
        action: "purchase",
        concept: "Compra con tarjeta",
        currency,
        amount: "1000",
        covered: false,
        ...fields,
      });
    const expense = (fields) => {
      const movement = parseMovement(
        {
          kind: "expense",
          amount: "2000",
          currency,
          method: "debit",
          concept: "Ropa",
          effectiveOn: january,
          idempotencyKey: randomUUID(),
          ...fields,
        },
        today,
      );
      assert.ok(!("error" in movement), movement.error);
      return saveMovement(client, owner, movement);
    };
    const created = async (result) => {
      const saved = await result;
      assert.equal(saved.status, "created", JSON.stringify(saved));
      return saved.id;
    };
    await run({
      client,
      cardId,
      findCard,
      bank,
      refund,
      cardOperation,
      buy,
      expense,
      created,
    });
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

test("F2-09 CA-028: débito, fecha real, historial, ancla, idempotencia y aislamiento", () =>
  setup(async ({ client, bank, refund, expense, created }) => {
    const purchaseId = await created(expense({}));
    await created(expense({ effectiveOn: february, amount: "3000" }));
    const pendingId = await created(
      refund("pending", { purchaseId, amount: "500" }, "2026-02-01"),
    );
    assert.equal(await bank(), "5000.0000");
    assert.deepEqual(await listRefundTotals(client, owner, "2026-02-01"), []);
    const input = {
      purchaseId,
      pendingId,
      parts: [{ ...debit, amount: "500" }],
    };
    const key = randomUUID();
    const id = await created(refund("credit", input, february, key));
    assert.deepEqual(await refund("credit", input, february, key), {
      status: "replayed",
      id,
    });
    assert.equal(await bank(), "5500.0000");
    assert.equal(
      (await getRefundEntry(client, owner, pendingId)).status,
      "confirmed",
    );
    for (const [month, amount] of [
      ["01", "2000.0000"],
      ["02", "3000.0000"],
    ])
      assert.deepEqual(
        await listMovementTotals(client, owner, `2026-${month}-01`),
        [{ kind: "expense", currency, amount }],
      );
    assert.deepEqual(await listRefundTotals(client, owner, "2026-02-01"), [
      { currency, amount: "500.0000" },
    ]);
    const { entries } = await listHistory(
      client,
      owner,
      parseHistoryParams({
        kind: "purchase_refund",
        from: "2026-02-01",
        status: "confirmed",
        method: "debit",
      }),
    );
    assert.deepEqual(
      entries.map((entry) => [entry.id, entry.effectiveOn, entry.amount]),
      [[id, february, "500.0000"]],
    );
    assert.equal(
      (
        await reviseMovement(client, owner, {
          action: "void",
          eventId: purchaseId,
          idempotencyKey: randomUUID(),
        })
      ).status,
      "unavailable",
    );
    await setOwnerContext(client, other);
    assert.equal(
      (
        await saveRefund(
          client,
          other,
          parseRefundCommand(
            {
              action: "credit",
              ...input,
              effectiveOn: february,
              idempotencyKey: randomUUID(),
            },
            today,
          ),
          today,
        )
      ).status,
      "not-found",
    );
    assert.equal(await getRefundEntry(client, other, id), undefined);
    assert.equal(
      (await client.query("SELECT * FROM finance.refund_parts")).rowCount,
      0,
    );
    await setOwnerContext(client, owner);
    const adjustment = await saveBalanceAdjustment(client, owner, {
      currency,
      amount: "5500.0000",
      asOfDate: "2026-02-21",
      idempotencyKey: randomUUID(),
      note: null,
    });
    assert.equal(adjustment.status, "created");
    assert.equal((await refund("void", { eventId: id })).status, "revised");
    assert.equal(await bank(), "5500.0000");
    assert.equal(
      (await listBankBalances(client, owner))[0].amount,
      "5500.0000",
    );
    assert.equal(
      (await getRefundEntry(client, owner, pendingId)).status,
      "pending",
    );
  }));

test("F2-09 CA-029: devolución de compra pagada, aplicación explícita y reintegro a Bancos", () =>
  setup(
    async ({
      client,
      cardId,
      findCard,
      bank,
      refund,
      cardOperation,
      buy,
      created,
    }) => {
      const purchaseId = await created(buy({ amount: "300" }));
      const payment = await created(
        cardOperation({
          action: "payment",
          effectiveOn: "2026-02-01",
          lines: [
            {
              currency,
              amount: "300",
              bankCurrency: currency,
              bankAmount: "300",
              fee: "0",
              allocations: [],
            },
          ],
        }),
      );
      const id = await created(
        refund("credit", { purchaseId, parts: [{ ...credit, amount: "300" }] }),
      );
      assert.equal((await findCard()).currencies[0].creditBalance, "300.0000");
      assert.equal((await findCard()).currencies[0].debt, "0.0000");
      assert.equal(await bank(), "9700.0000");
      assert.equal(
        (
          await voidCreditOperation(client, owner, {
            eventId: payment,
            idempotencyKey: randomUUID(),
          })
        ).status,
        "conflict",
      );
      const later = await created(
        buy({ effectiveOn: february, amount: "100", creditApplied: "100" }),
      );
      assert.equal((await findCard()).currencies[0].creditBalance, "200.0000");
      assert.equal((await findCard()).currencies[0].debt, "0.0000");
      assert.equal(await bank(), "9700.0000");
      assert.equal((await refund("void", { eventId: id })).status, "conflict");
      const transfer = await created(
        refund("return_balance", { cardId, currency, amount: "200" }),
      );
      assert.equal(
        (await refund("return_balance", { cardId, currency, amount: "1" }))
          .status,
        "conflict",
      );
      assert.equal(await bank(), "9900.0000");
      assert.equal((await findCard()).currencies[0].creditBalance, "0.0000");
      assert.deepEqual(await listMovementTotals(client, owner, "2026-02-01"), [
        { kind: "expense", currency, amount: "100.0000" },
      ]);
      assert.equal(
        (await refund("void", { eventId: transfer })).status,
        "revised",
      );
      assert.equal(await bank(), "9700.0000");
      assert.equal(
        (
          await voidCreditOperation(client, owner, {
            eventId: later,
            idempotencyKey: randomUUID(),
          })
        ).status,
        "revised",
      );
      assert.equal((await findCard()).currencies[0].creditBalance, "300.0000");
    },
  ));

test("F2-09 CA-037: un reintegro mixto explícito y cancelación parcial del plan", () =>
  setup(async ({ client, cardId, findCard, bank, refund, buy, created }) => {
    const categoryId = randomUUID();
    const phone = randomUUID();
    await client.query(
      "INSERT INTO finance.categories (owner_id, id, kind, name) VALUES ($1, $2, 'expense', 'Internet'), ($1, $3, 'expense', 'Telefonía')",
      [owner, categoryId, phone],
    );
    const purchaseId = await created(
      buy({
        amount: "200",
        plan: { installmentAmount: "200", count: 3, firstPeriod: "2026-03" },
        mixed: {
          total: "3600",
          debitAmount: "3000",
          debitCardId: null,
          categories: [
            { ...debit, categoryId, amount: "2000" },
            { ...debit, categoryId: phone, amount: "1000" },
            { ...credit, categoryId, amount: "300.0001" },
            { ...credit, categoryId: phone, amount: "299.9999" },
          ],
        },
      }),
    );
    const pendingId = await created(
      refund("pending", { purchaseId, amount: "850" }, "2026-02-01"),
    );
    assert.equal((await findCard()).currencies[0].debt, "200.0000");
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-04-01")).length,
      1,
    );
    const parts = [
      { ...debit, categoryId, amount: "500" },
      { ...credit, categoryId, amount: "150" },
    ];
    const id = await created(
      refund("credit", { purchaseId, pendingId, parts }),
    );
    assert.equal(
      (await getRefundEntry(client, owner, id)).debtReduced,
      "150.0000",
    );
    assert.equal((await findCard()).currencies[0].debt, "50.0000");
    assert.equal(await bank(), "7500.0000");
    assert.equal(
      (await getRefundEntry(client, owner, pendingId)).remaining,
      "200.0000",
    );
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-04-01")).length,
      1,
    );
    const cancel = { purchaseId, pendingId, ordinals: [2] };
    const cancelledId = await created(refund("cancel_installments", cancel));
    assert.equal(
      (await getRefundEntry(client, owner, pendingId)).remaining,
      "0.0000",
    );
    assert.equal(await bank(), "7500.0000");
    assert.equal((await findCard()).currencies[0].debt, "50.0000");
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-03-01")).length,
      1,
    );
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-04-01")).length,
      0,
    );
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-05-01")).length,
      1,
    );
    assert.deepEqual(await listRefundTotals(client, owner, "2026-02-01"), [
      { currency, amount: "650.0000" },
    ]);
    const purchase = await getPurchaseRefunds(client, owner, purchaseId);
    assert.equal(
      purchase.parts.find(
        (part) => part.method === "debit" && part.categoryId === phone,
      ).remaining,
      "1000.0000",
    );
    assert.equal(
      (
        await refund("credit", {
          purchaseId,
          parts: [{ ...debit, categoryId, amount: "1500.0001" }],
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (
        await refund("credit", {
          purchaseId,
          parts: [{ ...credit, categoryId, amount: "100" }],
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (
        await reviseInstallments(
          client,
          owner,
          {
            action: "cancel-installments",
            eventId: purchaseId,
            expectedVersion: 1,
            fromPeriod: "2026-04",
            idempotencyKey: randomUUID(),
          },
          today,
        )
      ).status,
      "conflict",
    );
    const schedule = await saveCardCycle(client, owner, {
      scope: "schedule",
      cardId,
      version: 0,
      closingDay: 25,
      dueDay: 5,
      leadDays: 3,
      idempotencyKey: randomUUID(),
    });
    assert.equal(schedule.status, "created");
    const statement = await saveCardCycle(client, owner, {
      scope: "statement",
      cardId,
      currency,
      version: 0,
      period: "2026-02",
      officialAmount: "50.0000",
      minimumAmount: null,
      dueOn: null,
      idempotencyKey: randomUUID(),
    });
    assert.equal(statement.status, "created");
    const cycle = await loadCardCycle(
      client,
      owner,
      await findCard(),
      "2026-02",
      today,
    );
    assert.equal(cycle.summaries[0].credited, "150.0000");
    assert.equal(cycle.summaries[0].statement.officialAmount, "50.0000");
    assert.equal(
      (await refund("void", { eventId: cancelledId })).status,
      "revised",
    );
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-04-01")).length,
      1,
    );
  }));

test("F2-09: registra abono retroactivo y cancelaciones que cubren el mismo importe", () =>
  setup(async ({ client, bank, findCard, buy, refund, created }) => {
    const purchaseId = await created(
      buy({
        amount: "600",
        plan: { count: 3, installmentAmount: "200", firstPeriod: "2026-03" },
      }),
    );
    await created(buy({ effectiveOn: "2026-02-23", amount: "100" }));
    const first = await created(
      refund("cancel_installments", { purchaseId, ordinals: [1] }),
    );
    const id = await created(
      refund("credit", {
        purchaseId,
        parts: [{ ...credit, amount: "600" }],
        overlaps: true,
      }),
    );
    assert.equal(
      (await getRefundEntry(client, owner, id)).parts[0].overlap,
      "200.0000",
    );
    assert.equal((await findCard()).currencies[0].debt, "100.0000");
    assert.equal(await bank(), "10000");
    assert.equal((await refund("void", { eventId: first })).status, "conflict");
    assert.equal(
      (await refund("cancel_installments", { purchaseId, ordinals: [2] }))
        .status,
      "conflict",
    );
    const second = await created(
      refund("cancel_installments", {
        purchaseId,
        ordinals: [2],
        overlaps: true,
      }),
    );
    assert.equal(
      (await getRefundEntry(client, owner, second)).parts[0].overlap,
      "200.0000",
    );
    assert.equal(
      (await getPurchaseRefunds(client, owner, purchaseId)).parts[0].remaining,
      "0.0000",
    );
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-04-01")).length,
      0,
    );
    assert.equal(
      (await listMonthlyInstallments(client, owner, "2026-05-01")).length,
      1,
    );
    assert.deepEqual(await listRefundTotals(client, owner, "2026-02-01"), [
      { currency, amount: "600.0000" },
    ]);
  }));
