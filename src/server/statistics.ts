import "server-only";
import type pg from "pg";
import type { Currency } from "../domain/money.ts";
import { fxKey, type FxKey, type FxQuote } from "../domain/exchange-rates.ts";
import {
  statisticsChartIdList,
  statisticsMonthComplete,
  statisticsMonthLabel,
  type StatisticsEntry,
  type StatisticsCategoryTotal,
  type StatisticsChartId,
  type StatisticsFilters,
  type StatisticsMethodTotal,
  type StatisticsMonthTotal,
  type StatisticsRange,
  type StatisticsSnapshot,
  type StatisticsTotal,
} from "../domain/statistics.ts";
import { listStatisticsPositions } from "./statistics-positions.ts";
import { pinnedQuotes, prepareHistoricalQuotes } from "./exchange-rates.ts";
import { consolidatePositions, positionKeys } from "./statistics-fx.ts";

type StatisticsSchema = Awaited<ReturnType<typeof statisticsReady>>;

function statisticsCte(schema: StatisticsSchema) {
  return `
WITH expense_rows AS (
  SELECT f.id AS event_id, e.currency, (-e.amount_signed) AS amount,
         m.category_id, f.effective_on, m.method, NULL::uuid AS card_id, false AS mixed
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m
      ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
    JOIN finance.bank_effects e
      ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
   WHERE f.kind = 'expense' AND f.status = 'confirmed' AND f.owner_id = $1
     AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
       WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
  UNION ALL
  SELECT s.event_id, s.currency, s.own_amount, s.category_id, f.effective_on, s.method, NULL, false
    FROM finance.current_shared_expenses s
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
   WHERE s.owner_id = $1 AND s.method <> 'credit' AND f.status = 'confirmed' AND s.own_amount > 0
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN f.kind = 'card_payment' THEN 'transfer' ELSE x.method END,
         CASE WHEN f.kind = 'card_purchase' THEN o.card_id END, false
    FROM finance.credit_consumption x
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (x.owner_id, x.id)
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (x.owner_id, x.id)
   WHERE x.owner_id = $1 AND x.amount > 0
     AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
       WHERE (m.owner_id, m.event_id) = (x.owner_id, x.id))
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on, x.method,
         CASE WHEN x.method = 'credit' THEN o.card_id ELSE m.debit_card_id END, true
    FROM finance.mixed_purchase_expenses x
    JOIN finance.mixed_purchases m ON (m.owner_id, m.event_id) = (x.owner_id, x.id)
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (x.owner_id, x.id)
   WHERE x.owner_id = $1
  UNION ALL
  SELECT o.event_id, o.currency, o.expense, NULL, f.effective_on, 'transfer', NULL, false
    FROM finance.loan_operations o
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
   WHERE o.owner_id = $1 AND o.expense > 0 AND f.status = 'confirmed'
),
income_rows AS (
  SELECT f.id AS event_id, e.currency, e.amount_signed AS amount,
         m.category_id, f.effective_on, m.method, NULL::uuid AS card_id, false AS mixed
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m
      ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
    JOIN finance.bank_effects e
      ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
   WHERE f.kind = 'income' AND f.status = 'confirmed' AND f.owner_id = $1
),
base_rows AS (
  SELECT 'expense'::text AS kind, * FROM expense_rows
  UNION ALL
  SELECT 'income'::text, * FROM income_rows
),
rows AS (
  ${
    schema.allocations
      ? `SELECT b.kind, b.event_id, b.currency, coalesce(a.amount, b.amount) AS amount,
         CASE WHEN a.event_id IS NULL THEN b.category_id ELSE a.category_id END AS category_id,
         b.effective_on, b.method, b.card_id, b.mixed
    FROM base_rows b
    LEFT JOIN finance.current_movement_allocations a
      ON (a.owner_id, a.event_id) = ($1, b.event_id)`
      : "SELECT * FROM base_rows"
  }
),
refund_rows AS (
  SELECT 'refund'::text AS kind, r.event_id, r.currency, p.amount,
         p.category_id, f.effective_on, p.method,
         CASE WHEN p.method = 'credit' THEN o.card_id ELSE m.debit_card_id END AS card_id,
         m.event_id IS NOT NULL AS mixed
    FROM finance.purchase_refunds r
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
    JOIN finance.refund_parts p
      ON (p.owner_id, p.event_id) = (r.owner_id, r.event_id)
    LEFT JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (r.owner_id, r.purchase_id)
    LEFT JOIN finance.mixed_purchases m ON (m.owner_id, m.event_id) = (r.owner_id, r.purchase_id)
   WHERE r.owner_id = $1 AND r.action = 'credit' AND f.status = 'confirmed'
),
category_scope AS (
  SELECT id FROM finance.categories
   WHERE owner_id = $1 AND (id::text = $5 OR parent_id::text = $5)
),
scoped_source AS (
  SELECT x.*, ${
    schema.recurrences
      ? `EXISTS (SELECT 1 FROM finance.recurring_event_lineage r
    WHERE (r.owner_id, r.event_id) = ($1, x.event_id))`
      : "NULL::boolean"
  } AS recurring
    FROM (SELECT * FROM rows UNION ALL SELECT * FROM refund_rows) x
   WHERE x.effective_on BETWEEN $2::date AND $3::date
     AND ($4::text IS NULL OR x.currency = $4)
     AND ($5::text IS NULL OR ($5 = 'none' AND x.category_id IS NULL)
       OR x.category_id IN (SELECT id FROM category_scope))
     AND ($6::text IS NULL OR ($6 = 'mixed' AND x.mixed) OR x.method = $6)
     AND ($7::uuid IS NULL OR x.card_id = $7)
     AND ($8::text IS NULL OR x.kind = $8)
     AND ($9::uuid IS NULL${
       schema.tags
         ? ` OR EXISTS (SELECT 1 FROM finance.current_event_tags t
        WHERE (t.owner_id, t.event_id, t.tag_id) = ($1, x.event_id, $9))`
         : ""
     })
)`;
}

function displayCte(cte: string, target?: Currency) {
  if (!target) return `${cte}, scoped AS (SELECT * FROM scoped_source)`;
  return `${cte}, scoped AS (
    SELECT x.kind, x.event_id, $10::finance.currency AS currency, x.category_id,
           x.effective_on, x.method, x.card_id, x.mixed, x.recurring,
           x.amount * CASE WHEN x.currency = $10 THEN 1
                        ELSE coalesce(v.manual_rate, r.rate) END AS amount
      FROM scoped_source x
      LEFT JOIN finance.fx_valuations v
        ON (v.owner_id, v.effective_on, v.base_currency, v.quote_currency) =
           ($1, x.effective_on, x.currency, $10)
      LEFT JOIN finance.fx_reference_rates r
        ON (r.base_currency, r.quote_currency, r.observed_on, r.source) =
           (v.base_currency, v.quote_currency, v.observed_on, v.reference_source)
  )`;
}

function parameters(
  ownerId: string,
  range: StatisticsRange,
  filters: StatisticsFilters,
  target?: Currency,
) {
  return [
    ownerId,
    range.from,
    range.to,
    filters.currency ?? null,
    filters.category?.toLowerCase() ?? null,
    filters.method ?? null,
    filters.card ?? null,
    filters.kind ?? null,
    filters.tag ?? null,
    ...(target ? [target] : []),
  ];
}

async function flowKeys(
  client: pg.PoolClient,
  ownerId: string,
  cte: string,
  history: StatisticsRange,
  previous: StatisticsRange | null,
  filters: StatisticsFilters,
  target: Currency,
) {
  const enclosing = {
    ...history,
    from:
      previous && previous.from < history.from ? previous.from : history.from,
    to: previous && previous.to > history.to ? previous.to : history.to,
  };
  const { rows } = await client.query<FxKey>(
    `${cte} SELECT DISTINCT to_char(effective_on, 'YYYY-MM-DD') AS date, currency AS base
      FROM scoped_source WHERE currency <> $10 AND
       (effective_on BETWEEN $11 AND $12 OR effective_on BETWEEN $13 AND $14)
      ORDER BY date DESC, base`,
    [
      ...parameters(ownerId, enclosing, filters, target),
      history.from,
      history.to,
      previous?.from ?? null,
      previous?.to ?? null,
    ],
  );
  return rows;
}

export async function prepareStatisticsFx(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  previous: StatisticsRange | null,
  history: StatisticsRange,
  filters: StatisticsFilters,
  schema: StatisticsSchema,
  target: Currency,
  today: string,
) {
  const flows = await flowKeys(
    client,
    ownerId,
    statisticsCte(schema),
    history,
    previous,
    filters,
    target,
  );
  const positions = await listStatisticsPositions(
    client,
    ownerId,
    history,
    previous,
    range,
    filters.currency,
  );
  await prepareHistoricalQuotes(
    client,
    ownerId,
    [...flows, ...positionKeys(positions)],
    target,
    today,
  );
}

export async function summaryFlowFx(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  target: Currency,
  today: string,
) {
  const schema = await statisticsReady(client);
  if (!schema.ready) return null;
  const source = statisticsCte(schema);
  const filters = { period: "mes-actual" } as const;
  const inputs = await flowKeys(
    client,
    ownerId,
    source,
    range,
    null,
    filters,
    target,
  );
  await prepareHistoricalQuotes(client, ownerId, inputs, target, today);
  const quotes = await pinnedQuotes(client, ownerId, inputs, target);
  const missing = inputs.filter((key) => !quotes.has(fxKey(key)));
  const { rows } = await client.query<{
    kind: "income" | "expense" | "refund";
    amount: string | null;
  }>(
    `${displayCte(source, target)}
     SELECT kind, CASE WHEN count(amount) = count(*) THEN round(sum(amount), 4)::text END AS amount
       FROM scoped GROUP BY kind`,
    parameters(ownerId, range, filters, target),
  );
  return { rows, quotes: [...quotes.values()], missing };
}

export async function statisticsReady(client: pg.PoolClient) {
  const {
    rows: [state],
  } = await client.query<{
    shared: boolean;
    credit: boolean;
    mixed: boolean;
    loans: boolean;
    refunds: boolean;
    favorites: boolean;
    allocations: boolean;
    tags: boolean;
    recurrences: boolean;
  }>(
    `SELECT to_regclass('finance.current_shared_expenses') IS NOT NULL AS shared,
            to_regclass('finance.credit_consumption') IS NOT NULL AS credit,
            to_regclass('finance.mixed_purchase_expenses') IS NOT NULL AS mixed,
            to_regclass('finance.loan_operations') IS NOT NULL AS loans,
            to_regclass('finance.purchase_refunds') IS NOT NULL AS refunds,
            to_regclass('finance.statistics_favorites') IS NOT NULL AS favorites,
            to_regclass('finance.current_movement_allocations') IS NOT NULL AS allocations,
            (to_regclass('finance.tags') IS NOT NULL AND
             to_regclass('finance.current_event_tags') IS NOT NULL) AS tags,
            to_regclass('finance.recurring_event_lineage') IS NOT NULL AS recurrences`,
  );
  return {
    ready:
      state.shared &&
      state.credit &&
      state.mixed &&
      state.loans &&
      state.refunds,
    favorites: state.favorites,
    allocations: state.allocations,
    tags: state.tags,
    recurrences: state.recurrences,
  };
}

const zero = "0.0000";
const detailPageSize = 30;

type FlowRow = {
  kind: "income" | "expense" | "refund";
  currency: Currency;
  amount: string;
  recurring: string | null;
  count: number;
};

async function totals(
  client: pg.PoolClient,
  cte: string,
  params: unknown[],
  recurringReady: boolean,
) {
  const { rows } = await client.query<FlowRow>(
    `${cte} SELECT kind, currency, round(sum(amount), 4)::text AS amount,
       count(DISTINCT event_id)::int AS count,
       round(coalesce(sum(amount) FILTER (WHERE recurring), 0), 4)::text AS recurring
       FROM scoped GROUP BY kind, currency ORDER BY currency, kind`,
    params,
  );
  const result = new Map<Currency, StatisticsTotal>();
  for (const row of rows) {
    const total = result.get(row.currency) ?? {
      currency: row.currency,
      income: zero,
      expense: zero,
      refunds: zero,
      recurring: recurringReady ? zero : null,
      movements: 0,
    };
    if (row.kind === "refund") total.refunds = row.amount;
    else {
      total[row.kind] = row.amount;
      total.movements += row.count;
      if (row.kind === "expense" && recurringReady)
        total.recurring = row.recurring;
    }
    result.set(row.currency, total);
  }
  return [...result.values()];
}

async function categories(
  client: pg.PoolClient,
  cte: string,
  params: unknown[],
) {
  const { rows } = await client.query<StatisticsCategoryTotal>(
    `${cte} SELECT x.kind, x.currency, group_category.id AS "categoryId",
            c.parent_id AS "parentId", coalesce(c.name, 'Sin categorizar') AS category,
            round(sum(x.amount), 4)::text AS amount, count(DISTINCT x.event_id)::int AS count
       FROM scoped x
       LEFT JOIN finance.categories source ON (source.owner_id, source.id) = ($1, x.category_id)
       CROSS JOIN LATERAL (
         SELECT x.category_id AS id
         UNION ALL SELECT source.parent_id WHERE source.parent_id IS NOT NULL
           AND ($5::text IS NULL OR source.parent_id::text = $5)
       ) group_category
       LEFT JOIN finance.categories c ON (c.owner_id, c.id) = ($1, group_category.id)
      WHERE x.kind <> 'refund'
      GROUP BY x.kind, x.currency, group_category.id, c.parent_id, c.name
      ORDER BY x.kind, x.currency, sum(x.amount) DESC, c.name NULLS LAST, group_category.id`,
    params,
  );
  return rows;
}

async function methods(client: pg.PoolClient, cte: string, params: unknown[]) {
  const { rows } = await client.query<StatisticsMethodTotal>(
    `${cte} SELECT kind, currency, method, round(sum(amount), 4)::text AS amount,
            count(DISTINCT event_id)::int AS count
       FROM scoped WHERE kind <> 'refund'
      GROUP BY kind, currency, method
      ORDER BY kind, currency, sum(amount) DESC, method`,
    params,
  );
  return rows;
}

async function months(
  client: pg.PoolClient,
  cte: string,
  params: unknown[],
  range: StatisticsRange,
  recurringReady: boolean,
): Promise<StatisticsMonthTotal[]> {
  const { rows } = await client.query<{
    period: string;
    currency: Currency;
    income: string;
    expense: string;
    refunds: string;
    recurring: string;
  }>(
    `${cte} SELECT to_char(effective_on, 'YYYY-MM') AS period, currency,
            round(coalesce(sum(amount) FILTER (WHERE kind = 'income'), 0), 4)::text AS income,
            round(coalesce(sum(amount) FILTER (WHERE kind = 'expense'), 0), 4)::text AS expense,
            round(coalesce(sum(amount) FILTER (WHERE kind = 'refund'), 0), 4)::text AS refunds,
            round(coalesce(sum(amount) FILTER (WHERE kind = 'expense' AND recurring), 0), 4)::text AS recurring
       FROM scoped GROUP BY period, currency ORDER BY period, currency`,
    params,
  );
  return rows.map((row) => ({
    ...row,
    label: statisticsMonthLabel(row.period),
    recurring: recurringReady ? row.recurring : null,
    complete: statisticsMonthComplete(row.period, range),
  }));
}

async function entries(
  client: pg.PoolClient,
  cte: string,
  params: unknown[],
  page: number,
) {
  const { rows } = await client.query<StatisticsEntry>(
    `${cte} SELECT f.id, x.kind, x.currency, to_char(x.effective_on, 'YYYY-MM-DD') AS date,
       CASE WHEN f.kind = 'card_payment' THEN 'Comisión bancaria'
            ELSE coalesce(s.concept, f.concept) END AS concept,
       sum(x.amount)::text AS amount
       FROM scoped_source x
       JOIN finance.financial_events f ON (f.owner_id, f.id) = ($1, x.event_id)
       LEFT JOIN finance.current_shared_expenses s ON (s.owner_id, s.event_id) = ($1, x.event_id)
       GROUP BY f.id, f.kind, f.concept, s.concept, x.kind, x.currency, x.effective_on
       ORDER BY x.effective_on DESC, f.id DESC, x.kind, x.currency
       LIMIT $10 OFFSET $11`,
    [...params, detailPageSize + 1, (page - 1) * detailPageSize],
  );
  return {
    entries: rows.slice(0, detailPageSize),
    hasNextPage: rows.length > detailPageSize,
  };
}

export async function loadStatistics(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  previous: StatisticsRange | null,
  historyRange: StatisticsRange,
  filters: StatisticsFilters,
  schema: StatisticsSchema,
  target?: Currency,
): Promise<StatisticsSnapshot> {
  const source = statisticsCte(schema);
  const positions = await listStatisticsPositions(
    client,
    ownerId,
    historyRange,
    previous,
    range,
    filters.currency,
  );
  const flowInputs = target
    ? await flowKeys(
        client,
        ownerId,
        source,
        historyRange,
        previous,
        filters,
        target,
      )
    : [];
  const positionInputs = target
    ? positionKeys(positions).filter(({ base }) => base !== target)
    : [];
  const quotes = target
    ? await pinnedQuotes(
        client,
        ownerId,
        [...flowInputs, ...positionInputs],
        target,
      )
    : new Map<string, FxQuote>();
  const missingFlows = flowInputs.filter((key) => !quotes.has(fxKey(key)));
  const missingPositions = positionInputs.filter(
    (key) => !quotes.has(fxKey(key)),
  );
  const flowCurrency = missingFlows.length ? undefined : target;
  const cte = displayCte(source, flowCurrency);
  const currentParams = parameters(ownerId, range, filters, flowCurrency);
  const previousParams =
    previous && parameters(ownerId, previous, filters, flowCurrency);
  const currentTotals = await totals(
    client,
    cte,
    currentParams,
    schema.recurrences,
  );
  const previousTotals = previousParams
    ? await totals(client, cte, previousParams, schema.recurrences)
    : [];
  const categoryRows = await categories(client, cte, currentParams);
  const previousCategories = previousParams
    ? await categories(client, cte, previousParams)
    : [];
  const methodRows = await methods(client, cte, currentParams);
  const previousMethods = previousParams
    ? await methods(client, cte, previousParams)
    : [];
  const monthRows = await months(
    client,
    cte,
    parameters(ownerId, historyRange, filters, flowCurrency),
    historyRange,
    schema.recurrences,
  );
  const { entries: entryRows, hasNextPage } =
    filters.category ||
    filters.kind ||
    filters.method ||
    filters.card ||
    filters.tag
      ? await entries(
          client,
          source,
          parameters(ownerId, range, filters),
          Number(filters.detailPage ?? 1),
        )
      : { entries: [], hasNextPage: false };
  const {
    rows: [sample],
  } = await client.query<{ count: number }>(
    `${cte} SELECT count(DISTINCT event_id)::int AS count FROM scoped WHERE kind <> 'refund'`,
    currentParams,
  );
  return {
    range,
    previous,
    historyRange,
    totals: currentTotals,
    previousTotals,
    categories: categoryRows,
    previousCategories,
    methods: methodRows,
    previousMethods,
    months: monthRows,
    positions:
      target && !missingPositions.length
        ? consolidatePositions(positions, quotes, target)
        : positions,
    entries: entryRows.map((entry) => ({
      ...entry,
      quote: quotes.get(fxKey({ date: entry.date, base: entry.currency })),
    })),
    fx: target
      ? {
          target,
          quotes: [...quotes.values()],
          missingFlows,
          missingPositions,
        }
      : undefined,
    hasNextPage,
    recurrencesReady: schema.recurrences,
    movementCount: sample.count,
  };
}
export async function statisticsFavoritesReady(client: pg.PoolClient) {
  const {
    rows: [state],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.statistics_favorites') IS NOT NULL AS ready",
  );
  return state.ready;
}

export async function listStatisticsCards(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM finance.cards WHERE owner_id = $1 ORDER BY name, id`,
    [ownerId],
  );
  return rows;
}

export async function listStatisticsTags(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<{
    id: string;
    name: string;
    archived: boolean;
  }>(
    `SELECT id, name, archived_at IS NOT NULL AS archived
       FROM finance.tags WHERE owner_id = $1 ORDER BY archived, name, id`,
    [ownerId],
  );
  return rows;
}

export async function listStatisticsFavorites(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<{ chartId: StatisticsChartId }>(
    `SELECT chart_id AS "chartId"
       FROM finance.statistics_favorites
      WHERE owner_id = $1
      ORDER BY created_at, chart_id`,
    [ownerId],
  );
  return rows.map(({ chartId }) => chartId);
}

export async function setStatisticsFavorite(
  client: pg.PoolClient,
  ownerId: string,
  chartId: StatisticsChartId,
  favorite: boolean,
) {
  if (!statisticsChartIdList.includes(chartId)) return false;
  if (favorite)
    await client.query(
      `INSERT INTO finance.statistics_favorites (owner_id, chart_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ownerId, chartId],
    );
  else
    await client.query(
      `DELETE FROM finance.statistics_favorites
        WHERE owner_id = $1 AND chart_id = $2`,
      [ownerId, chartId],
    );
  return true;
}
