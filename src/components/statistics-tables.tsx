import type { ReactNode } from "react";
import { formatBankReference } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import {
  amountUnits,
  formatStatisticsAmount,
  percentageChange,
  statisticsShare,
  unitsDecimal,
  type StatisticsPosition,
  type StatisticsSnapshot,
} from "@/domain/statistics";

const positionSeries = [
  ["bank", "Banco"],
  ["reserved", "Reservado"],
  ["available", "Disponible"],
  ["cardDebt", "Deuda de tarjetas"],
  ["loanDebt", "Deuda de préstamos"],
  ["receivables", "Por cobrar"],
  ["cardCredit", "Saldo a favor en tarjetas"],
  ["netWorth", "Patrimonio registrado"],
] as const;

function PositionTrend({
  positions,
  metric,
  label,
  currency,
}: {
  positions: StatisticsPosition[];
  metric: (typeof positionSeries)[number][0];
  label: string;
  currency: Currency;
}) {
  const points = positions.flatMap((position) => {
    const value = position[metric];
    return value === null ? [] : [{ ...position, units: amountUnits(value) }];
  });
  if (points.length === 0) return null;
  const low = points.reduce(
    (min, { units }) => (units < min ? units : min),
    points[0].units,
  );
  const high = points.reduce(
    (max, { units }) => (units > max ? units : max),
    points[0].units,
  );
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const start = Date.parse(firstDate);
  const duration = Date.parse(lastDate) - start;
  const coordinates = points.map((point) => ({
    ...point,
    x:
      duration === 0
        ? 140
        : 5 + (270 * (Date.parse(point.date) - start)) / duration,
    y:
      high === low
        ? 30
        : 54 -
          Number(((point.units - low) * BigInt(4800)) / (high - low)) / 100,
  }));
  return (
    <figure className="grid min-w-0 gap-1 rounded-xl border border-(--glaciar-border) p-2">
      <figcaption className="text-sm font-medium">
        {label} · {currency}
      </figcaption>
      <svg
        aria-hidden="true"
        viewBox="0 0 280 60"
        className="w-full text-(--glaciar-accent)"
      >
        <polyline
          points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        {(metric === "bank" || coordinates.length === 1) &&
          coordinates.map(({ x, y, date, adjustment, bankStatus }) =>
            metric === "bank" && adjustment ? (
              <rect
                key={date}
                x={x - 3}
                y={y - 3}
                width="6"
                height="6"
                fill="currentColor"
              />
            ) : (
              <circle
                key={date}
                cx={x}
                cy={y}
                r="3"
                stroke="currentColor"
                fill={
                  metric !== "bank" || bankStatus === "confirmed"
                    ? "currentColor"
                    : "var(--card)"
                }
              />
            ),
          )}
      </svg>
      <p className="text-xs lab-muted">
        {formatBankReference(firstDate)}
        {duration > 0 && ` – ${formatBankReference(lastDate)}`} ·{" "}
        {formatStatisticsAmount(unitsDecimal(low), currency)}
        {high !== low &&
          ` a ${formatStatisticsAmount(unitsDecimal(high), currency)}`}
      </p>
    </figure>
  );
}

function StatisticsTable({
  title,
  headings,
  children,
}: {
  title: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label={title}
      tabIndex={0}
    >
      <table className="w-full text-left text-sm">
        <caption className="pb-2 text-left font-medium">{title}</caption>
        <thead>
          <tr className="border-b bg-(--glaciar-hover)">
            {headings.map((label) => (
              <th scope="col" key={label} className="px-2 py-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y [&_td]:px-2 [&_td]:py-2 [&_td]:tabular-nums [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function StatisticsComparisonTable({
  title,
  currency,
  rows,
}: {
  title: string;
  currency: Currency;
  rows: {
    id?: string;
    label: string;
    current: string | null;
    previous: string | null;
  }[];
}) {
  const show = (value: string | null) =>
    value === null ? "Sin datos" : formatStatisticsAmount(value, currency);
  return (
    <StatisticsTable
      title={title}
      headings={[
        "Métrica",
        "Período elegido",
        "Comparación",
        "Diferencia",
        "Variación",
      ]}
    >
      {rows.map(({ id, label, current, previous }) => {
        const comparable = current !== null && previous !== null;
        return (
          <tr key={id ?? label}>
            <th scope="row">{label}</th>
            <td>{show(current)}</td>
            <td>{show(previous)}</td>
            <td>
              {comparable
                ? show(
                    unitsDecimal(amountUnits(current) - amountUnits(previous)),
                  )
                : "—"}
            </td>
            <td>
              {comparable
                ? (percentageChange(current, previous) ?? "Base cero")
                : "—"}
            </td>
          </tr>
        );
      })}
    </StatisticsTable>
  );
}

export function StatisticsPositions({
  snapshot,
}: {
  snapshot: StatisticsSnapshot;
}) {
  const trend = snapshot.positions
    .filter(
      ({ date }) =>
        date >= snapshot.historyRange.from && date <= snapshot.historyRange.to,
    )
    .reverse();
  const codes = [...new Set(trend.map(({ currency }) => currency))];
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold">Situación financiera por fecha</h3>
      <p className="text-sm lab-muted">
        Saldos, reservas y deudas al cierre del día según los registros
        disponibles. Se aplica el filtro de moneda.
      </p>
      {codes.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-(--glaciar-text)">
            Ver evolución de saldos y patrimonio
          </summary>
          <p className="mb-2 text-xs lab-muted">
            En Banco, un punto lleno indica un saldo confirmado, un punto hueco
            indica un saldo calculado y un cuadrado marca un ajuste.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {codes.flatMap((currency) =>
              positionSeries.map(([metric, label]) => (
                <PositionTrend
                  key={`${currency}-${metric}`}
                  positions={trend.filter(
                    (point) => point.currency === currency,
                  )}
                  metric={metric}
                  label={label}
                  currency={currency}
                />
              )),
            )}
          </div>
        </details>
      )}
      {snapshot.positions.length === 0 ? (
        <p className="text-sm lab-muted">
          Sin saldos, reservas ni deudas registrados para estas fechas.
        </p>
      ) : (
        <StatisticsTable
          title="Saldos y patrimonio por fecha"
          headings={[
            "Fecha",
            "Moneda",
            "Banco",
            "Estado bancario",
            "Reservado",
            "Disponible",
            "Deuda de tarjetas",
            "Deuda de préstamos",
            "Por cobrar",
            "Saldo a favor en tarjetas",
            "Patrimonio registrado",
          ]}
        >
          {snapshot.positions.map((position) => {
            const show = (value: string | null) =>
              value === null
                ? "Sin saldo inicial"
                : formatStatisticsAmount(value, position.currency);
            return (
              <tr key={`${position.date}-${position.currency}`}>
                <th scope="row" className="whitespace-nowrap">
                  {formatBankReference(position.date)}
                  {position.date === snapshot.range.to && (
                    <span className="block text-xs">Período elegido</span>
                  )}
                  {position.date === snapshot.previous?.to && (
                    <span className="block text-xs">Comparación</span>
                  )}
                </th>
                <td>{position.currency}</td>
                <td>{show(position.bank)}</td>
                <td>
                  {position.bankStatus === "confirmed"
                    ? "Confirmado"
                    : position.bankStatus === "calculated"
                      ? "Calculado"
                      : "Sin confirmar"}
                  {position.adjustment && " · Ajuste"}
                </td>
                {[
                  position.reserved,
                  position.available,
                  position.cardDebt,
                  position.loanDebt,
                  position.receivables,
                  position.cardCredit,
                  position.netWorth,
                ].map((amount, index) => (
                  <td key={index}>{show(amount)}</td>
                ))}
              </tr>
            );
          })}
        </StatisticsTable>
      )}
    </section>
  );
}

export function StatisticsRecurringExpenses({
  snapshot,
}: {
  snapshot: StatisticsSnapshot;
}) {
  const recurring = (row: StatisticsSnapshot["totals"][number]) =>
    row.recurring;
  const other = (row: StatisticsSnapshot["totals"][number]) =>
    row.recurring === null
      ? null
      : unitsDecimal(amountUnits(row.expense) - amountUnits(row.recurring));
  const codes = [
    ...new Set(
      [...snapshot.totals, ...snapshot.previousTotals].map(
        (row) => row.currency,
      ),
    ),
  ];
  const monthly = snapshot.months.filter(
    (row) => row.recurring !== null && amountUnits(row.expense) > BigInt(0),
  );
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold">Gastos recurrentes</h3>
      {!snapshot.recurrencesReady ? (
        <p className="text-sm lab-muted">
          Disponible al habilitar la confirmación de recurrencias.
        </p>
      ) : codes.length === 0 ? (
        <p className="text-sm lab-muted">
          Sin gastos registrados en los períodos elegidos.
        </p>
      ) : (
        <>
          {codes.map((currency) => {
            const current = snapshot.totals.find(
              (row) => row.currency === currency,
            );
            const previous = snapshot.previousTotals.find(
              (row) => row.currency === currency,
            );
            const share = current?.recurring
              ? statisticsShare(current.recurring, current.expense)
              : null;
            return (
              <div className="grid gap-2" key={currency}>
                <StatisticsComparisonTable
                  title={`Recurrencia en ${currency}`}
                  currency={currency}
                  rows={[
                    {
                      label: "Recurrentes",
                      current: current ? recurring(current) : null,
                      previous: previous ? recurring(previous) : null,
                    },
                    {
                      label: "No recurrentes",
                      current: current ? other(current) : null,
                      previous: previous ? other(previous) : null,
                    },
                  ]}
                />
                {share && (
                  <p className="text-sm">
                    Los recurrentes representan {share} del gasto del período en{" "}
                    {currency}.
                  </p>
                )}
              </div>
            );
          })}
          {monthly.length > 0 && (
            <StatisticsTable
              title="Evolución mensual de gastos recurrentes"
              headings={[
                "Mes",
                "Moneda",
                "Recurrentes",
                "No recurrentes",
                "Proporción recurrente",
              ]}
            >
              {monthly.map((row) => {
                const amount = row.recurring ?? "0";
                const share = statisticsShare(amount, row.expense);
                const width =
                  Number(
                    (amountUnits(amount) * BigInt(1000)) /
                      amountUnits(row.expense),
                  ) / 10;
                return (
                  <tr key={`${row.period}-${row.currency}`}>
                    <th scope="row">{row.label}</th>
                    <td>{row.currency}</td>
                    <td>{formatStatisticsAmount(amount, row.currency)}</td>
                    <td>
                      {formatStatisticsAmount(
                        unitsDecimal(
                          amountUnits(row.expense) - amountUnits(amount),
                        ),
                        row.currency,
                      )}
                    </td>
                    <td>
                      <span>{share}</span>
                      <span
                        aria-hidden="true"
                        className="mt-1 block h-2 min-w-16 rounded-full bg-(--glaciar-track)"
                      >
                        <span
                          className="block h-full rounded-full bg-expense"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </StatisticsTable>
          )}
        </>
      )}
    </section>
  );
}
