import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import {
  listBankBalances,
  saveOpeningBalance,
  saveBalanceAdjustment,
} from "../../src/server/bank-balances.ts";
import { loadCardCycle, saveCardCycle } from "../../src/server/card-cycles.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import {
  reviseInstallments,
  saveCreditOperation,
  voidCreditOperation,
} from "../../src/server/credit-operations.ts";
import {
  findHistoryEntry,
  historyRevisions,
  listHistory,
} from "../../src/server/history.ts";
import { mixedPurchaseDetail } from "../../src/server/mixed-purchases.ts";
import {
  listMovementTotals,
  listRecentMovements,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F2-05: CA-025/026, compra única, importes exactos, corrección y aislamiento", async () => {
  const client = new pg.Client(testDatabaseConfig());
  const owner = "mixed-owner-a";
  const other = "mixed-owner-b";
  const today = "2026-02-09";
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    const createCard = async (ownerId, kind, currency = "UYU") =>
      (
        await saveCard(client, ownerId, {
          action: "create",
          kind,
          name: kind,
          issuer: null,
          currencies: [{ currency, limit: null }],
          idempotencyKey: randomUUID(),
        })
      ).id;
    await setOwnerContext(client, other);
    const foreignDebit = await createCard(other, "debit");
    const foreignCategory = randomUUID();
    await client.query(
      "INSERT INTO finance.categories (owner_id, id, kind, name) VALUES ($1, $2, 'expense', 'Categoría B')",
      [other, foreignCategory],
    );
    await setOwnerContext(client, owner);
    const cardId = await createCard(owner, "credit");
    const debitCardId = await createCard(owner, "debit");
    const usdDebit = await createCard(owner, "debit", "USD");
    const categoryId = randomUUID();
    await client.query(
      "INSERT INTO finance.categories (owner_id, id, kind, name) VALUES ($1, $2, 'expense', 'Categoría A')",
      [owner, categoryId],
    );
    await saveOpeningBalance(client, owner, {
      currency: "UYU",
      amount: "10000.0000",
      asOfDate: "2026-01-01",
    });
    const draft = {
      cardId,
      action: "purchase",
      currency: "UYU",
      effectiveOn: "2026-01-20",
      idempotencyKey: randomUUID(),
      concept: "Compra sintética",
      covered: false,
      amount: "1000",
      mixed: {
        total: "3000",
        debitAmount: "2000",
        debitCardId,
        categories: [],
      },
    };
    const parse = (fields) => {
      const command = parseCreditCommand(fields, today);
      assert.ok(!("error" in command), command.error);
      return command;
    };
    const save = (fields, actor = owner) =>
      saveCreditOperation(client, actor, parse(fields));
    const bank = async () => {
      const [row] = await listBankBalances(client, owner);
      return row.calculatedAmount ?? row.amount;
    };
    const debt = async () =>
      (await listCards(client, owner)).find(({ id }) => id === cardId)
        .currencies[0].debt;
    const total = async (month) =>
      (await listMovementTotals(client, owner, `2026-${month}-01`))[0]?.amount;

    for (const bad of [
      { ...draft.mixed, total: "3000.0001" },
      {
        ...draft.mixed,
        categories: [{ method: "credit", categoryId, amount: "1000" }],
      },
    ])
      assert.ok("error" in parseCreditCommand({ ...draft, mixed: bad }, today));

    for (const invalid of [
      { ...draft.mixed, debitCardId: foreignDebit },
      { ...draft.mixed, debitCardId: usdDebit },
      { ...draft.mixed, total: "12000", debitAmount: "11000" },
      {
        ...draft.mixed,
        categories: [
          { method: "debit", categoryId, amount: "2000" },
          { method: "credit", categoryId: foreignCategory, amount: "1000" },
        ],
      },
    ])
      assert.equal(
        (await save({ ...draft, mixed: invalid })).status,
        "conflict",
      );
    assert.equal(await bank(), "10000.0000");
    assert.equal(await debt(), "0");
    assert.equal(await total("01"), undefined);

    const first = await save(draft);
    assert.equal(first.status, "created");
    assert.deepEqual(await save(draft), { status: "replayed", id: first.id });
    assert.equal(await bank(), "8000.0000");
    assert.equal(await debt(), "1000.0000");
    assert.equal(await total("01"), "3000.0000");
    assert.deepEqual(
      (await listRecentMovements(client, owner, "expense", true)).map(
        ({ amount }) => amount,
      ),
      ["3000.0000"],
    );

    const financed = {
      ...draft,
      idempotencyKey: randomUUID(),
      concept: "Compra financiada",
      amount: "6000",
      plan: { installmentAmount: "2000", count: 3, firstPeriod: "2026-02" },
      mixed: {
        ...draft.mixed,
        total: "12000",
        debitAmount: "6000",
        categories: [
          { method: "debit", categoryId, amount: "6000" },
          { method: "credit", categoryId, amount: "2000.0001" },
          { method: "credit", categoryId: null, amount: "3999.9999" },
        ],
      },
    };
    const { id } = await save(financed);
    assert.equal(await bank(), "2000.0000");
    assert.equal(await debt(), "7000.0000");
    assert.deepEqual(
      [
        await total("01"),
        await total("02"),
        await total("03"),
        await total("04"),
      ],
      ["9000.0000", "2000.0000", "2000.0000", "2000.0000"],
    );
    assert.equal(
      (await findHistoryEntry(client, owner, id, false)).amount,
      "12000.0000",
    );
    assert.deepEqual(
      (
        await listHistory(
          client,
          owner,
          parseHistoryParams({
            method: "debit",
            category: categoryId,
            min: "12000",
          }),
        )
      ).entries.map((row) => row.id),
      [id],
    );
    assert.equal(
      (await mixedPurchaseDetail(client, owner, id)).categories.length,
      3,
    );
    const { rows: amounts } = await client.query(
      `SELECT category_id, sum(amount)::text AS amount FROM finance.mixed_purchase_expenses
        WHERE id = $1 AND method = 'credit' GROUP BY category_id ORDER BY category_id NULLS LAST`,
      [id],
    );
    assert.deepEqual(amounts, [
      { category_id: categoryId, amount: "2000.0001" },
      { category_id: null, amount: "3999.9999" },
    ]);

    await saveCardCycle(client, owner, {
      scope: "schedule",
      cardId,
      version: 0,
      idempotencyKey: randomUUID(),
      closingDay: 25,
      dueDay: 10,
      leadDays: 3,
    });
    const card = (await listCards(client, owner)).find(
      ({ id }) => id === cardId,
    );
    assert.equal(
      (await loadCardCycle(client, owner, card, "2026-01", today)).summaries[0]
        .estimate,
      "1000.0000",
    );
    assert.equal(
      (await loadCardCycle(client, owner, card, "2026-02", today)).summaries[0]
        .estimate,
      "2000.0000",
    );

    await setOwnerContext(client, other);
    assert.equal(await mixedPurchaseDetail(client, other, id), undefined);
    assert.equal(
      (
        await client.query(
          "SELECT 1 FROM finance.mixed_purchase_expenses WHERE id = $1",
          [id],
        )
      ).rowCount,
      0,
    );
    assert.equal((await save(financed, other)).status, "not-found");
    await setOwnerContext(client, owner);

    const edit = {
      action: "edit-installments",
      eventId: id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (
        await reviseInstallments(
          client,
          owner,
          { ...edit, plan: { ...financed.plan, installmentAmount: "1900" } },
          today,
        )
      ).status,
      "conflict",
    );
    assert.equal(
      (
        await reviseInstallments(
          client,
          owner,
          { ...edit, plan: { ...financed.plan, firstPeriod: "2026-03" } },
          today,
        )
      ).status,
      "created",
    );
    assert.equal(await total("02"), undefined);
    assert.equal(await total("05"), "2000.0000");

    await saveBalanceAdjustment(client, owner, {
      currency: "UYU",
      amount: "2500.0000",
      asOfDate: "2026-02-01",
      note: null,
      idempotencyKey: randomUUID(),
    });
    const correction = { eventId: id, planVersion: 2 };
    const replacement = {
      ...financed,
      idempotencyKey: randomUUID(),
      concept: "Corrección sintética",
      plan: undefined,
      amount: "5000",
      mixed: {
        ...financed.mixed,
        total: "10500",
        debitAmount: "5500",
        categories: [],
        correction,
      },
    };
    assert.equal(
      (
        await save({
          ...replacement,
          mixed: {
            ...replacement.mixed,
            correction: { ...correction, planVersion: 1 },
          },
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (await save({ ...replacement, effectiveOn: today })).status,
      "conflict",
    );
    assert.equal(
      (await findHistoryEntry(client, owner, id, false)).status,
      "confirmed",
    );
    assert.equal(await debt(), "7000.0000");
    const revised = await save(replacement);
    assert.equal(revised.status, "created");
    assert.deepEqual(await save(replacement), {
      status: "replayed",
      id: revised.id,
    });
    assert.equal(await bank(), "2500.0000");
    assert.equal(await debt(), "6000.0000");
    assert.equal(await total("01"), "13500.0000");
    assert.equal(await total("03"), undefined);
    assert.equal(
      (await historyRevisions(client, owner, id))[0].related,
      revised.id,
    );
    assert.equal(
      (
        await voidCreditOperation(client, owner, {
          action: "void",
          eventId: revised.id,
          idempotencyKey: randomUUID(),
        })
      ).status,
      "revised",
    );
    assert.equal(await bank(), "2500.0000");
    assert.equal(await debt(), "1000.0000");
    assert.equal(await total("01"), "3000.0000");
    assert.equal(
      (
        await save({
          action: "adjustment",
          effectiveOn: draft.effectiveOn,
          currency: "UYU",
          cardId,
          amount: "1200",
          expectedDebt: "1000",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "created",
    );
    const sameDay = {
      ...draft,
      idempotencyKey: randomUUID(),
      mixed: {
        ...draft.mixed,
        correction: { eventId: first.id, planVersion: 0 },
      },
    };
    assert.equal((await save(sameDay)).status, "conflict");
    assert.equal((await save({ ...sameDay, covered: true })).status, "created");
    assert.equal(await debt(), "1200.0000");
    assert.equal(
      (
        await save({
          action: "payment",
          cardId,
          idempotencyKey: randomUUID(),
          effectiveOn: today,
          lines: [
            {
              currency: "UYU",
              amount: "100",
              bankCurrency: "UYU",
              bankAmount: "100",
            },
          ],
        })
      ).status,
      "created",
    );
    assert.equal(await debt(), "1100.0000");
    assert.equal(await bank(), "2400.0000");
    assert.equal(await total("02"), undefined);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
