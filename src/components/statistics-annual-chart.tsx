"use client";

import { useState } from "react";
import type { Currency } from "@/domain/money";
import {
  amountUnits,
  formatStatisticsAmount,
  type StatisticsAnnualPoint,
} from "@/domain/statistics";
import { StatisticsChartTable } from "./statistics-chart-table";

const wholeAmount = new Intl.NumberFormat("es-UY", { useGrouping: "always" });

function exactAmount(amount: string, currency: Currency) {
  const [whole, fraction = ""] = amount.split(".");
  return /[1-9]/.test(fraction.slice(2))
    ? `${wholeAmount.format(BigInt(whole))},${fraction.replace(/0+$/, "")} ${currency}`
    : formatStatisticsAmount(amount, currency);
}

export function StatisticsAnnualChart({
  currency,
  points,
}: {
  currency: Currency;
  points: StatisticsAnnualPoint[];
}) {
  const [focusedYear, setFocusedYear] = useState<number>();
  const [hoveredYear, setHoveredYear] = useState<number>();
  const activeYear = hoveredYear ?? focusedYear;
  const largest = Math.max(
    1,
    ...points.map(({ value }) =>
      "amount" in value ? Number(amountUnits(value.amount)) : 0,
    ),
  );
  const plot = points.map(({ year, complete, value }, index) => {
    const x = ((index + 0.5) / points.length) * 100;
    const amount =
      "amount" in value ? exactAmount(value.amount, currency) : undefined;
    const y =
      "amount" in value
        ? 100 - (Number(amountUnits(value.amount)) / largest) * 100
        : null;
    const status =
      value.status === "missing-rate"
        ? "Falta cotización"
        : value.status === "no-records"
          ? "Sin registros"
          : value.status === "zero"
            ? "Sin gastos"
            : "";
    const label = [year, amount, status, complete ? "" : "Año en curso"]
      .filter(Boolean)
      .join(" · ");
    return { year, x, y, amount, complete, status, label };
  });
  const line = plot
    .map(({ x, y }, index) =>
      y === null ? "" : `${plot[index - 1]?.y != null ? "L" : "M"} ${x} ${y}`,
    )
    .join(" ");
  const active = plot.find(({ year }) => year === activeYear);
  const hasMissingRate = points.some(
    ({ value }) => value.status === "missing-rate",
  );

  return (
    <figure aria-label={`Serie anual en ${currency}`} className="min-w-0">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 text-sm">
        <span className="font-semibold">{currency}</span>
        {active && (
          <span className="lab-muted tabular-nums">{active.label}</span>
        )}
      </div>
      <div className="px-1 pt-3">
        <div className="relative h-28 border-y border-(--glaciar-border) sm:h-36">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
          >
            <line
              x1="0"
              x2="100"
              y1="50"
              y2="50"
              className="stroke-(--glaciar-border)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={line}
              fill="none"
              className="stroke-expense"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {plot.map(({ year, x, y, label, complete }) => (
            <button
              key={year}
              type="button"
              aria-label={label}
              onFocus={() => {
                setFocusedYear(year);
                setHoveredYear(undefined);
              }}
              onBlur={() => setFocusedYear(undefined)}
              onMouseEnter={() => setHoveredYear(year)}
              onMouseLeave={() => setHoveredYear(undefined)}
              onClick={(event) => event.currentTarget.focus()}
              className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--glaciar-text)"
              style={{ left: `${x}%`, top: `${y ?? 50}%` }}
            >
              {y === null ? (
                <span aria-hidden="true" className="lab-muted text-xs">
                  —
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`rounded-full border-2 border-expense ${year === activeYear ? "size-3.5" : "size-2.5"} ${complete ? "bg-expense" : "bg-(--glaciar-bg)"}`}
                />
              )}
            </button>
          ))}
        </div>
        <div
          className="lab-muted mt-3 grid text-center text-xs tabular-nums"
          aria-hidden="true"
          style={{
            gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
          }}
        >
          {plot.map(({ year, status }) => (
            <span key={year}>
              {year}
              {status && (
                <span className="mt-1 block text-[0.6875rem] leading-tight">
                  {status}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
      {hasMissingRate && (
        <p className="lab-muted mt-2 text-xs">
          Importe incompleto en los años con cotizaciones faltantes.
        </p>
      )}
      <StatisticsChartTable
        caption={`Gastos anuales en ${currency}`}
        headings={["Año", "Gastos", "Estado"]}
        rows={plot.map(({ year, amount, status, complete }) => [
          String(year),
          amount ?? "—",
          [status, complete ? "" : "Año en curso"]
            .filter(Boolean)
            .join(" · ") || "—",
        ])}
      />
    </figure>
  );
}
