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
    assert.equal(request.mock.callCount(), 4); // The refresh cooldown prevents a second fetch.
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
