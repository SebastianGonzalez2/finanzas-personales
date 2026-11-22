import type { ReactNode } from "react";
import type { Currency } from "@/domain/money";
import {
  amountUnits,
  formatStatisticsAmount,
  percentageChange,
  statisticsShare,
  unitsDecimal,
  type StatisticsSnapshot,
} from "@/domain/statistics";

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
