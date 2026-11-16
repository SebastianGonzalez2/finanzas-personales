import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import {
  withOwnerTransaction,
  setOwnerContext,
} from "../../src/db/owner-context.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { listBudgets, saveBudget } from "../../src/server/budgets.ts";
import {
  saveOpeningBalance,
  listBankBalances,
} from "../../src/server/bank-balances.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  saveCreditOperation,
  reviseInstallments,
} from "../../src/server/credit-operations.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { saveCard } from "../../src/server/cards.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import { saveSharedExpense } from "../../src/server/shared-expenses.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { saveRefund } from "../../src/server/refunds.ts";

test("F3-06 CA-043: historial, jerarquía, cuotas fijas, RLS, reintentos y concurrencia real", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 5 });
  const a = `budget-a-${randomUUID()}`,
    b = `budget-b-${randomUUID()}`;
  const parent = randomUUID(),
    child = randomUUID();
  const run = (work, ownerId = a) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const save = (data, today = "2026-11-10", owner = a) => {
    const command = parseBudgetCommand(
      { idempotencyKey: randomUUID(), ...data },
      today,
    );
    assert.ok(!("error" in command));
    return run((c, id) => saveBudget(c, id, command, today), owner);
  };
  const list = (month, owner = a) =>
    run((c, id) => listBudgets(c, id, month), owner);
  const expense = (
    categoryId,
    amount,
    currency = "UYU",
    effectiveOn = "2026-11-10",
  ) =>
    run((c, id) =>
      saveMovement(c, id, {
        kind: "expense",
        currency,
        amount,
        effectiveOn,
        method: "debit",
        concept: "Sintético F3-06",
        note: null,
        categoryId,
        idempotencyKey: randomUUID(),
      }),
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
    await run(async (c, id) => {
      for (const [category, name, ancestor] of [
        [parent, "Alimentación", null],
        [child, "Supermercado", parent],
      ])
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind,parent_id) VALUES ($1,$2,$3,'expense',$4)",
          [id, category, name, ancestor],
        );
      for (const currency of ["UYU", "USD", "EUR"])
        await saveOpeningBalance(c, id, {
          currency,
          amount: "20000.0000",
          asOfDate: "2026-01-01",
        });
    });
    const command = {
      action: "save",
      categoryId: parent,
      currency: "UYU",
      amount: "10000",
      idempotencyKey: randomUUID(),
    };
    const copies = await Promise.all([save(command), save(command)]);
    assert.deepEqual(copies.map((x) => x.status).sort(), [
      "created",
      "replayed",
    ]);
    const id = copies[0].id;
    assert.equal(
      (await save({ ...command, amount: "10001" })).status,
      "conflict",
    );
    assert.equal(
      (await save({ ...command, idempotencyKey: randomUUID() })).status,
      "conflict",
    );
    assert.equal(
      (
        await save(
          { action: "save", categoryId: parent, currency: "USD", amount: "1" },
          undefined,
          b,
        )
      ).status,
      "not-found",
    );
    await save({
      action: "save",
      categoryId: child,
      currency: "UYU",
      amount: "5000",
    });
    assert.equal((await expense(child, "4000.0000")).status, "created");
    assert.equal((await expense(parent, "0.0001")).status, "created");
    let rows = await list("2026-11");
    assert.equal(rows.find((x) => x.id === id).progress.consumed, "4000.0001");
    assert.equal(
      rows.find((x) => x.categoryId === child).progress.consumed,
      "4000.0000",
    );
    const balances = await run(listBankBalances);

    // Two stale edits race: exactly one commits, the other must conflict.
    const edits = await Promise.all(
      ["12000", "13000"].map((amount) =>
        save(
          { action: "edit", budgetId: id, version: 1, currency: "UYU", amount },
          "2026-12-01",
        ),
      ),
    );
    assert.deepEqual(edits.map((x) => x.status).sort(), ["conflict", "saved"]);
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).monthlyLimit,
      "10000.0000",
    );
    const customary = (await list("2026-12")).find(
      (x) => x.id === id,
    ).monthlyLimit;
    const december = {
      action: "exception",
      budgetId: id,
      version: 2,
      month: "2026-12",
      amount: "15000",
      idempotencyKey: randomUUID(),
    };
    assert.equal((await save(december, "2026-12-31")).status, "saved");
    const retryInJanuary = (data) =>
      run((c, owner) =>
        saveBudget(
          c,
          owner,
          parseBudgetCommand(data, "2027-01-01", {
            checkExceptionWindow: false,
          }),
          "2027-01-01",
        ),
      );
    assert.deepEqual(await retryInJanuary(december), {
      status: "replayed",
      id,
    });
    assert.equal(
      (
        await retryInJanuary({
          ...december,
          version: 3,
          idempotencyKey: randomUUID(),
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).effectiveLimit,
      "15000.0000",
    );
    assert.equal(
      (await list("2027-01")).find((x) => x.id === id).effectiveLimit,
      customary,
    );
    assert.equal(
      (await list("2027-01")).find((x) => x.id === id).progress.consumed,
      "0",
    );
    assert.equal(
      (
        await save(
          {
            action: "edit",
            budgetId: id,
            version: 3,
            currency: "EUR",
            amount: "220",
          },
          "2027-01-01",
        )
      ).status,
      "saved",
    );
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).currency,
      "UYU",
    );
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).effectiveLimit,
      "15000.0000",
    );
    assert.equal(
      (await list("2027-01")).find((x) => x.id === id).currency,
      "EUR",
    );
    await run(async (c, owner) => {
      assert.equal(
        (
          await c.query(
            "SELECT 1 FROM finance.budget_limits WHERE owner_id=$1",
            [a],
          )
        ).rowCount,
        0,
      );
      assert.deepEqual(await listBudgets(c, a, "2026-12"), []);
      await assert.rejects(
        c.query(
          "INSERT INTO finance.budget_limits(owner_id,id,category_id) VALUES ($1,$2,$3)",
          [a, randomUUID(), parent],
        ),
      );
      assert.equal(owner, b);
    }, b).then(
      () => assert.fail("SQL error must roll back"),
      (err) => assert.equal(err.message, "Operación de datos rechazada"),
    );
    assert.deepEqual(await list("2026-12", b), []);
    assert.equal(
      (
        await save(
          { action: "remove", budgetId: id, version: 4 },
          "2027-01-01",
          b,
        )
      ).status,
      "not-found",
    );
    assert.deepEqual(await run(listBankBalances), balances);

    // Missing FX is visible; adding a quote resolves it and freezes the rate.
    assert.equal((await expense(child, "20.0000", "USD")).status, "created");
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).progress,
      null,
    );
    await pool.query(`INSERT INTO finance.fx_reference_refreshes(year,retry_at)
      VALUES (2026,now()+interval '1 hour') ON CONFLICT (year) DO NOTHING`);
    const quote = {
      action: "quote",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: "40",
      effectiveOn: "2026-11-09",
      idempotencyKey: randomUUID(),
    };
    assert.equal((await save(quote)).status, "created");
    assert.equal((await save(quote)).status, "replayed");
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).progress.consumed,
      "4800.0001",
    );
    await save({ ...quote, rate: "50", idempotencyKey: randomUUID() });
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).progress.consumed,
      "4800.0001",
    );
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).references[0].source,
      "manual",
    );

    // A legacy plan retains its registration-time quote across installments.
    // The fixture writes the plan using the older database contract.
    const today = bankReferenceToday(),
      period = today.slice(0, 7);
    await save(
      {
        ...quote,
        effectiveOn: today,
        rate: "40",
        idempotencyKey: randomUUID(),
      },
      today,
    );
    const card = await run((c, owner) =>
      saveCard(c, owner, {
        action: "create",
        kind: "credit",
        name: "Sintética",
        issuer: null,
        currencies: [{ currency: "USD", limit: null }],
        idempotencyKey: randomUUID(),
      }),
    );
    const purchase = parseCreditCommand(
      {
        action: "purchase",
        cardId: card.id,
        currency: "USD",
        amount: "60",
        concept: "Cuotas sintéticas",
        categoryId: child,
        effectiveOn: today,
        covered: false,
        plan: { installmentAmount: "20", count: 3, firstPeriod: period },
        idempotencyKey: randomUUID(),
      },
      today,
    );
    assert.ok(!("error" in purchase));
    const bought = await run(async (c, owner) => {
      const result = await saveCreditOperation(c, owner, {
        ...purchase,
        plan: null,
      });
      assert.equal(result.status, "created");
      await c.query(
        `INSERT INTO finance.installment_plans
           (owner_id,event_id,currency,version,installment_amount,installment_count,active_count,first_period,change_type)
         VALUES ($1,$2,'USD',1,20,3,3,$3,'created')`,
        [owner, result.id, period + "-01"],
      );
      return result;
    });
    assert.equal(bought.status, "created");
    await save(
      {
        ...quote,
        effectiveOn: today,
        rate: "90",
        idempotencyKey: randomUUID(),
      },
      today,
    );
    // Budget is UYU before January; select a future month with a UYU child limit.
    const next = new Date(`${period}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const nextMonth = next.toISOString().slice(0, 7);
    const future = (await list(nextMonth)).find((x) => x.categoryId === child);
    assert.equal(future.progress.consumed, "800.0000");
    await run(async (c) => {
      const {
        rows: [rate],
      } = await c.query(
        "SELECT q.rate::text FROM finance.budget_rates r JOIN finance.budget_quotes q ON (q.owner_id,q.id)=(r.owner_id,r.quote_id) WHERE r.event_id=$1 AND r.to_currency='UYU'",
        [bought.id],
      );
      assert.equal(rate.rate, "40");
      assert.equal(
        (
          await c.query(
            "SELECT 1 FROM finance.bank_effects WHERE event_id=$1",
            [bought.id],
          )
        ).rowCount,
        0,
      );
    });
    // Explicit cancellation removes future installment consumption, not bank money.
    const revised = await run((c, owner) =>
      reviseInstallments(
        c,
        owner,
        {
          action: "cancel-installments",
          eventId: bought.id,
          expectedVersion: 1,
          fromPeriod: nextMonth,
          idempotencyKey: randomUUID(),
        },
        today,
      ),
    );
    assert.equal(revised.status, "created");
    assert.equal(
      (await list(nextMonth)).find((x) => x.categoryId === child).progress
        .consumed,
      "0",
    );

    await save({ action: "remove", budgetId: id, version: 4 }, "2027-02-01");
    assert.ok(!(await list("2027-02")).some((x) => x.id === id));
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).effectiveLimit,
      "15000.0000",
    );
    const revived = await save(
      { action: "save", categoryId: parent, currency: "UYU", amount: "7000" },
      "2027-03-01",
    );
    assert.equal(revived.id, id);
    assert.equal((await list("2027-03")).find((x) => x.id === id).version, 6);
  } finally {
    try {
      if (installed)
        await pool.query(
          "DROP SCHEMA finance,finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});

test("F3-06: consumo propio, reparto mixto y reembolso posterior sin doble gasto", async () => {
  const c = new pg.Client(testDatabaseConfig());
  await c.connect();
  const owner = randomUUID(),
    parent = randomUUID(),
    child = randomUUID(),
    today = "2026-02-20";
  const parsed = (parser, data) => {
    const command = parser({ ...data, idempotencyKey: randomUUID() }, today);
    assert.ok(!("error" in command), command.error);
    return command;
  };
  try {
    await c.query("BEGIN");
    await migrateInTransaction(c);
    await setOwnerContext(c, owner);
    await c.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name,parent_id) VALUES ($1,$2,'expense','Padre',null),($1,$3,'expense','Hija',$2)",
      [owner, parent, child],
    );
    await saveOpeningBalance(c, owner, {
      currency: "UYU",
      amount: "20000.0000",
      asOfDate: "2026-01-01",
    });
    for (const categoryId of [parent, child])
      await saveBudget(
        c,
        owner,
        parsed(parseBudgetCommand, {
          action: "save",
          categoryId,
          currency: "UYU",
          amount: "10000",
        }),
        "2026-01-01",
      );
    const movement = (amount, effectiveOn) =>
      saveMovement(c, owner, {
        kind: "expense",
        currency: "UYU",
        amount,
        effectiveOn,
        method: "debit",
        concept: "Sintético",
        note: null,
        categoryId: parent,
        idempotencyKey: randomUUID(),
      });
    const january = await movement("500.0000", "2026-01-20");
    await movement("3000.0000", today);
    assert.equal(
      (
        await saveRefund(
          c,
          owner,
          parsed(parseRefundCommand, {
            action: "credit",
            purchaseId: january.id,
            effectiveOn: today,
            parts: [{ method: "debit", categoryId: parent, amount: "500" }],
          }),
          today,
        )
      ).status,
      "created",
    );
    const { id: cardId } = await saveCard(c, owner, {
      action: "create",
      kind: "credit",
      name: "Sintética",
      issuer: null,
      currencies: [{ currency: "UYU", limit: null }],
      idempotencyKey: randomUUID(),
    });
    const mixed = parsed(parseCreditCommand, {
      action: "purchase",
      cardId,
      currency: "UYU",
      amount: "100",
      effectiveOn: today,
      concept: "Mixta",
      covered: false,
      plan: { count: 2, installmentAmount: "50", firstPeriod: "2026-02" },
      mixed: {
        total: "300",
        debitAmount: "200",
        debitCardId: null,
        categories: [
          { method: "debit", categoryId: child, amount: "150" },
          { method: "debit", categoryId: parent, amount: "50" },
          { method: "credit", categoryId: child, amount: "40" },
          { method: "credit", categoryId: parent, amount: "60" },
        ],
      },
    });
    assert.equal(
      (await saveCreditOperation(c, owner, mixed)).status,
      "created",
    );
    for (const data of [
      {
        method: "debit",
        amount: "400",
        ownAmount: "100",
        parties: [{ name: "Persona", amount: "300" }],
      },
      {
        method: "credit",
        amount: "300",
        cardId,
        cardAmount: "300",
        covered: false,
        ownAmount: "100",
        parties: [{ name: "Persona", amount: "200" }],
        plan: { count: 3, installmentAmount: "100", firstPeriod: "2026-02" },
      },
      { method: "third_party", amount: "100", creditor: { name: "Persona" } },
    ]) {
      const command = parsed(parseSharedExpense, {
        action: "create",
        currency: "UYU",
        effectiveOn: today,
        concept: "Compartida",
        categoryId: child,
        ...data,
      });
      assert.equal(
        (await saveSharedExpense(c, owner, command)).status,
        "created",
      );
    }
    const consumption = async (month, category) =>
      (await listBudgets(c, owner, month)).find(
        (x) => x.categoryId === category,
      ).progress.consumed;
    assert.equal(await consumption("2026-01", parent), "500.0000");
    assert.equal(await consumption("2026-02", parent), "3483.3334");
    assert.equal(await consumption("2026-02", child), "403.3334");
    assert.equal(await consumption("2026-03", parent), "83.3333");
    assert.equal(await consumption("2026-03", child), "53.3333");
    const before = await listBankBalances(c, owner);
    await listBudgets(c, owner, "2026-02");
    assert.deepEqual(await listBankBalances(c, owner), before);
    await c.query("SAVEPOINT immutable");
    await assert.rejects(
      c.query("UPDATE finance.budget_changes SET amount=1 WHERE owner_id=$1", [
        owner,
      ]),
    );
    await c.query("ROLLBACK TO SAVEPOINT immutable");
  } finally {
    await c.query("ROLLBACK");
    await c.end();
  }
});
