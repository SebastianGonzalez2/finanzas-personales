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
const axisAmount = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 4 });
const compactAmount = new Intl.NumberFormat("es-UY", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatAxisAmount(amount: number) {
  if (amount >= 1_000_000) return compactAmount.format(amount);
  if (amount >= 1000) return `${axisAmount.format(amount / 1000)} mil`;
  return axisAmount.format(amount);
}

function exactAmount(amount: string, currency: Currency) {
  const [whole, fraction = ""] = amount.split(".");
  return /[1-9]/.test(fraction.slice(2))
    ? `${wholeAmount.format(BigInt(whole))},${fraction.replace(/0+$/, "")} ${currency}`
    : formatStatisticsAmount(amount, currency);
}

function annualScale(values: (number | null)[]) {
  const maximum = Math.max(0, ...values.map((value) => value ?? 0));
  if (maximum === 0) return { limit: 1, ticks: [0] };

  // Aim for four intervals with round labels. The plot alone uses floats.
  const roughStep = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiplier =
    [1, 2, 2.5, 5, 10].find(
      (candidate) => candidate * magnitude >= roughStep,
    ) ?? 10;
  const step = Math.max(0.0001, multiplier * magnitude);
  const intervals = Math.ceil(maximum / step);
  return {
    limit: intervals * step,
    ticks: Array.from(
      { length: intervals + 1 },
      (_, index) => (intervals - index) * step,
    ),
  };
}

const statusLabels = {
  "missing-rate": "Falta cotización",
  "no-records": "Sin registros",
  zero: "Sin gastos",
  total: "",
};

export function StatisticsAnnualChart({
  currency,
  points,
  cutoff,
}: {
  currency: Currency;
  points: StatisticsAnnualPoint[];
  cutoff: string;
}) {
  const [selectedYear, setSelectedYear] = useState<number>();
  const [hoveredYear, setHoveredYear] = useState<number>();
  const values = points.map(({ value }) =>
    "amount" in value ? Number(amountUnits(value.amount)) / 10_000 : null,
  );
  const scale = annualScale(values);
  const position = (amount: number) => 100 * (1 - amount / scale.limit);
  const plot = points.map(({ year, complete, value }, index) => {
    const numeric = values[index];
    const amount =
      "amount" in value ? exactAmount(value.amount, currency) : undefined;
    const x = ((index + 0.5) / points.length) * 100;
    const y = numeric === null ? null : position(numeric);
    const status = statusLabels[value.status];
    const partial = complete ? "" : `Año parcial al ${cutoff}`;
    const label = [year, amount, status, partial].filter(Boolean).join(" · ");
    const incomplete = value.status === "missing-rate";
    const readout = incomplete ? "Importe incompleto" : (amount ?? status);
    const note = amount || incomplete ? status : "";
    return { year, x, y, amount, status, partial, label, readout, note };
  });
  const line = plot
    .map(({ x, y }, index) =>
      y === null
        ? ""
        : `${plot[index - 1]?.y != null ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ")
    .trim();
  const active =
    plot.find(({ year }) => year === (hoveredYear ?? selectedYear)) ??
    plot.at(-1);

  return (
    <figure
      aria-label={`Serie anual en ${currency}`}
      className="gs-annual min-w-0"
    >
      {active && (
        <div className="gs-annual__readout flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="lab-muted text-sm tabular-nums">{active.year}</span>
          <strong className="text-lg font-semibold tabular-nums">
            {active.readout}
          </strong>
          {active.note && (
            <span className="lab-muted text-xs">{active.note}</span>
          )}
          {active.partial && (
            <span className="lab-muted text-xs">Parcial al {cutoff}</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 sm:gap-x-3">
        <div
          className="gs-annual__scale lab-muted grid text-right text-xs tabular-nums"
          aria-hidden="true"
        >
          <span className="gs-annual__unit">{currency}</span>
          <div className="gs-annual__height grid grid-cols-[max-content] grid-rows-[minmax(0,1fr)] justify-end">
            {scale.ticks.map((amount) => (
              <span
                key={amount}
                className="relative col-start-1 row-start-1 self-start -translate-y-1/2 whitespace-nowrap"
                style={{ top: `${position(amount)}%` }}
              >
                {formatAxisAmount(amount)}
              </span>
            ))}
          </div>
        </div>
        <div className="gs-annual__plot relative min-w-0">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="gs-annual__height pointer-events-none absolute inset-x-0 top-0 w-full overflow-visible"
          >
            {scale.ticks.map((amount) => (
              <line
                key={amount}
                x1="0"
                x2="100"
                y1={position(amount)}
                y2={position(amount)}
                className={
                  amount === 0
                    ? "stroke-(--glaciar-border-strong)"
                    : "stroke-(--glaciar-border)"
                }
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={line}
              fill="none"
              className="stroke-expense"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
            }}
          >
            {plot.map(({ year, y, label, partial, status }) => (
              <button
                key={year}
                type="button"
                className="gs-annual__year grid min-w-0 cursor-pointer content-start text-center"
                data-active={year === active?.year || undefined}
                data-partial={Boolean(partial) || undefined}
                data-gap={y === null || undefined}
                aria-label={label}
                onFocus={() => {
                  setSelectedYear(year);
                  setHoveredYear(undefined);
                }}
                onMouseEnter={() => setHoveredYear(year)}
                onMouseLeave={() => setHoveredYear(undefined)}
                onClick={(event) => {
                  setSelectedYear(year);
                  event.currentTarget.focus();
                }}
              >
                <span className="gs-annual__height relative" aria-hidden="true">
                  {y !== null && (
                    <span
                      className="gs-annual__dot absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ top: `${y}%` }}
                    />
                  )}
                </span>
                <span
                  className="lab-muted grid justify-items-center gap-y-1 px-0.5 pt-3 text-xs tabular-nums"
                  aria-hidden="true"
                >
                  <span className="gs-annual__year-label rounded-xs">
                    {year}
                  </span>
                  {status && (
                    <span className="text-[0.6875rem] leading-tight">
                      {status}
                    </span>
                  )}
                  {partial && (
                    <span className="text-[0.6875rem] leading-tight">
                      Parcial
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <StatisticsChartTable
        caption={`Gastos anuales en ${currency}`}
        headings={["Año", "Gastos", "Estado"]}
        rows={plot.map(({ year, amount, status, partial }) => [
          String(year),
          amount ?? "—",
          [status, partial].filter(Boolean).join(" · ") || "—",
        ])}
      />
    </figure>
  );
}
