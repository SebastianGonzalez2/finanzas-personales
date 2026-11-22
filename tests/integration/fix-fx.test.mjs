import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  parseStatisticsParams,
  statisticsHistoryRange,
} from "../../src/domain/statistics.ts";
import {
  loadStatistics,
  prepareStatisticsFx,
  statisticsReady,
  statisticsReferenceDates,
} from "../../src/server/statistics.ts";
import {
  budgetReferenceDates,
  listBudgetNotices,
  listBudgets,
  saveBudget,
} from "../../src/server/budgets.ts";
import { saveMovement } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("FIX-FX: seis cuotas, compra retroactiva, estimaciones, fijación y avisos", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 6 });
  const owner = randomUUID();
  const other = randomUUID();
  const installmentCategory = randomUUID();
  const ordinaryCategory = randomUUID();
  const fixtureToday = "2025-01-27";
  const fixedToday = "2025-06-30";
  const run = (work, ownerId = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const budget = (month, category, today = fixedToday) =>
    run(async (c, id) =>
      (await listBudgets(c, id, month, today)).find(
        ({ categoryId }) => categoryId === category,
      ),
    );
  const expense = (amount) =>
    run((c, id) =>
      saveMovement(c, id, {
        kind: "expense",
        currency: "USD",
        amount,
        effectiveOn: "2025-01-19",
        method: "debit",
        concept: "Compra retroactiva sintética",
        note: null,
        categoryId: ordinaryCategory,
        idempotencyKey: randomUUID(),
      }),
    );
  const rate = (date, amount, source = "datosuruguay") =>
    pool.query(
      "INSERT INTO finance.fx_reference_rates(base_currency,quote_currency,observed_on,source,rate) VALUES ('USD','UYU',$1,$2,$3)",
      [date, source, amount],
    );
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
    await pool.query(
      "INSERT INTO finance.fx_reference_refreshes(year,retry_at,primary_pairs,backup_pairs) VALUES (2025,now()+interval '1 hour',ARRAY['USD/UYU'],ARRAY['USD/UYU'])",
    );
    for (const [date, value, source] of [
      ["2024-12-31", "40"],
      ["2025-01-18", "50", "frankfurter"],
      ["2025-01-31", "41"],
      ["2025-03-01", "42"],
      ["2025-04-01", "43"],
      ["2025-05-01", "44"],
      ["2025-06-01", "45"],
    ])
      await rate(date, value, source);
    await run(async (c, id) => {
      for (const [categoryId, name] of [
        [installmentCategory, "Cuotas sintéticas"],
        [ordinaryCategory, "Compras sintéticas"],
      ]) {
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,'expense')",
          [id, categoryId, name],
        );
        assert.equal(
          (
            await saveBudget(
              c,
              id,
              {
                action: "save",
                categoryId,
                currency: "UYU",
                amount: "5000",
                idempotencyKey: randomUUID(),
              },
              fixtureToday,
            )
          ).status,
          "created",
        );
      }
    });
    // SIMP-04: la compra en seis cuotas es un gasto independiente de tarjetas.
    const result = await run((c, id) =>
      saveMovement(c, id, {
        kind: "expense",
        currency: "USD",
        amount: "600",
        effectiveOn: "2025-01-19",
        method: "unspecified",
        concept: "Compra de seis cuotas",
        note: null,
        categoryId: installmentCategory,
        plan: { installmentAmount: "100", count: 6, firstPeriod: "2025-01" },
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(result.status, "created");
    assert.equal((await expense("80.0000")).status, "created");
    assert.equal(
      (await budget("2025-01", ordinaryCategory)).progress.consumed,
      "4000.0000",
    );
    assert.deepEqual((await budget("2025-01", ordinaryCategory)).references, [
      {
        fromCurrency: "USD",
        rate: "50",
        date: "2025-01-18",
        source: "frankfurter",
        provisional: false,
      },
    ]);
    const notices = () => run((c, id) => listBudgetNotices(c, id, "2025-01"));
    assert.equal(
      (await notices()).find((row) => row.categoryName === "Compras sintéticas")
        .threshold,
      80,
    );
    assert.equal((await expense("20.0000")).status, "created");
    await Promise.all([notices(), notices()]);
    assert.deepEqual(
      (await notices())
        .filter((row) => row.categoryName === "Compras sintéticas")
        .map(({ threshold }) => threshold),
      [100, 80],
    );

    assert.deepEqual(
      await run((c, id) =>
        budgetReferenceDates(c, id, "2025-02", fixtureToday),
      ),
      [fixtureToday],
    );
    const estimate = await budget("2025-02", installmentCategory, fixtureToday);
    assert.equal(estimate.progress.consumed, "5000.0000");
    assert.equal(estimate.references[0].provisional, true);
    const valuations = () =>
      run(async (c) =>
        (
          await c.query(
            "SELECT effective_on::text FROM finance.fx_valuations WHERE base_currency='USD' AND quote_currency='UYU' ORDER BY effective_on",
          )
        ).rows.map(({ effective_on }) => effective_on),
      );
    assert.ok(!(await valuations()).includes("2025-02-01"));
    const report = async (display, from, to) => {
      const parsed = parseStatisticsParams(
        {
          from,
          to,
          display,
          category: installmentCategory,
        },
        to,
      );
      assert.ok(!("error" in parsed));
      const { range, previous, filters } = parsed;
      const history = statisticsHistoryRange(range, to);
      const schema = await run(statisticsReady);
      if (from === "2025-01-01" && !(await valuations()).includes(from)) {
        const dates = await run((c, id) =>
          statisticsReferenceDates(
            c,
            id,
            range,
            previous,
            history,
            filters,
            schema,
            display,
          ),
        );
        assert.ok(dates.includes(from));
      }
      await run((c, id) =>
        prepareStatisticsFx(
          c,
          id,
          range,
          previous,
          history,
          filters,
          schema,
          display,
          to,
        ),
      );
      return run((c, id) =>
        loadStatistics(
          c,
          id,
          range,
          previous,
          history,
          filters,
          schema,
          display,
        ),
      );
    };
    const long = await report("UYU", "2025-01-01", "2026-06-30");
    assert.equal(long.historyRange.from, "2025-07-01");
    assert.deepEqual(long.fx.missingFlows, []);
    assert.equal(
      long.totals.find(({ currency }) => currency === "UYU").expense,
      "25500.0000",
    );
    assert.equal(long.entries.length, 6);
    assert.ok(
      long.entries.every(
        (entry) => entry.currency === "USD" && entry.amount === "100.0000",
      ),
    );

    const months = Array.from(
      { length: 6 },
      (_, index) => "2025-0" + (index + 1),
    );
    for (const [index, month] of months.entries()) {
      const progress = await Promise.all([
        budget(month, installmentCategory),
        budget(month, installmentCategory),
      ]);
      assert.deepEqual(progress[0], progress[1]);
      assert.equal(progress[0].progress.consumed, 4000 + 100 * index + ".0000");
      const entry = long.entries.find(({ date }) => date === month + "-01");
      assert.equal(progress[0].references[0].provisional, false);
      assert.equal(progress[0].references[0].rate, entry.quote.rate);
      assert.equal(progress[0].references[0].date, entry.quote.observed);
      assert.equal(progress[0].references[0].source, entry.quote.source);
    }
    await rate("2025-02-01", "99");
    assert.equal(
      (await budget("2025-02", installmentCategory)).progress.consumed,
      "4100.0000",
    );
    const pinnedDates = await valuations();
    for (const date of [...months.map((month) => month + "-01"), "2025-01-19"])
      assert.ok(pinnedDates.includes(date));
    assert.deepEqual(
      await run((c, id) => listBudgets(c, id, "2025-02", fixedToday), other),
      [],
    );
    const original = await run((c) =>
      c.query(
        "SELECT currency,installment_amount::text,monthly_fx FROM finance.installment_plans WHERE event_id=$1 AND version=1",
        [result.id],
      ),
    );
    assert.deepEqual(original.rows, [
      { currency: "USD", installment_amount: "100", monthly_fx: true },
    ]);

    assert.equal(
      (await budget("2025-06", installmentCategory)).progress.consumed,
      "4500.0000",
    );
    const paidReport = await report("UYU", "2025-01-01", "2026-06-30");
    assert.equal(
      paidReport.totals.find(({ currency }) => currency === "UYU").expense,
      "25500.0000",
    );

    const planBudget = await budget("2025-06", installmentCategory);
    await run(async (c, id) => {
      assert.equal(
        (
          await saveBudget(
            c,
            id,
            {
              action: "edit",
              budgetId: planBudget.id,
              version: planBudget.version,
              currency: "EUR",
              amount: "300",
              idempotencyKey: randomUUID(),
            },
            fixedToday,
          )
        ).status,
        "saved",
      );
      assert.equal(
        (
          await saveBudget(
            c,
            id,
            {
              action: "quote",
              fromCurrency: "USD",
              toCurrency: "EUR",
              effectiveOn: "2025-06-01",
              rate: "0.9",
              idempotencyKey: randomUUID(),
            },
            fixedToday,
          )
        ).status,
        "created",
      );
    });
    const manual = (await report("EUR", "2025-06-01", "2025-06-30")).entries[0]
      .quote;
    assert.equal(manual.source, "manual");
    assert.equal(manual.rate, "0.9");
    assert.equal(
      (await budget("2025-06", installmentCategory)).progress.consumed,
      "90.0000",
    );
  } finally {
    try {
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    } finally {
      await pool.end();
    }
  }
});
