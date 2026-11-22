import "server-only";
import type pg from "pg";
import {
  historyKinds,
  historyStates,
  parseHistoryParams,
} from "../domain/history.ts";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import { decimalToUnits, unitsToDecimal } from "../domain/money.ts";
import {
  budgetEstimates,
  budgetReferenceDates,
  budgetsReady,
  listBudgets,
  readBudgets,
} from "./budgets.ts";
import { classificationReady } from "./classification.ts";
import { listHistory } from "./history.ts";
import type { ReportPeriod } from "../lib/export/report-format.ts";

export const reportRowLimit = 4000;
export type ReportRows = Record<string, string[][]>;

export function reportMidpoint({ from, to }: ReportPeriod): string {
  const day = 86_400_000;
  const start = Date.parse(from);
  const days = (Date.parse(to) - start) / day + 1;
  return new Date(start + (Math.ceil(days / 2) - 1) * day)
    .toISOString()
    .slice(0, 10);
}

export function reportMonths({ from, to }: ReportPeriod) {
  const months = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  for (;;) {
    const month = start.toISOString().slice(0, 7);
    months.push(month);
    if (month === to.slice(0, 7)) break;
    start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return months;
}

// Same expense flows as Estadísticas and Presupuestos (budget_expenses, plus
// the expense part of legacy loan operations). Each installment counts once,
// in its own month.
const expenseFlows = `
      SELECT x.currency, x.amount, x.effective_on AS on_date, x.category_id
        FROM finance.budget_expenses x WHERE x.owner_id = $1
      UNION ALL
      SELECT o.currency, o.expense, f.effective_on, NULL
        FROM finance.loan_operations o
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
       WHERE o.owner_id = $1 AND f.status = 'confirmed' AND o.expense > 0`;

async function reportTotals(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
) {
  const { rows } = await client.query<{
    concept: string;
    currency: string;
    total: string;
    first: string;
    second: string;
  }>(
    `
    WITH flows(currency, amount, on_date, category_id) AS (${expenseFlows}
    ), scoped AS (SELECT * FROM flows WHERE on_date BETWEEN $2::date AND $3::date)
    SELECT concept, currency,
           sum(amount)::numeric(20,4)::text AS total,
           coalesce(sum(amount) FILTER (WHERE on_date <= $4::date), 0)::numeric(20,4)::text AS first,
           coalesce(sum(amount) FILTER (WHERE on_date > $4::date), 0)::numeric(20,4)::text AS second
      FROM (
        SELECT 'Gasto' AS concept, currency, amount, on_date FROM scoped
        UNION ALL
        SELECT 'Gasto por categoría · ' || coalesce(c.name, 'Sin categoría'), s.currency, s.amount, s.on_date
          FROM scoped s LEFT JOIN finance.categories c ON (c.owner_id, c.id) = ($1, s.category_id)
      ) totals
     GROUP BY concept, currency ORDER BY currency, concept
     LIMIT ${reportRowLimit + 1}`,
    [owner, period.from, period.to, reportMidpoint(period)],
  );
  return rows.map(({ concept, currency, total, first, second }) => [
    concept,
    currency,
    total,
    first,
    second,
  ]);
}

async function reportEvolution(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
) {
  const { rows } = await client.query<{
    month: string;
    currency: string;
    total: string;
  }>(
    `
    WITH flows(currency, amount, on_date, category_id) AS (${expenseFlows}
    )
    SELECT to_char(on_date, 'YYYY-MM') AS month, currency,
           sum(amount)::numeric(20,4)::text AS total
      FROM flows WHERE on_date BETWEEN $2::date AND $3::date
     GROUP BY 1, 2`,
    [owner, period.from, period.to],
  );
  const totals = new Map(
    rows.map(({ month, currency, total }) => [`${currency}|${month}`, total]),
  );
  const months = reportMonths(period);
  return [...new Set(rows.map(({ currency }) => currency))]
    .sort()
    .flatMap((currency) =>
      months.map((month, index) => {
        const total = totals.get(`${currency}|${month}`) ?? "0.0000";
        const previous =
          index === 0
            ? null
            : (totals.get(`${currency}|${months[index - 1]}`) ?? "0.0000");
        return [
          month,
          currency,
          total,
          previous === null
            ? ""
            : unitsToDecimal(decimalToUnits(total) - decimalToUnits(previous)),
        ];
      }),
    );
}

async function reportInstallments(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
) {
  const { rows } = await client.query<{
    month: string;
    concept: string;
    ordinal: number;
    count: number | null;
    category: string;
    currency: string;
    amount: string;
    id: string;
  }>(
    `SELECT to_char(x.effective_on, 'YYYY-MM') AS month, f.concept,
            x.installment_ordinal AS ordinal, p.installment_count AS count,
            coalesce(c.name, 'Sin categoría') AS category, x.currency,
            x.amount::text AS amount, x.id
       FROM (
         SELECT owner_id, id, effective_on, currency, amount, category_id, installment_ordinal
           FROM finance.expense_installments
         UNION ALL
         SELECT owner_id, id, effective_on, currency, amount, category_id, installment_ordinal
           FROM finance.credit_consumption WHERE installment_ordinal IS NOT NULL AND amount > 0
         UNION ALL
         SELECT owner_id, id, effective_on, currency, amount, category_id, installment_ordinal
           FROM finance.mixed_purchase_expenses WHERE installment_ordinal IS NOT NULL
       ) x
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (x.owner_id, x.id)
       LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (x.owner_id, x.id)
       LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (x.owner_id, x.category_id)
      WHERE x.owner_id = $1 AND x.effective_on BETWEEN $2::date AND $3::date
      ORDER BY x.effective_on, f.concept, x.installment_ordinal, x.id
      LIMIT ${reportRowLimit + 1}`,
    [owner, period.from, period.to],
  );
  return rows.map(
    ({ month, concept, ordinal, count, category, currency, amount, id }) => [
      month,
      concept,
      count ? `${ordinal} de ${count}` : String(ordinal),
      category,
      currency,
      amount,
      id,
    ],
  );
}

async function reportMovements(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
) {
  const query = parseHistoryParams({ ...period, status: "confirmed" });
  if ("error" in query) throw new Error("Período inválido");
  const { entries, hasNextPage } = await listHistory(
    client,
    owner,
    query,
    reportRowLimit,
  );
  if (hasNextPage) return null;
  const classified = await classificationReady(client);
  const { rows } = await client.query<{
    id: string;
    installments: number | null;
    category: string | null;
  }>(
    `
    SELECT f.id, p.installment_count AS installments,
      ${classified ? "coalesce(allocated.names, split.names)" : "split.names"} AS category
      FROM finance.financial_events f
      LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (f.owner_id, f.id)
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT coalesce(c.name, 'Sin categoría'), ', ' ORDER BY coalesce(c.name, 'Sin categoría')) AS names
        FROM finance.mixed_purchase_categories s
        LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (s.owner_id, s.category_id)
        WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id)
      ) split ON true
      ${
        classified
          ? `LEFT JOIN LATERAL (
        -- The current category breakdown replaces the original attribution.
        SELECT string_agg(DISTINCT coalesce(c.name, 'Sin categoría'), ', ' ORDER BY coalesce(c.name, 'Sin categoría')) AS names
        FROM finance.current_movement_allocations a
        LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (a.owner_id, a.category_id)
        WHERE (a.owner_id, a.event_id) = (f.owner_id, f.id)
      ) allocated ON true`
          : ""
      }
     WHERE f.owner_id = $1 AND f.id = ANY($2::uuid[])`,
    [owner, entries.map(({ id }) => id)],
  );
  const metadata = new Map(rows.map((row) => [row.id, row]));
  return entries.flatMap((entry) => {
    const meta = metadata.get(entry.id);
    const lines = entry.cardAmounts?.length
      ? entry.cardAmounts
      : [{ currency: entry.currency, amount: entry.amount }];
    return lines.map(({ currency, amount }) => [
      entry.effectiveOn,
      historyKinds[entry.kind],
      entry.concept,
      meta?.category ?? entry.category ?? "",
      meta?.installments?.toString() ?? "",
      currency,
      amount,
      historyStates[entry.status],
      entry.id,
    ]);
  });
}

// The report converts budget consumption with the same references Presupuestos
// fixes the first time a month is opened. These two steps give the export the
// same result for months the user never opened: first the pending dates (so the
// providers can be queried outside any transaction), then the capture itself.
export async function reportReferenceDates(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
  today = bankReferenceToday(),
) {
  const dates = new Set<string>();
  for (const month of reportMonths(period))
    for (const date of await budgetReferenceDates(client, owner, month, today))
      dates.add(date);
  return [...dates];
}

export async function prepareReportBudgets(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
  today = bankReferenceToday(),
) {
  if (!(await budgetsReady(client))) return;
  for (const month of reportMonths(period))
    await listBudgets(client, owner, month, today);
}

export async function loadPeriodReport(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
  today = bankReferenceToday(),
): Promise<ReportRows | null> {
  const movements = await reportMovements(client, owner, period);
  if (!movements || movements.length > reportRowLimit) return null;
  const months = reportMonths(period);
  const summary = await reportTotals(client, owner, period);
  const evolution = await reportEvolution(client, owner, period);
  const installments = await reportInstallments(client, owner, period);
  const budgets: string[][] = [];
  for (const month of months) {
    const items = await readBudgets(
      client,
      owner,
      month,
      period.from,
      period.to,
      {
        today,
        estimates: await budgetEstimates(client, owner, month, today, false),
      },
    );
    for (const item of items) {
      const spent = item.progress?.consumed;
      const references = item.references.map(
        (ref) =>
          `${ref.fromCurrency} a ${item.currency} ${ref.rate} (${ref.date}, ${ref.source}${ref.provisional ? ", estimación provisional" : ""})`,
      );
      if (spent === undefined)
        references.push("Faltan cotizaciones históricas");
      budgets.push([
        month,
        item.categoryName,
        item.currency,
        item.effectiveLimit,
        spent ?? "",
        spent === undefined
          ? ""
          : unitsToDecimal(
              decimalToUnits(item.effectiveLimit) - decimalToUnits(spent),
            ),
        references.join(", "),
      ]);
    }
    if (budgets.length > reportRowLimit) return null;
  }
  const result: ReportRows = {
    resumen: summary,
    evolucion: evolution,
    movimientos: movements,
    cuotas: installments,
    presupuestos: budgets,
  };
  return Object.values(result).some((rows) => rows.length > reportRowLimit)
    ? null
    : result;
}
