import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  amountUnits,
  formatStatisticsAmount,
  retiredStatisticsCharts,
  statisticsChartIdList,
  statisticsChartIds,
  statisticsSearch,
  statisticsDaysBetween,
  statisticsSummary,
  type StatisticsChartId,
  type StatisticsFilters,
  type StatisticsSnapshot,
  type StatisticsView,
} from "@/domain/statistics";
import { formatBankReference } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { fxSourceName, sumFx } from "@/domain/exchange-rates";
import { movementDisplayMethods } from "@/domain/movements";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";
import { Kpi } from "./glaciar/screen";
import { percentageChange } from "@/domain/statistics";
import {
  StatisticsComparisonTable,
  StatisticsPositions,
  StatisticsRecurringExpenses,
} from "./statistics-tables";
import {
  StatisticsBarList,
  StatisticsCategoryBars,
  StatisticsChartCard,
  StatisticsHistoryChart,
  StatisticsMethodBars,
  StatisticsMonthlyChart,
} from "./statistics-charts";

const laneMain: StatisticsChartId[] = ["income-expense"];
const laneSide: StatisticsChartId[] = ["expense-categories", "summary"];

function currencies(values: { currency: Currency }[]) {
  return [...new Set(values.map(({ currency }) => currency))].sort();
}

const flowLabels = {
  income: "Ingreso",
  expense: "Gasto",
  refund: "Devolución acreditada",
};

function compareRows<T>(
  current: T[],
  previous: T[],
  key: (row: T) => string,
  label: (row: T) => string,
  amount: (row: T) => string,
) {
  const left = new Map(current.map((row) => [key(row), row]));
  const right = new Map(previous.map((row) => [key(row), row]));
  return [...new Set([...left.keys(), ...right.keys()])].map((id) => {
    const a = left.get(id);
    const b = right.get(id);
    return {
      label: label((a ?? b) as T),
      current: a ? amount(a) : null,
      previous: b ? amount(b) : null,
      id,
    };
  });
}

function CategoryComparison({
  snapshot,
  currency,
  kind,
}: {
  snapshot: StatisticsSnapshot;
  currency: Currency;
  kind: "income" | "expense";
}) {
  const relevant = (row: StatisticsSnapshot["categories"][number]) =>
    row.kind === kind && row.currency === currency;
  const all = [...snapshot.categories, ...snapshot.previousCategories];
  const parents = new Map(
    all
      .filter((row) => !row.parentId && row.categoryId)
      .map((row) => [row.categoryId, row.category]),
  );
  const rows = compareRows(
    snapshot.categories.filter(relevant),
    snapshot.previousCategories.filter(relevant),
    (row) => row.categoryId ?? "none",
    (row) =>
      row.parentId && parents.has(row.parentId)
        ? `${parents.get(row.parentId)} › ${row.category}`
        : row.category,
    (row) => row.amount,
  );
  return (
    rows.length > 0 &&
    snapshot.previous && (
      <StatisticsComparisonTable
        currency={currency}
        title={`Comparación por categoría en ${currency}`}
        rows={rows}
      />
    )
  );
}

type TotalRow = StatisticsSnapshot["totals"][number];

function MetricDelta({
  current,
  previous,
  label,
  good,
}: {
  current: string | undefined;
  previous: string | undefined;
  label: string;
  good: "up" | "down" | null;
}) {
  if (current === undefined || previous === undefined) return null;
  const change = percentageChange(current, previous);
  if (change === null)
    return <span className="lab-delta">Base cero vs. {label}</span>;
  const diff = amountUnits(current) - amountUnits(previous);
  const up = diff >= BigInt(0);
  const tone =
    good === null || diff === BigInt(0)
      ? ""
      : (good === "up") === up
        ? " is-good"
        : " is-bad";
  return (
    <span className={`lab-delta${tone}`}>
      <Icon name={up ? "trendUp" : "trendDown"} className="size-3.5" />
      {change} vs. {label}
    </span>
  );
}

function StatisticsMetrics({
  snapshot,
  favorite,
}: {
  snapshot: StatisticsSnapshot;
  favorite: boolean | undefined;
}) {
  const periods = [snapshot.range, snapshot.previous];
  const metrics = [
    {
      label: "Gastos",
      get: (row: TotalRow) => row.expense,
      good: "down" as const,
      hero: true,
    },
  ];
  const available = currencies([
    ...snapshot.totals,
    ...snapshot.previousTotals,
  ]);
  return (
    <StatisticsChartCard
      chart="metrics"
      favorite={favorite}
      title={statisticsChartIds.metrics}
      description={`${snapshot.range.label}${snapshot.previous ? ` frente a ${snapshot.previous.label}` : ""}`}
    >
      {periods.some((period) => period && !period.complete) && (
        <p className="lab-muted text-xs">
          La fecha de hoy todavía está en curso.
        </p>
      )}
      {snapshot.previous &&
        statisticsDaysBetween(snapshot.range.from, snapshot.range.to) !==
          statisticsDaysBetween(
            snapshot.previous.from,
            snapshot.previous.to,
          ) && (
          <p className="lab-muted text-xs">
            Los períodos tienen distinta duración.
          </p>
        )}
      {available.length === 0 ? (
        <p role="status" className="lab-muted text-sm">
          No hay movimientos registrados con estos filtros.
        </p>
      ) : (
        available.map((currency) => {
          const current = snapshot.totals.find(
            (row) => row.currency === currency,
          );
          const previous = snapshot.previousTotals.find(
            (row) => row.currency === currency,
          );
          return (
            <div key={currency} className="grid gap-3">
              {available.length > 1 && (
                <h3 className="text-sm font-semibold">{currency}</h3>
              )}
              <div className="gs-kpis">
                {metrics.map(({ label, get, good, hero }) => {
                  const now = current ? get(current) : undefined;
                  const before = previous ? get(previous) : undefined;
                  return (
                    <Kpi
                      key={label}
                      label={label}
                      hero={hero}
                      value={
                        now === undefined
                          ? "Sin datos"
                          : formatStatisticsAmount(now, currency)
                      }
                      extra={
                        snapshot.previous && (
                          <MetricDelta
                            current={now}
                            previous={before}
                            label={snapshot.previous.label}
                            good={good}
                          />
                        )
                      }
                    />
                  );
                })}
              </div>
              <StatisticsComparisonTable
                title={`Indicadores en ${currency}`}
                currency={currency}
                rows={metrics.map(({ label, get }) => ({
                  label,
                  current: current ? get(current) : null,
                  previous: previous ? get(previous) : null,
                }))}
              />
            </div>
          );
        })
      )}
    </StatisticsChartCard>
  );
}
function StatisticsSummaryCard({
  snapshot,
  favorite,
  filters,
}: {
  snapshot: StatisticsSnapshot;
  favorite: boolean | undefined;
  filters: StatisticsFilters;
}) {
  const summary = statisticsSummary(snapshot);
  return (
    <StatisticsChartCard
      chart="summary"
      favorite={favorite}
      title={statisticsChartIds.summary}
      description={snapshot.range.label}
    >
      <div
        role={summary.status === "insufficient" ? "status" : undefined}
        className="grid gap-2 text-sm"
      >
        {summary.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <Link
        className={buttonClass("outline")}
        href={`/estadisticas${statisticsSearch(filters, { view: "todas" })}#estadisticas-metrics`}
      >
        Ver indicadores del período
      </Link>
    </StatisticsChartCard>
  );
}

function StatisticsDrilldown({
  snapshot,
  filters,
  categoryName,
}: {
  snapshot: StatisticsSnapshot;
  filters: StatisticsFilters;
  categoryName?: string;
}) {
  const children = snapshot.categories.filter(
    (category) => category.parentId && category.parentId === filters.category,
  );
  const page = Number(filters.detailPage ?? 1);
  const clearHref = `/estadisticas${statisticsSearch(filters, { category: undefined, kind: undefined, method: undefined, card: undefined, tag: undefined, tags: undefined, detailPage: undefined })}`;
  const current = categoryName
    ? categoryName
    : filters.category === "none"
      ? "Sin categorizar"
      : "Movimientos filtrados";
  return (
    <>
      <nav aria-label="Ruta del detalle" className="gs-crumbs">
        <Link href={clearHref}>Estadísticas</Link>
        <Icon name="chevronRight" className="size-3.5" />
        <span aria-current="page">{current}</span>
      </nav>
      {children.length > 0 && (
        <section className="lab-panel gs-span-5" aria-label="Subcategorías">
          <header className="lab-panel__head">
            <h3 className="lab-panel__title">Subcategorías</h3>
          </header>
          <StatisticsBarList
            label="Subcategorías"
            empty="Sin subcategorías con movimientos."
            rows={children.map((child) => ({
              key: `${child.currency}-${child.categoryId}-${child.kind}`,
              label: child.category,
              amount: child.amount,
              currency: child.currency,
              tone: child.kind,
              href: `/estadisticas${statisticsSearch(filters, {
                category: child.categoryId ?? "none",
                currency: child.currency,
                kind: child.kind,
                detailPage: undefined,
              })}`,
              detail: "Ver movimientos",
            }))}
          />
        </section>
      )}
      <section
        className={`lab-panel ${children.length > 0 ? "gs-span-7" : ""}`}
        aria-labelledby="estadisticas-detalle-titulo"
      >
        <header className="lab-panel__head">
          <h2 id="estadisticas-detalle-titulo" className="lab-panel__title">
            Detalle de movimientos
            {categoryName
              ? ` · ${categoryName}`
              : filters.category === "none"
                ? " · Sin categorizar"
                : ""}
          </h2>
          <Link href={clearHref} className={buttonClass("outline")}>
            Quitar filtros de detalle
          </Link>
        </header>
        <h3 className="text-sm font-semibold">
          Movimientos que explican la cifra
        </h3>
        {snapshot.entries.length === 0 ? (
          <p className="lab-muted text-sm">
            No hay movimientos con estos filtros en esta página.
          </p>
        ) : (
          <ul className="gs-rows">
            {snapshot.entries.map((entry) => (
              <li
                key={`${entry.kind}-${entry.id}-${entry.currency}-${entry.date}`}
              >
                <Link
                  href={`/historial/movimientos/${entry.id}#titulo-pagina`}
                  className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-1 hover:bg-(--glaciar-hover)"
                >
                  <div className="gs-row__main">
                    <p className="gs-row__title">{entry.concept}</p>
                    <p className="gs-row__sub">
                      {formatBankReference(entry.date)} ·{" "}
                      {flowLabels[entry.kind]}
                    </p>
                  </div>
                  <span className="gs-row__aside">
                    <span
                      className={`gs-row__amount ${entry.kind === "expense" ? "is-negative" : "is-positive"}`}
                    >
                      {formatStatisticsAmount(entry.amount, entry.currency)}
                    </span>
                    {entry.quote && (
                      <small className="lab-muted">
                        {formatStatisticsAmount(
                          sumFx([
                            { amount: entry.amount, rate: entry.quote.rate },
                          ])!,
                          entry.quote.target,
                        )}
                        {" · "}
                        {formatBankReference(entry.quote.observed)} ·{" "}
                        {fxSourceName(entry.quote.source)}
                      </small>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <nav
          aria-label="Páginas de movimientos"
          className="flex flex-wrap gap-2"
        >
          {page > 1 && (
            <Link
              className={buttonClass("outline")}
              href={`/estadisticas${statisticsSearch(filters, { detailPage: String(page - 1) })}`}
            >
              Página anterior
            </Link>
          )}
          {snapshot.hasNextPage && page < 999999 && (
            <Link
              className={buttonClass("outline")}
              href={`/estadisticas${statisticsSearch(filters, { detailPage: String(page + 1) })}`}
            >
              Página siguiente
            </Link>
          )}
        </nav>
      </section>
    </>
  );
}
export function StatisticsDashboard({
  snapshot,
  filters,
  favorites,
  favoritesReady,
  view,
  categoryName,
}: {
  snapshot: StatisticsSnapshot;
  filters: StatisticsFilters;
  favorites: StatisticsChartId[];
  favoritesReady: boolean;
  view: StatisticsView;
  categoryName?: string;
}) {
  const favorite = (chart: StatisticsChartId) =>
    favoritesReady ? favorites.includes(chart) : undefined;
  const monthlyCurrencies = currencies(snapshot.months);
  const categoryCurrencies = currencies([
    ...snapshot.categories,
    ...snapshot.previousCategories,
  ]);
  const methodCurrencies = currencies([
    ...snapshot.methods,
    ...snapshot.previousMethods,
  ]);
  const originalCurrency = (currency: Currency) =>
    snapshot.fx && !snapshot.fx.missingFlows.length
      ? filters.currency
      : currency;
  const methodsSearch = (
    currency: Currency,
    kind: "income" | "expense",
    method: StatisticsFilters["method"],
  ) =>
    `/estadisticas${statisticsSearch(filters, { currency: originalCurrency(currency), kind, method, detailPage: undefined })}`;
  const cards: Record<StatisticsChartId, ReactNode> = {
    metrics: (
      <StatisticsMetrics
        key="metrics"
        snapshot={snapshot}
        favorite={favorite("metrics")}
      />
    ),
    "income-expense": (
      <StatisticsChartCard
        key="income-expense"
        chart="income-expense"
        favorite={favorite("income-expense")}
        title={statisticsChartIds["income-expense"]}
        description="Barras agrupadas por mes. Las series sin datos no se interpolan."
      >
        <div className="grid gap-5">
          {monthlyCurrencies.length === 0 ? (
            <p className="lab-muted text-sm">
              Sin datos para comparar en el período.
            </p>
          ) : (
            monthlyCurrencies.map((currency) => (
              <section key={currency} className="grid gap-2">
                <h3 className="text-sm font-semibold">{currency}</h3>
                <StatisticsMonthlyChart
                  months={snapshot.months}
                  currency={currency}
                  range={snapshot.historyRange}
                />
              </section>
            ))
          )}
        </div>
      </StatisticsChartCard>
    ),
    "expense-categories": (
      <StatisticsChartCard
        key="expense-categories"
        chart="expense-categories"
        favorite={favorite("expense-categories")}
        title={statisticsChartIds["expense-categories"]}
        description="Seleccioná una categoría para profundizar hasta los movimientos que explican el importe."
      >
        <div className="grid gap-5">
          {categoryCurrencies.map((currency) => (
            <section key={currency} className="grid gap-2">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <StatisticsCategoryBars
                categories={snapshot.categories}
                kind="expense"
                currency={currency}
                selected={filters.category}
                search={(category) =>
                  `/estadisticas${statisticsSearch(filters, { category, currency: originalCurrency(currency), kind: "expense", detailPage: undefined })}`
                }
              />
              <CategoryComparison
                snapshot={snapshot}
                kind="expense"
                currency={currency}
              />
            </section>
          ))}
          {categoryCurrencies.length === 0 && (
            <p className="lab-muted text-sm">
              Sin categorías con movimientos en el período.
            </p>
          )}
        </div>
      </StatisticsChartCard>
    ),
    "income-categories": (
      <StatisticsChartCard
        key="income-categories"
        chart="income-categories"
        favorite={favorite("income-categories")}
        title={statisticsChartIds["income-categories"]}
        description="Seleccioná una categoría para profundizar hasta los movimientos que explican el importe."
      >
        <div className="grid gap-5">
          {categoryCurrencies.map((currency) => (
            <section key={currency} className="grid gap-2">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <StatisticsCategoryBars
                categories={snapshot.categories}
                kind="income"
                currency={currency}
                selected={filters.category}
                search={(category) =>
                  `/estadisticas${statisticsSearch(filters, { category, currency: originalCurrency(currency), kind: "income", detailPage: undefined })}`
                }
              />
              <CategoryComparison
                snapshot={snapshot}
                kind="income"
                currency={currency}
              />
            </section>
          ))}
          {categoryCurrencies.length === 0 && (
            <p className="lab-muted text-sm">
              Sin categorías con movimientos en el período.
            </p>
          )}
        </div>
      </StatisticsChartCard>
    ),
    methods: (
      <StatisticsChartCard
        key="methods"
        chart="methods"
        favorite={favorite("methods")}
        title={statisticsChartIds.methods}
        description="Importes registrados según el medio de pago. Un pago de tarjeta no se cuenta como segundo gasto."
      >
        <div className="grid gap-5">
          {methodCurrencies.map((currency) => (
            <section key={currency} className="grid gap-3">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <h4 className="text-sm font-medium">Gastos</h4>
                  <StatisticsMethodBars
                    methods={snapshot.methods}
                    kind="expense"
                    currency={currency}
                    search={(method) =>
                      methodsSearch(currency, "expense", method)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <h4 className="text-sm font-medium">Ingresos</h4>
                  <StatisticsMethodBars
                    methods={snapshot.methods}
                    kind="income"
                    currency={currency}
                    search={(method) =>
                      methodsSearch(currency, "income", method)
                    }
                  />
                </div>
              </div>
              {snapshot.previous && (
                <StatisticsComparisonTable
                  title={`Comparación por medio en ${currency}`}
                  currency={currency}
                  rows={compareRows(
                    snapshot.methods.filter((row) => row.currency === currency),
                    snapshot.previousMethods.filter(
                      (row) => row.currency === currency,
                    ),
                    (row) => `${row.kind}-${row.method}`,
                    (row) =>
                      `${flowLabels[row.kind]} · ${movementDisplayMethods[row.method]}`,
                    (row) => row.amount,
                  )}
                />
              )}
            </section>
          ))}
          {methodCurrencies.length === 0 && (
            <p className="lab-muted text-sm">
              Sin medios de pago registrados en el período.
            </p>
          )}
        </div>
        <StatisticsRecurringExpenses snapshot={snapshot} />
      </StatisticsChartCard>
    ),
    history: (
      <StatisticsChartCard
        key="history"
        chart="history"
        favorite={favorite("history")}
        title={statisticsChartIds.history}
        description={`Flujo mensual y situación financiera al cierre de cada fecha. ${snapshot.historyRange.label}.`}
      >
        <div className="grid gap-5">
          {currencies(snapshot.months).map((currency) => (
            <section key={currency} className="grid gap-2">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <StatisticsHistoryChart
                months={snapshot.months}
                currency={currency}
                range={snapshot.historyRange}
              />
            </section>
          ))}
          {currencies(snapshot.months).length === 0 && (
            <p className="lab-muted text-sm">
              Sin datos históricos para este período.
            </p>
          )}
        </div>
        <StatisticsPositions snapshot={snapshot} />
      </StatisticsChartCard>
    ),
    summary: (
      <StatisticsSummaryCard
        key="summary"
        snapshot={snapshot}
        favorite={favorite("summary")}
        filters={filters}
      />
    ),
  };
  const shown = statisticsChartIdList.filter(
    (id) => !retiredStatisticsCharts.includes(id),
  );
  const visible =
    view === "favoritos" ? favorites.filter((id) => shown.includes(id)) : shown;
  const main = visible.filter((id) => laneMain.includes(id));
  const side = visible.filter((id) => laneSide.includes(id));
  const head = visible.filter((id) => id === "metrics");
  // M-05: en «Todas» se usan dos carriles. En «Mis favoritos» solo si el orden
  // visual resultante (Indicadores, principal, lateral) coincide con el orden
  // global guardado; si no, una columna que lo respeta (DOM = visual = teclado).
  const laneOrder = [...head, ...main, ...side];
  const lanes =
    main.length > 0 &&
    side.length > 0 &&
    (view === "todas" || laneOrder.every((id, index) => id === visible[index]));
  const detail =
    filters.category ||
    filters.method ||
    filters.kind ||
    filters.card ||
    filters.tag ||
    filters.tags;
  return (
    <div className="gs-grid">
      {detail && (
        <StatisticsDrilldown
          snapshot={snapshot}
          filters={filters}
          categoryName={categoryName}
        />
      )}
      {lanes ? (
        <>
          {head.map((chart) => (
            <Fragment key={chart}>{cards[chart]}</Fragment>
          ))}
          <div className="gs-lane-main gs-stack">
            {main.map((chart) => (
              <Fragment key={chart}>{cards[chart]}</Fragment>
            ))}
          </div>
          <div className="gs-lane-side gs-stack">
            {side.map((chart) => (
              <Fragment key={chart}>{cards[chart]}</Fragment>
            ))}
          </div>
        </>
      ) : (
        visible.map((chart) => <Fragment key={chart}>{cards[chart]}</Fragment>)
      )}
    </div>
  );
}
