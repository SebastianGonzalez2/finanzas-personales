import "server-only";
import type pg from "pg";
import type { Currency } from "../domain/money.ts";
import {
  statisticsChartIdList,
  statisticsMonthLabel,
  sumAmounts,
  type StatisticsCategoryTotal,
  type StatisticsChartId,
  type StatisticsFilters,
  type StatisticsMethodTotal,
  type StatisticsMonthTotal,
  type StatisticsRange,
  type StatisticsSnapshot,
  type StatisticsTotal,
} from "../domain/statistics.ts";

const statisticsCte = `
WITH expense_rows AS (
  SELECT f.id AS event_id, e.currency, (-e.amount_signed) AS amount,
         m.category_id, f.effective_on, m.method
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m
      ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
    JOIN finance.bank_effects e
      ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
   WHERE f.kind = 'expense' AND f.status = 'confirmed' AND f.owner_id = $1
     AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
       WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
  UNION ALL
  SELECT s.event_id, s.currency, s.own_amount, s.category_id, f.effective_on, s.method
    FROM finance.current_shared_expenses s
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
   WHERE s.owner_id = $1 AND s.method <> 'credit' AND f.status = 'confirmed' AND s.own_amount > 0
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on, x.method
    FROM finance.credit_consumption x
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (x.owner_id, x.id)
   WHERE x.owner_id = $1 AND x.amount > 0
     AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
       WHERE (m.owner_id, m.event_id) = (x.owner_id, x.id))
  UNION ALL
  SELECT x.id, x.currency, x.amount, x.category_id, x.effective_on, x.method
    FROM finance.mixed_purchase_expenses x
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (x.owner_id, x.id)
   WHERE x.owner_id = $1
  UNION ALL
  SELECT o.event_id, o.currency, o.expense, NULL::uuid, f.effective_on, 'transfer'::text
    FROM finance.loan_operations o
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
   WHERE o.owner_id = $1 AND o.expense > 0 AND f.status = 'confirmed'
),
income_rows AS (
  SELECT f.id AS event_id, e.currency, e.amount_signed AS amount,
         m.category_id, f.effective_on, m.method
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m
      ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
    JOIN finance.bank_effects e
      ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
   WHERE f.kind = 'income' AND f.status = 'confirmed' AND f.owner_id = $1
),
rows AS (
  SELECT 'expense'::text AS kind, event_id, currency, amount, category_id,
         effective_on, method
    FROM expense_rows
  UNION ALL
  SELECT 'income'::text, event_id, currency, amount, category_id,
         effective_on, method
    FROM income_rows
),
refund_rows AS (
  SELECT 'refund'::text AS kind, r.event_id, r.currency, p.amount,
         p.category_id, f.effective_on, p.method
    FROM finance.purchase_refunds r
    JOIN finance.financial_events f
      ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
    JOIN finance.refund_parts p
      ON (p.owner_id, p.event_id) = (r.owner_id, r.event_id)
   WHERE r.owner_id = $1 AND r.action = 'credit' AND f.status = 'confirmed'
)
`;

function scoped() {
  return `${statisticsCte}
SELECT kind, currency, amount, category_id, effective_on, method
  FROM rows
 WHERE effective_on >= $2::date AND effective_on <= $3::date
   AND ($4::text IS NULL OR currency = $4)
   AND ($5::text IS NULL OR ($5 = 'none' AND category_id IS NULL)
     OR category_id::text = $5)
   AND ($6::text IS NULL OR method = $6)`;
}

function parameters(
  ownerId: string,
  from: string,
  to: string,
  filters: StatisticsFilters,
) {
  return [
    ownerId,
    from,
    to,
    filters.currency ?? null,
    filters.category ?? null,
    filters.method ?? null,
  ];
}

export async function statisticsReady(client: pg.PoolClient) {
  const {
    rows: [state],
  } = await client.query<{
    expenses: boolean;
    shared: boolean;
    credit: boolean;
    mixed: boolean;
    loans: boolean;
    refunds: boolean;
    favorites: boolean;
  }>(
    `SELECT to_regclass('finance.budget_expenses') IS NOT NULL AS expenses,
            to_regclass('finance.current_shared_expenses') IS NOT NULL AS shared,
            to_regclass('finance.credit_consumption') IS NOT NULL AS credit,
            to_regclass('finance.mixed_purchase_expenses') IS NOT NULL AS mixed,
            to_regclass('finance.loan_operations') IS NOT NULL AS loans,
            to_regclass('finance.purchase_refunds') IS NOT NULL AS refunds,
            to_regclass('finance.statistics_favorites') IS NOT NULL AS favorites`,
  );
  return {
    ready:
      state.expenses &&
      state.shared &&
      state.credit &&
      state.mixed &&
      state.loans &&
      state.refunds,
    favorites: state.favorites,
  };
}

async function totals(
  client: pg.PoolClient,
  ownerId: string,
  from: string,
  to: string,
  filters: StatisticsFilters,
) {
  const { rows } = await client.query<{
    kind: "income" | "expense";
    currency: Currency;
    amount: string;
    movements: number;
  }>(
    `SELECT kind, currency, sum(amount)::text AS amount,
            count(DISTINCT event_id)::int AS movements
       FROM (${scoped()}) x
      GROUP BY kind, currency
      ORDER BY currency, kind`,
    parameters(ownerId, from, to, filters),
  );
  return rows;
}

async function categories(
  client: pg.PoolClient,
  ownerId: string,
  from: string,
  to: string,
  filters: StatisticsFilters,
) {
  const { rows } = await client.query<StatisticsCategoryTotal>(
    `SELECT x.kind, x.currency, x.category_id AS "categoryId",
            c.parent_id AS "parentId", coalesce(c.name, 'Sin categorizar') AS category,
            sum(x.amount)::text AS amount, count(DISTINCT x.event_id)::int AS count
       FROM (${scoped()}) x
       LEFT JOIN finance.categories c
         ON (c.owner_id, c.id) = ($1, x.category_id)
      GROUP BY x.kind, x.currency, x.category_id, c.parent_id, c.name
      ORDER BY x.kind, x.currency, sum(x.amount) DESC, c.name NULLS LAST`,
    parameters(ownerId, from, to, filters),
  );
  return rows;
}

async function methods(
  client: pg.PoolClient,
  ownerId: string,
  from: string,
  to: string,
  filters: StatisticsFilters,
) {
  const { rows } = await client.query<StatisticsMethodTotal>(
    `SELECT kind, currency, method, sum(amount)::text AS amount,
            count(DISTINCT event_id)::int AS count
       FROM (${scoped()}) x
      GROUP BY kind, currency, method
      ORDER BY kind, currency, sum(amount) DESC`,
    parameters(ownerId, from, to, filters),
  );
  return rows;
}

async function months(
  client: pg.PoolClient,
  ownerId: string,
  from: string,
  to: string,
  filters: StatisticsFilters,
) {
  const { rows } = await client.query<{
    period: string;
    kind: "income" | "expense";
    currency: Currency;
    amount: string;
  }>(
    `SELECT to_char(date_trunc('month', effective_on), 'YYYY-MM') AS period,
            kind, currency, sum(amount)::text AS amount
       FROM (${scoped()}) x
      GROUP BY period, kind, currency
      ORDER BY period, currency, kind`,
    parameters(ownerId, from, to, filters),
  );
  return rows;
}

async function refunds(
  client: pg.PoolClient,
  ownerId: string,
  from: string,
  to: string,
  filters: StatisticsFilters,
) {
  const { rows } = await client.query<{
    period: string;
    currency: Currency;
    amount: string;
  }>(
    `${statisticsCte}
     SELECT to_char(date_trunc('month', effective_on), 'YYYY-MM') AS period,
            currency, sum(amount)::text AS amount
       FROM refund_rows
      WHERE effective_on >= $2::date AND effective_on <= $3::date
        AND ($4::text IS NULL OR currency = $4)
        AND ($5::text IS NULL OR ($5 = 'none' AND category_id IS NULL)
          OR category_id::text = $5)
        AND ($6::text IS NULL OR method = $6)
      GROUP BY period, currency
      ORDER BY period, currency`,
    parameters(ownerId, from, to, filters),
  );
  return rows;
}

function totalsByCurrency(
  rows: Awaited<ReturnType<typeof totals>>,
  refundRows: Awaited<ReturnType<typeof refunds>> = [],
): StatisticsTotal[] {
  const result = new Map<Currency, StatisticsTotal>();
  for (const row of rows) {
    const total = result.get(row.currency) ?? {
      currency: row.currency,
      income: "0.0000",
      expense: "0.0000",
      refunds: "0.0000",
      movements: 0,
    };
    total[row.kind] = row.amount;
    total.movements += row.movements;
    result.set(row.currency, total);
  }
  for (const row of refundRows) {
    const total = result.get(row.currency) ?? {
      currency: row.currency,
      income: "0.0000",
      expense: "0.0000",
      refunds: "0.0000",
      movements: 0,
    };
    total.refunds = sumAmounts([total.refunds, row.amount]);
    result.set(row.currency, total);
  }
  return [...result.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

function monthTotals(
  rows: Awaited<ReturnType<typeof months>>,
  refundRows: Awaited<ReturnType<typeof refunds>>,
): StatisticsMonthTotal[] {
  const result = new Map<string, StatisticsMonthTotal>();
  const key = (period: string, currency: Currency) => `${period}:${currency}`;
  for (const row of rows) {
    const id = key(row.period, row.currency);
    const total = result.get(id) ?? {
      period: row.period,
      label: statisticsMonthLabel(row.period),
      currency: row.currency,
      income: "0.0000",
      expense: "0.0000",
      refunds: "0.0000",
      complete: false,
    };
    total[row.kind] = row.amount;
    result.set(id, total);
  }
  for (const row of refundRows) {
    const id = key(row.period, row.currency);
    const total = result.get(id) ?? {
      period: row.period,
      label: statisticsMonthLabel(row.period),
      currency: row.currency,
      income: "0.0000",
      expense: "0.0000",
      refunds: "0.0000",
      complete: false,
    };
    total.refunds = row.amount;
    result.set(id, total);
  }
  return [...result.values()].sort(
    (a, b) =>
      a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency),
  );
}

export async function loadStatistics(
  client: pg.PoolClient,
  ownerId: string,
  range: StatisticsRange,
  previous: StatisticsRange,
  historyRange: StatisticsRange,
  filters: StatisticsFilters,
): Promise<StatisticsSnapshot> {
  const [
    currentTotals,
    previousTotals,
    categoryRows,
    methodRows,
    monthRows,
    refundRows,
    count,
  ] = await Promise.all([
    totals(client, ownerId, range.from, range.to, filters),
    totals(client, ownerId, previous.from, previous.to, filters),
    categories(client, ownerId, range.from, range.to, filters),
    methods(client, ownerId, range.from, range.to, filters),
    months(client, ownerId, historyRange.from, historyRange.to, filters),
    refunds(client, ownerId, range.from, range.to, filters),
    client.query<{ count: number }>(
      `SELECT count(DISTINCT event_id)::int AS count
         FROM (${scoped()}) x`,
      parameters(ownerId, range.from, range.to, filters),
    ),
  ]);
  const historyRefunds = await refunds(
    client,
    ownerId,
    historyRange.from,
    historyRange.to,
    filters,
  );
  return {
    range,
    previous,
    historyRange,
    totals: totalsByCurrency(currentTotals, refundRows),
    previousTotals: totalsByCurrency(previousTotals),
    categories: categoryRows,
    methods: methodRows,
    months: monthTotals(monthRows, historyRefunds),
    movementCount: count.rows[0]?.count ?? 0,
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
