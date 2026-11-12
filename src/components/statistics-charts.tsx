import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./ui/card";
import {
  amountUnits,
  chartScale,
  formatStatisticsAmount,
  statisticsMonthComplete,
  unitsDecimal,
  type StatisticsCategoryTotal,
  type StatisticsChartId,
  type StatisticsMonthTotal,
  type StatisticsRange,
} from "@/domain/statistics";
import type { Currency } from "@/domain/money";
import {
  movementDisplayMethods,
  type MovementDisplayMethod,
} from "@/domain/movements";
import { StatisticsFavoriteButton } from "./statistics-favorite-button";

const shortMonth = new Intl.DateTimeFormat("es-UY", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const longMonth = new Intl.DateTimeFormat("es-UY", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function longMonthLabel(period: string) {
  const label = longMonth.format(new Date(`${period}-01T00:00:00.000Z`));
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
}

function shortMonthLabel(period: string) {
  return shortMonth
    .format(new Date(`${period}-01T00:00:00.000Z`))
    .replace(".", "");
}

function monthPeriods(from: string, to: string) {
  const [fromYear, fromMonth] = from.slice(0, 7).split("-").map(Number);
  const [toYear, toMonth] = to.slice(0, 7).split("-").map(Number);
  const periods: string[] = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    periods.push(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
    );
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

function completeMonths(
  months: StatisticsMonthTotal[],
  currency: Currency,
  range: StatisticsRange,
) {
  const saved = new Map(
    months
      .filter((month) => month.currency === currency)
      .map((month) => [month.period, month]),
  );
  return monthPeriods(range.from, range.to).map(
    (period): StatisticsMonthTotal =>
      saved.get(period) ?? {
        period,
        label: longMonthLabel(period),
        currency,
        income: "0.0000",
        expense: "0.0000",
        refunds: "0.0000",
        recurring: null,
        complete: statisticsMonthComplete(period, range),
        missing: true,
      },
  );
}

export function StatisticsChartCard({
  chart,
  favorite,
  title,
  description,
  children,
}: {
  chart: StatisticsChartId;
  favorite: boolean | undefined;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card id={`estadisticas-${chart}`} className="min-w-0 gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {favorite !== undefined && (
          <StatisticsFavoriteButton chart={chart} favorite={favorite} />
        )}
      </div>
      {children}
    </Card>
  );
}

type BarRow = {
  key: string;
  label: string;
  amount: string;
  currency: Currency;
  href?: string;
  detail?: string;
};

export function StatisticsBarList({
  rows,
  empty,
  label,
}: {
  rows: BarRow[];
  empty: string;
  label: string;
}) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  const widths = chartScale(rows.map(({ amount }) => amount));
  return (
    <ul aria-label={label} className="grid gap-3">
      {rows.map((row, index) => (
        <li key={row.key} className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 wrap-anywhere text-sm font-medium">
              {row.href ? (
                <Link
                  href={row.href}
                  className="underline-offset-4 hover:underline"
                >
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </span>
            <span className="text-sm tabular-nums">
              {formatStatisticsAmount(row.amount, row.currency)}
            </span>
          </div>
          <div
            aria-hidden="true"
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${widths[index]}%` }}
            />
          </div>
          {row.detail && (
            <p className="text-xs text-muted-foreground">{row.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ChartTable({
  caption,
  headings,
  rows,
}: {
  caption: string;
  headings: string[];
  rows: string[][];
}) {
  return (
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        Ver datos
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-80 text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b">
              {headings.map((heading) => (
                <th key={heading} scope="col" className="py-2 pr-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")} className="border-b last:border-0">
                {row.map((cell, index) => (
                  <td
                    key={`${index}-${cell}`}
                    className="py-2 pr-3 tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function StatisticsMonthlyChart({
  months,
  currency,
  range,
}: {
  months: StatisticsMonthTotal[];
  currency: Currency;
  range: StatisticsRange;
}) {
  const rows = completeMonths(months, currency, range);
  if (!rows.length)
    return (
      <p className="text-sm text-muted-foreground">
        Sin datos para comparar en el período.
      </p>
    );
  const widths = chartScale(
    rows.flatMap((row) =>
      row.missing ? ["0.0000", "0.0000"] : [row.income, row.expense],
    ),
  );
  const width = 680;
  const height = 230;
  const left = 48;
  const bottom = 34;
  const top = 12;
  const plot = width - left - 12;
  const slot = plot / rows.length;
  const bar = Math.max(4, Math.min(18, slot / 3));
  const scaleHeight = height - top - bottom;
  const patternId = `statistics-expense-${currency}`;
  const titleId = `statistics-monthly-${currency}-title`;
  const descriptionId = `statistics-monthly-${currency}-description`;
  return (
    <figure className="grid gap-2">
      <div className="flex flex-wrap gap-4 text-sm" aria-label="Leyenda">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-sm bg-emerald-300"
          />
          Ingresos
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-sm bg-rose-300"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 2px, rgb(0 0 0 / 0.45) 2px 3px)",
            }}
          />
          Gastos
        </span>
      </div>
      <svg
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
      >
        <title id={titleId}>Ingresos y gastos por mes en {currency}</title>
        <desc id={descriptionId}>
          Período {range.label}. Las columnas sin datos se marcan como faltantes
          y no se interpolan.
        </desc>
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className="fill-rose-300" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              className="stroke-background"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <line
          x1={left}
          y1={height - bottom}
          x2={width - 12}
          y2={height - bottom}
          className="stroke-border"
        />
        {rows.map((row, index) => {
          const x = left + index * slot + slot / 2;
          if (row.missing)
            return (
              <g
                key={row.period}
                tabIndex={0}
                role="img"
                aria-label={`${row.label}: sin datos`}
                className="outline-offset-4"
              >
                <title>{row.label}: sin datos</title>
                <text
                  x={x}
                  y={height - bottom - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  Sin datos
                </text>
                <text
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {shortMonthLabel(row.period)}
                </text>
              </g>
            );
          const incomeHeight = (widths[index * 2] / 100) * scaleHeight;
          const expenseHeight = (widths[index * 2 + 1] / 100) * scaleHeight;
          const groupLabel = `${row.label}: ingresos ${formatStatisticsAmount(row.income, currency)}, gastos ${formatStatisticsAmount(row.expense, currency)}${row.complete ? "" : ", período incompleto"}`;
          return (
            <g
              key={row.period}
              tabIndex={0}
              role="img"
              aria-label={groupLabel}
              className="outline-offset-4"
            >
              <title>{groupLabel}</title>
              <rect
                x={x - bar - 2}
                y={height - bottom - incomeHeight}
                width={bar}
                height={incomeHeight}
                className="fill-emerald-300"
              />
              <rect
                x={x + 2}
                y={height - bottom - expenseHeight}
                width={bar}
                height={expenseHeight}
                fill={`url(#${patternId})`}
              />
              <text
                x={x}
                y={height - 12}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {shortMonthLabel(row.period)}
              </text>
              {!row.complete && (
                <text
                  x={x}
                  y={
                    height - bottom - Math.max(incomeHeight, expenseHeight) - 5
                  }
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  Incompleto
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ChartTable
        caption={`Datos de ingresos y gastos por mes en ${currency}`}
        headings={["Período", "Ingresos", "Gastos", "Estado"]}
        rows={rows.map((row) =>
          row.missing
            ? [row.label, "Sin datos", "Sin datos", "Sin datos"]
            : [
                row.label,
                formatStatisticsAmount(row.income, currency),
                formatStatisticsAmount(row.expense, currency),
                row.complete ? "Completo" : "Incompleto",
              ],
        )}
      />
    </figure>
  );
}

export function StatisticsHistoryChart({
  months,
  currency,
  range,
}: {
  months: StatisticsMonthTotal[];
  currency: Currency;
  range: StatisticsRange;
}) {
  const rows = completeMonths(months, currency, range);
  if (!rows.length)
    return (
      <p className="text-sm text-muted-foreground">
        Sin datos históricos para este período.
      </p>
    );
  const nets = rows.map(
    (row) => amountUnits(row.income) - amountUnits(row.expense),
  );
  const maximum = Math.max(...nets.map((value) => Math.abs(Number(value))), 1);
  const width = 680;
  const height = 230;
  const left = 12;
  const bottom = 34;
  const top = 12;
  const plot = width - left - 12;
  const slot = plot / rows.length;
  const bar = Math.max(4, Math.min(18, slot / 2));
  const middle = top + (height - top - bottom) / 2;
  const scaleHeight = (height - top - bottom) / 2;
  const titleId = `statistics-history-${currency}-title`;
  const descriptionId = `statistics-history-${currency}-description`;
  return (
    <figure className="grid gap-2">
      <svg
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
      >
        <title id={titleId}>Histórico por fecha en {currency}</title>
        <desc id={descriptionId}>
          Balance ordinario mensual de {range.label}. Las barras hacia arriba
          son ingresos mayores que gastos; hacia abajo, gastos mayores que
          ingresos. Los meses sin datos no se interpolan.
        </desc>
        <line
          x1={left}
          y1={middle}
          x2={width - 12}
          y2={middle}
          className="stroke-border"
        />
        {rows.map((row, index) => {
          const x = left + index * slot + slot / 2;
          if (row.missing)
            return (
              <g
                key={row.period}
                tabIndex={0}
                role="img"
                aria-label={`${row.label}: sin datos`}
                className="outline-offset-4"
              >
                <title>{row.label}: sin datos</title>
                <text
                  x={x}
                  y={middle - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  Sin datos
                </text>
                <text
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {shortMonthLabel(row.period)}
                </text>
              </g>
            );
          const net = nets[index];
          const barHeight = (Math.abs(Number(net)) / maximum) * scaleHeight;
          const positive = net >= BigInt(0);
          const label = `${row.label}: ingresos ${formatStatisticsAmount(row.income, currency)}, gastos ${formatStatisticsAmount(row.expense, currency)}, devoluciones ${formatStatisticsAmount(row.refunds, currency)}`;
          return (
            <g
              key={row.period}
              tabIndex={0}
              role="img"
              aria-label={label}
              className="outline-offset-4"
            >
              <title>{label}</title>
              <rect
                x={x - bar / 2}
                y={positive ? middle - barHeight : middle}
                width={bar}
                height={barHeight}
                className={positive ? "fill-emerald-300" : "fill-rose-300"}
              />
              <text
                x={x}
                y={height - 12}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {shortMonthLabel(row.period)}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTable
        caption={`Histórico mensual en ${currency}`}
        headings={["Período", "Ingresos", "Gastos", "Devoluciones", "Balance"]}
        rows={rows.map((row) => {
          if (row.missing)
            return [
              row.label,
              "Sin datos",
              "Sin datos",
              "Sin datos",
              "Sin datos",
            ];
          const balance = unitsDecimal(
            amountUnits(row.income) - amountUnits(row.expense),
          );
          return [
            row.label,
            formatStatisticsAmount(row.income, currency),
            formatStatisticsAmount(row.expense, currency),
            formatStatisticsAmount(row.refunds, currency),
            formatStatisticsAmount(balance, currency),
          ];
        })}
      />
    </figure>
  );
}

export function StatisticsCategoryBars({
  categories,
  kind,
  currency,
  search,
  selected,
}: {
  categories: StatisticsCategoryTotal[];
  kind: "income" | "expense";
  currency: Currency;
  search: (category: string) => string;
  selected?: string;
}) {
  const rows = categories
    .filter(
      (category) =>
        category.kind === kind &&
        category.currency === currency &&
        (!category.parentId || category.categoryId === selected),
    )
    .map((category) => ({
      key: `${kind}-${category.categoryId ?? "none"}`,
      label: category.category,
      amount: category.amount,
      currency,
      href: search(category.categoryId ?? "none"),
      detail: "Ver detalle",
    }));
  return (
    <StatisticsBarList
      rows={rows}
      empty="Sin categorías con movimientos en el período."
      label={`${kind === "expense" ? "Gastos" : "Ingresos"} por categoría en ${currency}`}
    />
  );
}

export function StatisticsMethodBars({
  methods,
  kind,
  currency,
  search,
}: {
  methods: {
    method: MovementDisplayMethod;
    kind: "income" | "expense";
    currency: Currency;
    amount: string;
    count: number;
  }[];
  kind: "income" | "expense";
  currency: Currency;
  search: (method: MovementDisplayMethod) => string;
}) {
  const rows = methods
    .filter((row) => row.kind === kind && row.currency === currency)
    .map((row) => ({
      key: `${kind}-${row.method}`,
      label: movementDisplayMethods[row.method],
      amount: row.amount,
      currency,
      href: search(row.method),
      detail: `${row.count} ${row.count === 1 ? "movimiento" : "movimientos"}`,
    }));
  return (
    <StatisticsBarList
      rows={rows}
      empty="Sin medios de pago registrados en el período."
      label={`${kind === "expense" ? "Gastos" : "Ingresos"} por medio en ${currency}`}
    />
  );
}
