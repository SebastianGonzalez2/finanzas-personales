import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.mts";
import {
  currentCurrencyValue,
  displayCurrency,
  pinnedQuotes,
  prepareHistoricalQuotes,
  refreshReferenceDates,
  saveDisplayCurrency,
  saveManualFx,
} from "../../src/server/exchange-rates.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-06: respaldo, caché anterior, inmovilidad y RLS A/B en PostgreSQL", async (t) => {
  const client = new pg.Client(testDatabaseConfig());
  const owner = randomUUID();
  const other = randomUUID();
  const today = "2026-11-11";
  const dates = [
    { date: "2026-11-01", base: "EUR" },
    { date: "2026-10-29", base: "EUR" },
  ];
  const request = t.mock.method(
    globalThis,
    "fetch",
    async () => new globalThis.Response(null, { status: 503 }),
  );
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await client.query(`
      INSERT INTO finance.fx_reference_rates(base_currency, quote_currency, observed_on, source, rate)
      VALUES ('EUR','USD','2026-10-30','frankfurter',1.3),
             ('EUR','USD','2026-10-01','datosuruguay',1.1),
             ('EUR','USD','2026-11-12','datosuruguay',2)`);
    await client.query(`INSERT INTO finance.fx_reference_refreshes(year,retry_at)
      VALUES (2026,now()+interval '1 hour') ON CONFLICT (year) DO UPDATE
      SET retry_at=excluded.retry_at, primary_pairs='{}', backup_pairs='{}'`);
    await setOwnerContext(client, owner);
    assert.equal(await displayCurrency(client, owner), "USD");
    await saveDisplayCurrency(client, owner, "EUR");
    await saveDisplayCurrency(client, owner, "EUR");
    assert.equal(
      (await client.query("SELECT version FROM finance.user_preferences"))
        .rows[0].version,
      1,
    );
    await prepareHistoricalQuotes(client, owner, dates, "USD", today);
    const pinned = await pinnedQuotes(client, owner, dates, "USD");
    assert.deepEqual(pinned.get("2026-11-01/EUR"), {
      date: "2026-11-01",
      base: "EUR",
      target: "USD",
      observed: "2026-10-30",
      rate: "1.3",
      source: "frankfurter",
    });
    assert.equal(pinned.get("2026-10-29/EUR").observed, "2026-10-01");
    const live = await currentCurrencyValue(
      client,
      [{ currency: "EUR", amount: "10" }],
      "USD",
      today,
    );
    assert.equal(live.amount, "13.0000");
    assert.equal(live.quotes[0].observed, "2026-10-30");
    assert.equal(request.mock.callCount(), 0); // Database helpers never fetch.
    assert.equal(
      await saveManualFx(client, owner, {
        ...dates[0],
        target: "USD",
        rate: "4",
      }),
      false,
    );
    await client.query("SAVEPOINT immutable");
    await assert.rejects(
      client.query("UPDATE finance.fx_reference_rates SET rate = 42"),
      { code: "42501" },
    );
    await client.query("ROLLBACK TO SAVEPOINT immutable");
    await client.query("SAVEPOINT rls");
    await assert.rejects(
      saveManualFx(client, other, { ...dates[0], target: "USD", rate: "2" }),
      { code: "42501" },
    );
    await client.query("ROLLBACK TO SAVEPOINT rls");

    await setOwnerContext(client, other);
    assert.equal(await displayCurrency(client, other), "USD");
    assert.equal((await pinnedQuotes(client, owner, dates, "USD")).size, 0);
    assert.equal(
      await saveManualFx(client, other, {
        ...dates[0],
        target: "USD",
        rate: "2",
      }),
      true,
    );
    assert.equal(
      (await pinnedQuotes(client, other, dates, "USD")).get("2026-11-01/EUR")
        .rate,
      "2",
    );
    await setOwnerContext(client, owner);
    assert.equal(
      (await pinnedQuotes(client, owner, dates, "USD")).get("2026-11-01/EUR")
        .rate,
      "1.3",
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("FIX-FX: importar BCU y respaldo fuera de la transacción, con caché concurrente", async (t) => {
  const client = new pg.Client(testDatabaseConfig());
  const pool = new pg.Pool(testDatabaseConfig());
  const year = 2043;
  const today = "2043-02-03";
  let active = 0;
  const run = async (work) => {
    const connection = await pool.connect();
    active++;
    try {
      await connection.query("BEGIN");
      const result = await work(connection);
      await connection.query("COMMIT");
      return result;
    } finally {
      await connection.query("ROLLBACK");
      active--;
      connection.release();
    }
  };
  const request = t.mock.method(globalThis, "fetch", async (input) => {
    assert.equal(active, 0);
    const url = new URL(input);
    if (url.hostname === "datosuruguay.com") {
      if (!url.pathname.endsWith("/usd"))
        return new Response(null, { status: 503 });
      return Response.json({
        meta: { unit: "UYU/USD", source: "BCU", has_more: false },
        data: [{ series: "usd", date: "2043-01-29", value: 39 }],
      });
    }
    return Response.json(
      url.searchParams.get("base") === "EUR"
        ? [{ date: "2043-01-31", base: "EUR", quote: "UYU", rate: 47 }]
        : [],
    );
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await client.query("COMMIT");
    // Test-only public observations on a dedicated synthetic year.
    await client.query(
      "DELETE FROM finance.fx_reference_refreshes WHERE year=$1",
      [year],
    );
    await client.query(
      "DELETE FROM finance.fx_reference_rates WHERE observed_on >= '2043-01-01' AND observed_on < '2044-01-01'",
    );
    await refreshReferenceDates(run, [today, "2043-01-01"], today);
    await Promise.all([
      refreshReferenceDates(run, [today], today),
      refreshReferenceDates(run, [today], today),
    ]);
    assert.equal(request.mock.callCount(), 4);

    const owner = randomUUID();
    const keys = [
      { date: "2043-02-01", base: "USD" },
      { date: "2043-02-01", base: "EUR" },
    ];
    await client.query("BEGIN");
    await setOwnerContext(client, owner);
    await prepareHistoricalQuotes(client, owner, keys, "UYU", today);
    const quotes = await pinnedQuotes(client, owner, keys, "UYU");
    assert.equal(quotes.get("2043-02-01/USD").source, "datosuruguay");
    assert.equal(quotes.get("2043-02-01/USD").observed, "2043-01-29");
    assert.equal(quotes.get("2043-02-01/EUR").source, "frankfurter");
    assert.equal(quotes.get("2043-02-01/EUR").observed, "2043-01-31");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
    await pool.end();
  }
});
