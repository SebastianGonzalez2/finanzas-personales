import Link from "next/link";
import { formatBankReference } from "@/domain/bank-balances";
import {
  statisticsAnnualTitle,
  statisticsAnnualWindow,
  statisticsSearch,
  type StatisticsAnnual,
  type StatisticsFilters,
  type StatisticsRange,
} from "@/domain/statistics";
import { buttonClass } from "./ui/button";
import { StatisticsCategorySelect } from "./statistics-filters";
import { StatisticsChartCard } from "./statistics-charts";
import { StatisticsAnnualChart } from "./statistics-annual-chart";

const anchor = "#estadisticas-annual-expenses";

export function StatisticsAnnualCard({
  filters,
  categories,
  categoryAvailable,
  result,
  range,
  today,
}: {
  filters: StatisticsFilters;
  categories: React.ComponentProps<
    typeof StatisticsCategorySelect
  >["categories"];
  categoryAvailable: boolean;
  result?: StatisticsAnnual;
  range: StatisticsRange;
  today: string;
}) {
  const first = Number(range.from.slice(0, 4));
  const last = Number(range.to.slice(0, 4));
  const current = Number(today.slice(0, 4));
  const query = new URLSearchParams(
    statisticsSearch(filters, {
      category: undefined,
      detailPage: undefined,
      kind: filters.kind === "income" ? "expense" : filters.kind,
    }),
  );
  const href = (end: number) =>
    `/estadisticas${statisticsSearch(filters, {
      annualEnd: end === current ? undefined : String(end),
    })}${anchor}`;

  return (
    <StatisticsChartCard
      chart="annual-expenses"
      favorite={undefined}
      title={statisticsAnnualTitle}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-1">
          <form
            action={`/estadisticas${anchor}`}
            method="get"
            aria-label="Categoría del gráfico anual"
            className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:w-auto"
          >
            {[...query].map(([key, value]) => (
              <input type="hidden" key={key} name={key} value={value} />
            ))}
            <StatisticsCategorySelect
              key={filters.category ?? "all"}
              categories={categories}
              category={categoryAvailable ? filters.category : undefined}
              expensesOnly
            />
            <button type="submit" className={buttonClass("outline")}>
              Ver<span className="sr-only"> categoría</span>
            </button>
          </form>
          <nav
            aria-label="Historial anual"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          >
            <span className="font-semibold tabular-nums">
              {first}–{last}
            </span>
            {result?.hasEarlier && (
              <Link
                href={href(first - 1)}
                prefetch={false}
                className="lab-link inline-flex min-h-11 items-center"
              >
                Años anteriores
              </Link>
            )}
            {last < current && (
              <Link
                href={href(Math.min(current, last + statisticsAnnualWindow))}
                prefetch={false}
                className="lab-link inline-flex min-h-11 items-center"
              >
                Años recientes
              </Link>
            )}
          </nav>
        </div>
        {filters.kind === "income" ? (
          <p className="lab-muted text-sm">
            El filtro de ingresos está activo. Elegí una categoría de gasto para
            ver el gráfico.
          </p>
        ) : !categoryAvailable ? (
          <p className="lab-muted text-sm">
            Elegí una categoría de gasto disponible.
          </p>
        ) : result?.series.length ? (
          result.series.map(({ currency, points }) => (
            <StatisticsAnnualChart
              key={currency}
              currency={currency}
              points={points}
              cutoff={formatBankReference(today)}
            />
          ))
        ) : (
          <p className="lab-muted text-sm">
            Sin registros para estos años con los filtros actuales.
          </p>
        )}
      </div>
    </StatisticsChartCard>
  );
}
