import "server-only";
import type pg from "pg";
import {
  fxKey,
  sumFx,
  type FxKey,
  type FxQuote,
} from "../domain/exchange-rates.ts";
import type { Currency } from "../domain/money.ts";
import { fetchReferenceYear } from "./exchange-rate-providers.ts";

export async function exchangeRatesReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.fx_valuations') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function displayCurrency(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<{ currency: Currency }>(
    "SELECT display_currency AS currency FROM finance.user_preferences WHERE owner_id = $1",
    [ownerId],
  );
  return rows[0]?.currency ?? "USD";
}

export async function saveDisplayCurrency(
  client: pg.PoolClient,
  ownerId: string,
  currency: Currency,
) {
  await client.query(
    `INSERT INTO finance.user_preferences (owner_id, display_currency) VALUES ($1, $2)
     ON CONFLICT (owner_id) DO UPDATE
       SET display_currency = excluded.display_currency, version = user_preferences.version + 1
     WHERE user_preferences.display_currency <> excluded.display_currency`,
    [ownerId, currency],
  );
}

const inputKeys = `jsonb_to_recordset($1::jsonb) AS k(date date, base finance.currency, target finance.currency)`;

function quoteInputs(keys: FxKey[], target: Currency) {
  return [
    ...new Map(
      keys.filter((key) => key.base !== target).map((key) => [fxKey(key), key]),
    ).values(),
  ].map((key) => ({ ...key, target }));
}

export async function pinnedQuotes(
  client: pg.PoolClient,
  ownerId: string,
  keys: FxKey[],
  target: Currency,
) {
  const inputs = quoteInputs(keys, target);
  if (!inputs.length) return new Map<string, FxQuote>();
  const { rows } = await client.query<FxQuote>(
    `SELECT k.date::text, k.base, v.quote_currency AS target, v.observed_on::text AS observed,
            v.source, coalesce(v.manual_rate, r.rate)::text AS rate
       FROM ${inputKeys}
       JOIN finance.fx_valuations v ON
         (v.owner_id, v.effective_on, v.base_currency, v.quote_currency) = ($2, k.date, k.base, k.target)
       LEFT JOIN finance.fx_reference_rates r ON
         (r.base_currency, r.quote_currency, r.observed_on, r.source) =
         (v.base_currency, v.quote_currency, v.observed_on, v.reference_source)`,
    [JSON.stringify(inputs), ownerId],
  );
  return new Map(rows.map((quote) => [fxKey(quote), quote]));
}

type ReferenceTransaction = <T>(
  work: (client: pg.PoolClient) => Promise<T>,
) => Promise<T>;

async function freshYears(client: pg.PoolClient, years: number[]) {
  const { rows } = await client.query<{ year: number }>(
    "SELECT year FROM finance.fx_reference_refreshes WHERE year = ANY($1::int[]) AND retry_at > now()",
    [years],
  );
  return new Set(rows.map(({ year }) => year));
}

type ReferenceBatch = Awaited<ReturnType<typeof fetchReferenceYear>>;

async function storeReferenceYear(
  client: pg.PoolClient,
  year: number,
  today: string,
  batch: ReferenceBatch,
) {
  // The public cache lock is held only while importing, in a short transaction.
  await client.query("SELECT pg_advisory_xact_lock(50506, $1)", [year]);
  if ((await freshYears(client, [year])).has(year)) return;
  if (batch.rates.length) {
    // Adjacent windows overlap. Insert in a consistent order across importers.
    await client.query(
      `INSERT INTO finance.fx_reference_rates (base_currency, quote_currency, observed_on, source, rate)
           SELECT base, target, observed, source, rate
             FROM jsonb_to_recordset($1::jsonb) AS r(base finance.currency, target finance.currency,
                                                  observed date, source text, rate numeric)
            ORDER BY base, target, observed, source
           ON CONFLICT DO NOTHING`,
      [JSON.stringify(batch.rates)],
    );
  }
  const pairs = (source: FxQuote["source"]) => [
    ...new Set(
      batch.rates
        .filter((rate) => rate.source === source)
        .map(({ base, target }) => `${base}/${target}`),
    ),
  ];
  const delay = batch.complete
    ? (year < Number(today.slice(0, 4)) ? 30 : 1) * 86400
    : 3600;
  await client.query(
    `INSERT INTO finance.fx_reference_refreshes (year, retry_at, primary_pairs, backup_pairs)
       VALUES ($1, clock_timestamp() + $2::double precision * interval '1 second', $3, $4)
       ON CONFLICT (year) DO UPDATE SET retry_at = excluded.retry_at,
         primary_pairs = excluded.primary_pairs, backup_pairs = excluded.backup_pairs`,
    [
      year,
      Math.max(delay, batch.retry),
      pairs("datosuruguay"),
      pairs("frankfurter"),
    ],
  );
}

const inFlight = new Map<number, Promise<number>>();

export async function refreshReferenceDates(
  transaction: ReferenceTransaction,
  dates: string[],
  today: string,
) {
  const years = [
    ...new Set(
      dates.map((date) => Number((date > today ? today : date).slice(0, 4))),
    ),
  ].sort((a, b) => a - b);
  if (!years.length) return;
  const fresh = await transaction((client) => freshYears(client, years));
  const pending = years.filter((year) => !fresh.has(year));
  // Fetch outside the database. Share requests within the process; PostgreSQL
  // rechecks freshness under the import lock across instances.
  for (let index = 0; index < pending.length; index += 3) {
    const wave = await Promise.all(
      pending.slice(index, index + 3).map((year) => {
        const existing = inFlight.get(year);
        if (existing) return existing;
        const job = fetchReferenceYear(year, today)
          .then(async (batch) => {
            await transaction((client) =>
              storeReferenceYear(client, year, today, batch),
            );
            return batch.retry;
          })
          .finally(() => inFlight.delete(year));
        inFlight.set(year, job);
        return job;
      }),
    );
    if (wave.some((retry) => retry > 0)) break;
  }
}

export async function pendingHistoricalDates(
  client: pg.PoolClient,
  ownerId: string,
  keys: FxKey[],
  target: Currency,
) {
  const existing = await pinnedQuotes(client, ownerId, keys, target);
  return quoteInputs(keys, target)
    .filter((key) => !existing.has(fxKey(key)))
    .map(({ date }) => date);
}

// Index-backed lookup of the most recent observation from each provider.
// The publication window accounts for weekends and holidays before falling
// back to the last stored valid date. Future observations are ineligible.
const referenceCandidates = `LEFT JOIN finance.fx_reference_refreshes s
  ON s.year = extract(year FROM k.date)::int
CROSS JOIN LATERAL (
  SELECT observed_on, source, rate FROM (
    (SELECT observed_on, source, rate FROM finance.fx_reference_rates
      WHERE (base_currency, quote_currency, source) = (k.base, k.target, 'datosuruguay')
        AND observed_on <= k.date ORDER BY observed_on DESC LIMIT 1)
    UNION ALL
    (SELECT observed_on, source, rate FROM finance.fx_reference_rates
      WHERE (base_currency, quote_currency, source) = (k.base, k.target, 'frankfurter')
        AND observed_on <= k.date ORDER BY observed_on DESC LIMIT 1)
  ) candidates
  ORDER BY CASE
             WHEN observed_on >= k.date - 7 AND source = 'datosuruguay'
               AND (k.base || '/' || k.target) = ANY(s.primary_pairs) THEN 0
             WHEN observed_on >= k.date - 7 AND source = 'frankfurter'
               AND (k.base || '/' || k.target) = ANY(s.backup_pairs) THEN 1
             ELSE 2 END,
           observed_on DESC, source
  LIMIT 1
) r`;

export async function prepareHistoricalQuotes(
  client: pg.PoolClient,
  ownerId: string,
  keys: FxKey[],
  target: Currency,
  today: string,
) {
  const eligible = quoteInputs(keys, target).filter(
    ({ date }) => date <= today,
  );
  if (!eligible.length) return;
  await client.query(
    `INSERT INTO finance.fx_valuations (owner_id, effective_on, base_currency, quote_currency, observed_on, source)
     SELECT $2, k.date, k.base, k.target, r.observed_on, r.source
       FROM ${inputKeys}
       ${referenceCandidates}
      WHERE s.retry_at > now() OR r.observed_on = k.date
      ORDER BY k.date, k.base
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(eligible), ownerId],
  );
}

export async function liveQuotes(
  client: pg.PoolClient,
  keys: FxKey[],
  target: Currency,
) {
  const inputs = quoteInputs(keys, target);
  if (!inputs.length) return new Map<string, FxQuote>();
  const { rows } = await client.query<FxQuote>(
    `SELECT k.date::text, k.base, k.target, r.observed_on::text AS observed, r.source, r.rate::text
       FROM ${inputKeys}
       ${referenceCandidates}`,
    [JSON.stringify(inputs)],
  );
  return new Map(rows.map((quote) => [fxKey(quote), quote]));
}

export async function currentCurrencyValue(
  client: pg.PoolClient,
  amounts: { currency: Currency; amount: string }[],
  target: Currency,
  today: string,
) {
  const keys = amounts
    .filter(
      ({ amount, currency }) => currency !== target && /[1-9]/.test(amount),
    )
    .map(({ currency }) => ({ date: today, base: currency }));
  const quotes = await liveQuotes(client, keys, target);
  return {
    amount: amounts.length
      ? sumFx(
          amounts.map(({ currency, amount }) => ({
            amount,
            rate:
              currency === target
                ? "1"
                : quotes.get(fxKey({ date: today, base: currency }))?.rate,
          })),
        )
      : null,
    quotes: [...quotes.values()],
    missing: quoteInputs(keys, target).filter((key) => !quotes.has(fxKey(key))),
  };
}

export async function saveManualFx(
  client: pg.PoolClient,
  ownerId: string,
  input: FxKey & { target: Currency; rate: string },
) {
  const { date, base, target, rate } = input;
  await client.query(
    `INSERT INTO finance.fx_valuations
       (owner_id, effective_on, base_currency, quote_currency, observed_on, source, manual_rate)
     VALUES ($1, $2, $3, $4, $2, 'manual', $5)
     ON CONFLICT DO NOTHING`,
    [ownerId, date, base, target, rate],
  );
  const quote = (await pinnedQuotes(client, ownerId, [input], target)).get(
    fxKey(input),
  );
  return quote?.source === "manual" && quote.rate === rate;
}
