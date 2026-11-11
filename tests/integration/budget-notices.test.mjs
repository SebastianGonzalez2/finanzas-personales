import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listBudgetNotices,
  refreshBudgetNotices,
  saveBudget,
} from "../../src/server/budgets.ts";
import { saveMovement } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

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
      await saveOpeningBalance(c, id, {
        currency: "UYU",
        amount: "50000.0000",
        asOfDate: "2026-01-01",
      });
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
    const bankBefore = await run(listBankBalances);
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
    assert.deepEqual(await run(listBankBalances), bankBefore);
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
