import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { formatBankAmount } from "../../src/domain/bank-balances.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import {
  listBudgetNotices,
  listBudgets,
  refreshBudgetNotices,
  saveBudget,
} from "../../src/server/budgets.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  loadStatistics,
  statisticsReady,
} from "../../src/server/statistics.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("QA-F01: redondeo del total convertido y cruces de los umbrales de presupuesto", async () => {
  const pool = new pg.Pool(testDatabaseConfig());
  const owner = randomUUID();
  const month = "2025-03";
  const range = { from: `${month}-01`, to: `${month}-31`, label: "Marzo" };
  const run = (work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const cases = [
    {
      day: "10",
      rate: "40.2474",
      total: "0.8049",
      visible: "0,80 UYU",
      limit: "100",
    },
    {
      day: "11",
      rate: "40.25",
      total: "0.8050",
      visible: "0,81 UYU",
      limit: "100",
    },
    {
      day: "12",
      rate: "39.996",
      total: "0.7999",
      visible: "0,80 UYU",
      limit: "1",
    },
    {
      day: "13",
      rate: "49.996",
      total: "0.9999",
      visible: "1,00 UYU",
      limit: "1",
    },
  ];
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }
    const categories = await run(async (c, id) => {
      const categories = [];
      for (const { day, rate, limit } of cases) {
        const categoryId = randomUUID();
        const date = `${month}-${day}`;
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,'expense')",
          [id, categoryId, `Precisión QA ${day}`],
        );
        await c.query(
          "INSERT INTO finance.fx_valuations(owner_id,effective_on,base_currency,quote_currency,observed_on,source,manual_rate) VALUES ($1,$2,'EUR','UYU',$2,'manual',$3)",
          [id, date, rate],
        );
        const budget = await saveBudget(
          c,
          id,
          {
            action: "save",
            idempotencyKey: randomUUID(),
            categoryId,
            currency: "UYU",
            amount: limit,
          },
          range.from,
        );
        assert.equal(budget.status, "created");
        const command = {
          kind: "expense",
          method: "debit",
          currency: "EUR",
          amount: "0.01",
          effectiveOn: date,
          categoryId,
          concept: "Gasto sintético QA-F01",
          note: null,
        };
        for (let i = 0; i < 2; i++) {
          const result = await saveMovement(c, id, {
            ...command,
            idempotencyKey: randomUUID(),
          });
          assert.equal(result.status, "created");
        }
        categories.push({ categoryId, budgetId: budget.id, date });
      }
      return categories;
    });
    const budgets = await run((c, id) => listBudgets(c, id, month));
    for (const [index, { categoryId }] of categories.entries()) {
      const { total, visible } = cases[index];
      const budget = budgets.find((item) => item.categoryId === categoryId);
      const report = await run(async (c, id) =>
        loadStatistics(
          c,
          id,
          range,
          null,
          range,
          { category: categoryId },
          await statisticsReady(c),
          "UYU",
        ),
      );
      assert.equal(budget.progress.consumed, total);
      assert.equal(report.totals[0].expense, total);
      assert.equal(report.totals[0].movements, 2);
      assert.equal(report.categories[0].amount, total);
      assert.equal(
        formatBankAmount({ amount: total, currency: "UYU" }),
        visible,
      );
    }
    const thresholds = async () =>
      (await run((c, id) => listBudgetNotices(c, id, month))).map(
        ({ budgetId, threshold }) => [budgetId, threshold],
      );
    const near80 = categories[2];
    const near100 = categories[3];
    assert.deepEqual(await thresholds(), [[near100.budgetId, 80]]);
    for (const { categoryId, date } of [near80, near100]) {
      const result = await run((c, id) =>
        saveMovement(c, id, {
          kind: "expense",
          method: "debit",
          currency: "UYU",
          amount: "0.0001",
          effectiveOn: date,
          categoryId,
          concept: "Cruce sintético QA-F01",
          note: null,
          idempotencyKey: randomUUID(),
        }),
      );
      assert.equal(result.status, "created");
    }
    assert.deepEqual(
      (await thresholds()).sort(),
      [
        [near100.budgetId, 100],
        [near100.budgetId, 80],
        [near80.budgetId, 80],
      ].sort(),
    );
  } finally {
    await pool.end();
  }
});

test("F3-07: cruces concurrentes, deduplicación, meses y RLS en PostgreSQL", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 8 });
  const owner = randomUUID();
  const foreign = randomUUID();
  const category = randomUUID();
  const direct = randomUUID();
  const today = "2026-11-10";
  const month = "2026-11";
  const run = (work, id = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId: id }), work);
  const notices = (period = month, id = owner) =>
    run((c, id) => listBudgetNotices(c, id, period), id);
  const expense = (amount, categoryId = category, period = month) => ({
    kind: "expense",
    currency: "UYU",
    method: "debit",
    amount,
    effectiveOn: `${period}-10`,
    concept: "Sintético F3-07",
    note: null,
    categoryId,
    idempotencyKey: randomUUID(),
  });
  const spend = (command, period = month) =>
    run(async (c, id) => {
      const result = await saveMovement(c, id, command);
      if (result.status === "created")
        await refreshBudgetNotices(c, id, period);
      return result.status;
    });
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
    const budget = await run(async (c, id) => {
      const budgets = [];
      for (const [key, name] of [
        [category, "Alimentación"],
        [direct, "Transporte"],
      ]) {
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,'expense')",
          [id, key, name],
        );
        const command = parseBudgetCommand(
          {
            action: "save",
            categoryId: key,
            currency: "UYU",
            amount: "10000",
            idempotencyKey: randomUUID(),
          },
          today,
        );
        const result = await saveBudget(c, id, command, today);
        assert.equal(result.status, "created");
        budgets.push(result.id);
      }
      return budgets[0];
    });

    assert.equal(await spend(expense("7999.9999")), "created");
    assert.deepEqual(await notices(), []);
    const crossing = expense("0.0001");
    const [first, retry] = await Promise.all([
      spend(crossing),
      spend(crossing),
      notices(),
      notices(),
    ]);
    assert.deepEqual([first, retry].sort(), ["created", "replayed"]);
    await Promise.all([
      spend(expense("1000.0000")),
      spend(expense("1000.0000")),
      notices(),
    ]);
    const directCrossing = expense("11000.0000", direct);
    assert.equal(await spend(directCrossing), "created");
    const expected = [
      ["Transporte", 100, 110],
      ["Alimentación", 100, 100],
      ["Alimentación", 80, 80],
    ];
    for (const result of await Promise.all([notices(), notices(), notices()]))
      assert.deepEqual(
        result.map(({ categoryName, threshold, percent }) => [
          categoryName,
          threshold,
          percent,
        ]),
        expected,
      );
    assert.deepEqual(await notices(month, foreign), []);
    assert.equal(
      await run(
        async (c) =>
          (await c.query("SELECT * FROM finance.budget_notices")).rowCount,
        foreign,
      ),
      0,
    );
    const insert = `INSERT INTO finance.budget_notices(owner_id,budget_id,month,threshold,percent,currency)
      VALUES ($1,$2,'2026-12-01',80,80,'UYU')`;
    await assert.rejects(run((c) => c.query(insert, [owner, budget]), foreign));
    await assert.rejects(
      run((c) => c.query(insert, [foreign, budget]), foreign),
    );
    await assert.rejects(
      run((c) => c.query("DELETE FROM finance.budget_notices")),
    );

    // A changed limit can bring consumption back to 80%; keep the original
    // records and avoid a late warning for a budget that jumped to 100%.
    await run(async (c, id) => {
      const {
        rows: [transport],
      } = await c.query(
        "SELECT id FROM finance.budget_limits WHERE owner_id=$1 AND category_id=$2",
        [id, direct],
      );
      const command = parseBudgetCommand(
        {
          action: "edit",
          budgetId: transport.id,
          version: 1,
          amount: "13000",
          currency: "UYU",
          idempotencyKey: randomUUID(),
        },
        today,
      );
      assert.equal((await saveBudget(c, id, command, today)).status, "saved");
    });
    assert.deepEqual(
      (await notices()).map(({ categoryName, threshold, percent }) => [
        categoryName,
        threshold,
        percent,
      ]),
      expected,
    );
    assert.deepEqual(await notices("2026-12"), []);
    assert.equal(
      await spend(expense("8000.0000", category, "2026-12"), "2026-12"),
      "created",
    );
    assert.deepEqual(
      (await notices("2026-12")).map(({ budgetId, threshold }) => [
        budgetId,
        threshold,
      ]),
      [[budget, 80]],
    );
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
