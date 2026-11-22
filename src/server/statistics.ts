import "server-only";
import type pg from "pg";
import type { Currency } from "../domain/money.ts";
import { fxKey, type FxQuote } from "../domain/exchange-rates.ts";
import {
  statisticsChartIdList,
  statisticsMonthComplete,
  statisticsMonthLabel,
  type StatisticsAnnual,
  type StatisticsAnnualPoint,
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
import {
  type HistoricalFxKey,
  pendingHistoricalDates,
  pinnedQuotes,
  prepareHistoricalQuotes,
} from "./exchange-rates.ts";
import { monthlyInstallmentFxReady } from "./installments.ts";
import { rememberSchema, schemaKnown } from "./schema-ready.ts";

type StatisticsSchema = Awaited<ReturnType<typeof statisticsReady>>;

function statisticsCte(schema: StatisticsSchema, includeRecurrences = true) {
  return `
WITH expense_rows AS (
  SELECT f.id AS event_id, e.currency, (-e.amount_signed) AS amount,
         m.category_id, f.effective_on, m.method, NULL::uuid AS card_id, false AS mixed,
         NULL::integer AS installment_ordinal
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m
      ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
    JOIN finance.bank_effects e
      ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
   WHERE f.kind = 'expense' AND f.status = 'confirmed' AND f.owner_id = $1
     AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
       WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
  ${
    schema.expenseInstallments
      ? `AND NOT EXISTS (SELECT 1 FROM finance.installment_plans p
       WHERE (p.owner_id, p.event_id) = (f.owner_id, f.id))
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on, x.method,
         NULL, false, x.installment_ordinal
    FROM finance.expense_installments x
   WHERE x.owner_id = $1`
      : ""
  }
  UNION ALL
  SELECT s.event_id, s.currency, s.own_amount, s.category_id, f.effective_on, s.method, NULL, false, NULL
    FROM finance.current_shared_expenses s
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
   WHERE s.owner_id = $1 AND s.method <> 'credit' AND f.status = 'confirmed' AND s.own_amount > 0
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN f.kind = 'card_payment' THEN 'transfer' ELSE x.method END,
         CASE WHEN f.kind = 'card_purchase' THEN o.card_id END, false, x.installment_ordinal
    FROM finance.credit_consumption x
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (x.owner_id, x.id)
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (x.owner_id, x.id)
   WHERE x.owner_id = $1 AND x.amount > 0
     AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
       WHERE (m.owner_id, m.event_id) = (x.owner_id, x.id))
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on, x.method,
         CASE WHEN x.method = 'credit' THEN o.card_id ELSE m.debit_card_id END, true, x.installment_ordinal
    FROM finance.mixed_purchase_expenses x
    JOIN finance.mixed_purchases m ON (m.owner_id, m.event_id) = (x.owner_id, x.id)
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (x.owner_id, x.id)
   WHERE x.owner_id = $1
  UNION ALL
  SELECT o.event_id, o.currency, o.expense, NULL, f.effective_on, 'transfer', NULL, false, NULL
    FROM finance.loan_operations o
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
   WHERE o.owner_id = $1 AND o.expense > 0 AND f.status = 'confirmed'
),
base_rows AS (
  SELECT 'expense'::text AS kind, * FROM expense_rows
),
rows AS (
  ${
    schema.allocations
      ? `SELECT b.kind, b.event_id, b.currency, coalesce(a.amount, b.amount) AS amount,
         CASE WHEN a.event_id IS NULL THEN b.category_id ELSE a.category_id END AS category_id,
         b.effective_on, b.method, b.card_id, b.mixed, b.installment_ordinal
    FROM base_rows b
    LEFT JOIN finance.current_movement_allocations a
      ON (a.owner_id, a.event_id) = ($1, b.event_id)`
      : "SELECT * FROM base_rows"
  }
),
category_scope AS (
  SELECT id FROM finance.categories
   WHERE owner_id = $1 AND (id::text = $5 OR parent_id::text = $5)
),
filtered_rows AS (
  SELECT x.*, ${
    includeRecurrences && schema.recurrences
      ? `EXISTS (SELECT 1 FROM finance.recurring_event_lineage r
    WHERE (r.owner_id, r.event_id) = ($1, x.event_id))`
      : "NULL::boolean"
  } AS recurring
    FROM rows x
   WHERE x.effective_on BETWEEN $2::date AND $3::date
     AND ($4::text IS NULL OR x.currency = $4)
     AND ($6::text IS NULL OR ($6 = 'mixed' AND x.mixed) OR x.method = $6)
     AND ($7::uuid IS NULL OR x.card_id = $7)
     AND ($9::uuid[] IS NULL${
       schema.tags
         ? ` OR EXISTS (SELECT 1 FROM finance.current_event_tags t
        WHERE (t.owner_id, t.event_id) = ($1, x.event_id) AND t.tag_id = ANY($9))`
         : ""
     })
),
scoped_source AS (
  SELECT * FROM filtered_rows x
   WHERE ($5::text IS NULL OR ($5 = 'none' AND x.category_id IS NULL)
       OR x.category_id IN (SELECT id FROM category_scope))
     AND ($8::text IS NULL OR x.kind = $8)
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
    filters.tags?.split(",") ?? (filters.tag ? [filters.tag] : null),
    ...(target ? [target] : []),
  ];
}

async function flowKeys(
  client: pg.PoolClient,
  ownerId: string,
  cte: string,
  range: StatisticsRange,
  history: StatisticsRange | null,
  previous: StatisticsRange | null,
  filters: StatisticsFilters,
  target: Currency,
) {
  // The selected period can start before the chart history. Include exactly
  // the dates read by the report, including any independent comparison.
  const windows = [range, history, previous].filter(
    (window) => window !== null,
  );
  const enclosing = windows.reduce(
    (bounds, window) => ({
      ...bounds,
      from: window.from < bounds.from ? window.from : bounds.from,
      to: window.to > bounds.to ? window.to : bounds.to,
    }),
    range,
  );
  const monthlyFx = await monthlyInstallmentFxReady(client);
  const { rows } = await client.query<HistoricalFxKey>(
    `${cte} SELECT DISTINCT to_char(x.effective_on, 'YYYY-MM-DD') AS date, x.currency AS base,
      ${monthlyFx ? "coalesce(p.monthly_fx, false)" : "false"} AS monthly
      FROM scoped_source x
      ${
        monthlyFx
          ? `LEFT JOIN finance.installment_plans p
        ON (p.owner_id,p.event_id,p.version) = ($1,x.event_id,1)
        AND x.installment_ordinal IS NOT NULL`
          : ""
      }
      WHERE x.currency <> $10 AND EXISTS (
        SELECT 1 FROM jsonb_to_recordset($11::jsonb) AS period(from_date date, to_date date)
        WHERE x.effective_on BETWEEN period.from_date AND period.to_date
      )
      ORDER BY date DESC, base`,
    [
      ...parameters(ownerId, enclosing, filters, target),
      JSON.stringify(
        windows.map(({ from, to }) => ({ from_date: from, to_date: to })),
      ),
    ],
  );
  return rows;
}

async function statisticsFxKeys(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  previous: StatisticsRange | null,
  history: StatisticsRange,
  filters: StatisticsFilters,
  schema: StatisticsSchema,
  target: Currency,
  annualRange?: StatisticsRange,
) {
  const source = statisticsCte(schema);
  const flows = await flowKeys(
    client,
    ownerId,
    source,
    range,
    history,
    previous,
    filters,
    target,
  );
  const annualFlows = annualRange
    ? await flowKeys(
        client,
        ownerId,
        source,
        annualRange,
        null,
        null,
        {
          ...filters,
          kind: "expense",
        },
        target,
      )
    : [];
  return [...flows, ...annualFlows];
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
  annualRange?: StatisticsRange,
) {
  await prepareHistoricalQuotes(
    client,
    ownerId,
    await statisticsFxKeys(
      client,
      ownerId,
      range,
      previous,
      history,
      filters,
      schema,
      target,
      annualRange,
    ),
    target,
    today,
  );
}

export async function statisticsReferenceDates(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  previous: StatisticsRange | null,
  history: StatisticsRange,
  filters: StatisticsFilters,
  schema: StatisticsSchema,
  target: Currency,
  annualRange?: StatisticsRange,
) {
  return pendingHistoricalDates(
    client,
    ownerId,
    await statisticsFxKeys(
      client,
      ownerId,
      range,
      previous,
      history,
      filters,
      schema,
      target,
      annualRange,
    ),
    target,
  );
}

export async function summaryReferenceDates(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  history: StatisticsRange,
  comparison: StatisticsRange | null,
  target: Currency,
) {
  const schema = await statisticsReady(client);
  if (!schema.ready) return [];
  const inputs = await flowKeys(
    client,
    ownerId,
    statisticsCte(schema),
    range,
    history,
    comparison,
    { period: "mes-actual" },
    target,
  );
  return pendingHistoricalDates(client, ownerId, inputs, target);
}

export async function summaryFlowFx(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  target: Currency,
  today: string,
  history = range,
  comparison: StatisticsRange | null = null,
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
    history,
    comparison,
    filters,
    target,
  );
  await prepareHistoricalQuotes(client, ownerId, inputs, target, today);
  const quotes = await pinnedQuotes(client, ownerId, inputs, target);
  const missing = inputs.filter((key) => !quotes.has(fxKey(key)));
  const { rows } = await client.query<{
    kind: "income" | "expense" | "refund";
    amount: string | null;
    count: number;
  }>(
    `${displayCte(source, target)}
     SELECT kind, count(DISTINCT event_id)::int AS count,
       CASE WHEN count(amount) = count(*) THEN round(sum(amount), 4)::text END AS amount
       FROM scoped WHERE effective_on BETWEEN $11::date AND $12::date GROUP BY kind`,
    [...parameters(ownerId, history, filters, target), range.from, range.to],
  );
  const { rows: months } = await client.query<{
    period: string;
    income: string | null;
    expense: string | null;
    result: string | null;
  }>(
    `${displayCte(source, target)}
     SELECT to_char(effective_on, 'YYYY-MM') AS period,
       CASE WHEN count(amount) FILTER (WHERE kind = 'income') = count(*) FILTER (WHERE kind = 'income')
         THEN round(sum(amount) FILTER (WHERE kind = 'income'), 4)::text END AS income,
       CASE WHEN count(amount) FILTER (WHERE kind = 'expense') = count(*) FILTER (WHERE kind = 'expense')
         THEN round(sum(amount) FILTER (WHERE kind = 'expense'), 4)::text END AS expense,
       CASE WHEN count(amount) = count(*) THEN round(
         sum(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 4
       )::text END AS result
     FROM scoped WHERE kind IN ('income', 'expense')
     GROUP BY 1 ORDER BY 1`,
    parameters(ownerId, history, filters, target),
  );
  const previous = comparison
    ? (
        await client.query<(typeof rows)[number]>(
          `${displayCte(source, target)}
         SELECT kind, count(DISTINCT event_id)::int AS count,
           CASE WHEN count(amount) = count(*) THEN round(sum(amount), 4)::text END AS amount
         FROM scoped WHERE kind IN ('income', 'expense') GROUP BY kind`,
          parameters(ownerId, comparison, filters, target),
        )
      ).rows
    : [];
  const hasExpenses = rows.some(
    ({ kind, amount }) => kind === "expense" && amount !== null,
  );
  const spending = hasExpenses
    ? await categories(
        client,
        displayCte(source, target),
        parameters(ownerId, range, { ...filters, kind: "expense" }, target),
      )
    : [];
  return {
    rows,
    months,
    previous,
    spending,
    missing,
  };
}

let statisticsSchemaKnown: ReturnType<typeof statisticsSchemaOf> | undefined;
const statisticsSchemaOf = (state: {
  shared: boolean;
  credit: boolean;
  mixed: boolean;
  loans: boolean;
  favorites: boolean;
  allocations: boolean;
  tags: boolean;
  recurrences: boolean;
  expenseInstallments: boolean;
}) => ({
  ready: state.shared && state.credit && state.mixed && state.loans,
  favorites: state.favorites,
  allocations: state.allocations,
  tags: state.tags,
  recurrences: state.recurrences,
  expenseInstallments: state.expenseInstallments,
});

export async function statisticsReady(client: pg.PoolClient) {
  // PERF-01: con el esquema completo el resultado no cambia (solo se agregan tablas).
  if (statisticsSchemaKnown) return statisticsSchemaKnown;
  const {
    rows: [state],
  } = await client.query<{
    shared: boolean;
    credit: boolean;
    mixed: boolean;
    loans: boolean;
    favorites: boolean;
    allocations: boolean;
    tags: boolean;
    recurrences: boolean;
    expenseInstallments: boolean;
  }>(
    `SELECT to_regclass('finance.current_shared_expenses') IS NOT NULL AS shared,
            to_regclass('finance.credit_consumption') IS NOT NULL AS credit,
            to_regclass('finance.mixed_purchase_expenses') IS NOT NULL AS mixed,
            to_regclass('finance.loan_operations') IS NOT NULL AS loans,
            to_regclass('finance.statistics_favorites') IS NOT NULL AS favorites,
            to_regclass('finance.current_movement_allocations') IS NOT NULL AS allocations,
            (to_regclass('finance.tags') IS NOT NULL AND
             to_regclass('finance.current_event_tags') IS NOT NULL) AS tags,
            to_regclass('finance.recurring_event_lineage') IS NOT NULL AS recurrences,
            to_regclass('finance.expense_installments') IS NOT NULL AS "expenseInstallments"`,
  );
  const schema = statisticsSchemaOf(state);
  if (Object.values(schema).every(Boolean)) statisticsSchemaKnown = schema;
  return schema;
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
       FROM scoped
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
       sum(x.amount)::numeric(20,4)::text AS amount
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

export async function loadStatisticsAnnual(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  filters: StatisticsFilters,
  schema: StatisticsSchema,
  target?: Currency,
): Promise<StatisticsAnnual> {
  const source = statisticsCte(schema, false);
  const expenseFilters = { ...filters, kind: "expense" } as const;
  // Coverage uses all reportable rows under the payment, currency and tag
  // filters. Category and type apply only to the expense total.
  const { rows } = await client.query<{
    year: number;
    currency: Currency;
    amount: string | null;
    missingRate: boolean;
  }>(
    `${displayCte(source, target)},
    coverage AS (
      SELECT DISTINCT extract(year FROM effective_on)::int AS year,
             ${target ? "$10::finance.currency" : "currency"} AS currency
        FROM filtered_rows
    ),
    annual_expenses AS (
      SELECT extract(year FROM effective_on)::int AS year, currency,
             round(sum(amount), 4)::text AS amount,
             bool_or(amount IS NULL) AS missing_rate
        FROM scoped GROUP BY year, currency
    )
    SELECT c.year, c.currency, e.amount, coalesce(e.missing_rate, false) AS "missingRate"
      FROM coverage c LEFT JOIN annual_expenses e USING (year, currency)
     ORDER BY c.currency, c.year`,
    parameters(ownerId, range, expenseFilters, target),
  );
  const startYear = Number(range.from.slice(0, 4));
  const endYear = Number(range.to.slice(0, 4));
  const currencies = [...new Set(rows.map(({ currency }) => currency))];
  const values = new Map(
    rows.map((row) => [`${row.currency}:${row.year}`, row]),
  );
  const series = currencies.map((currency) => ({
    currency,
    points: Array.from(
      { length: endYear - startYear + 1 },
      (_, index): StatisticsAnnualPoint => {
        const year = startYear + index;
        const row = values.get(`${currency}:${year}`);
        return {
          year,
          complete: year < endYear || range.complete,
          value: !row
            ? { status: "no-records" }
            : row.missingRate
              ? { status: "missing-rate" }
              : row.amount === null
                ? { status: "zero", amount: zero }
                : { status: "total", amount: row.amount },
        };
      },
    ),
  }));

  const earlier =
    startYear > 1 &&
    (
      await client.query<{ exists: boolean }>(
        `${source} SELECT EXISTS (SELECT 1 FROM filtered_rows)`,
        parameters(
          ownerId,
          {
            ...range,
            from: "0001-01-01",
            to: `${String(startYear - 1).padStart(4, "0")}-12-31`,
          },
          expenseFilters,
        ),
      )
    ).rows[0]?.exists;

  return { series, hasEarlier: earlier === true };
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
  const flowInputs = target
    ? await flowKeys(
        client,
        ownerId,
        source,
        range,
        historyRange,
        previous,
        filters,
        target,
      )
    : [];
  const quotes = target
    ? await pinnedQuotes(client, ownerId, flowInputs, target)
    : new Map<string, FxQuote>();
  const missingFlows = flowInputs.filter((key) => !quotes.has(fxKey(key)));
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
    filters.tag ||
    filters.tags
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
    `${cte} SELECT count(DISTINCT event_id)::int AS count FROM scoped`,
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
    entries: entryRows.map((entry) => ({
      ...entry,
      quote: quotes.get(fxKey({ date: entry.date, base: entry.currency })),
    })),
    fx: target
      ? {
          target,
          quotes: [...quotes.values()],
          missingFlows,
        }
      : undefined,
    hasNextPage,
    recurrencesReady: schema.recurrences,
    movementCount: sample.count,
  };
}
export async function statisticsFavoritesReady(client: pg.PoolClient) {
  if (schemaKnown.has("statisticsFavoritesReady")) return true;
  const {
    rows: [state],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.statistics_favorites') IS NOT NULL AS ready",
  );
  return rememberSchema("statisticsFavoritesReady", state.ready);
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
