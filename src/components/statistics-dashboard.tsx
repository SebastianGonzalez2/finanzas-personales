import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  amountUnits,
  formatStatisticsAmount,
  statisticsChartIdList,
  statisticsChartIds,
  statisticsSearch,
  statisticsDaysBetween,
  statisticsSummary,
  unitsDecimal,
  type StatisticsChartId,
  type StatisticsFilters,
  type StatisticsSnapshot,
  type StatisticsView,
} from "@/domain/statistics";
import { formatBankReference } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { movementDisplayMethods } from "@/domain/movements";
import { historyButton } from "./history-fields";
import {
  StatisticsComparisonTable,
  StatisticsPositions,
  StatisticsRecurringExpenses,
} from "./statistics-tables";
import { Card } from "./ui/card";
import {
  StatisticsBarList,
  StatisticsCategoryBars,
  StatisticsChartCard,
  StatisticsHistoryChart,
  StatisticsMethodBars,
  StatisticsMonthlyChart,
} from "./statistics-charts";

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

function StatisticsMetrics({
  snapshot,
  favorite,
}: {
  snapshot: StatisticsSnapshot;
  favorite: boolean | undefined;
}) {
  const periods = [snapshot.range, snapshot.previous];
  const net = (row: StatisticsSnapshot["totals"][number]) =>
    unitsDecimal(amountUnits(row.income) - amountUnits(row.expense));
  const metrics = [
    {
      label: "Ingresos",
      get: (row: StatisticsSnapshot["totals"][number]) => row.income,
    },
    {
      label: "Gastos",
      get: (row: StatisticsSnapshot["totals"][number]) => row.expense,
    },
    { label: "Resultado del período", get: net },
    {
      label: "Devoluciones acreditadas",
      get: (row: StatisticsSnapshot["totals"][number]) => row.refunds,
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
        <p className="text-sm text-muted-foreground">
          La fecha de hoy todavía está en curso.
        </p>
      )}
      {snapshot.previous &&
        statisticsDaysBetween(snapshot.range.from, snapshot.range.to) !==
          statisticsDaysBetween(
            snapshot.previous.from,
            snapshot.previous.to,
          ) && (
          <p className="text-sm text-muted-foreground">
            Los períodos tienen distinta duración.
          </p>
        )}
      {available.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
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
            <StatisticsComparisonTable
              key={currency}
              title={`Indicadores en ${currency}`}
              currency={currency}
              rows={metrics.map(({ label, get }) => ({
                label,
                current: current ? get(current) : null,
                previous: previous ? get(previous) : null,
              }))}
            />
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
        className={historyButton}
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
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-semibold">
          Detalle de movimientos
          {categoryName
            ? ` · ${categoryName}`
            : filters.category === "none"
              ? " · Sin categorizar"
              : ""}
        </h2>
        <Link
          href={`/estadisticas${statisticsSearch(filters, { category: undefined, kind: undefined, method: undefined, card: undefined, detailPage: undefined })}`}
          className={historyButton}
        >
          Quitar filtros de detalle
        </Link>
      </div>
      {children.length > 0 && (
        <StatisticsBarList
          label="Subcategorías"
          empty="Sin subcategorías con movimientos."
          rows={children.map((child) => ({
            key: `${child.currency}-${child.categoryId}-${child.kind}`,
            label: child.category,
            amount: child.amount,
            currency: child.currency,
            href: `/estadisticas${statisticsSearch(filters, {
              category: child.categoryId ?? "none",
              currency: child.currency,
              kind: child.kind,
              detailPage: undefined,
            })}`,
            detail: "Ver movimientos",
          }))}
        />
      )}
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">
          Movimientos que explican la cifra
        </h3>
        {snapshot.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay movimientos con estos filtros en esta página.
          </p>
        ) : (
          <ul className="divide-y">
            {snapshot.entries.map((entry) => (
              <li
                key={`${entry.kind}-${entry.id}-${entry.currency}-${entry.date}`}
              >
                <Link
                  href={`/historial/movimientos/${entry.id}#titulo-pagina`}
                  className="grid gap-2 rounded-md px-2 py-3 hover:bg-muted sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium wrap-anywhere">{entry.concept}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatBankReference(entry.date)} ·{" "}
                      {flowLabels[entry.kind]}
                    </p>
                  </div>
                  <span className="tabular-nums">
                    {formatStatisticsAmount(entry.amount, entry.currency)}
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
              className={historyButton}
              href={`/estadisticas${statisticsSearch(filters, { detailPage: String(page - 1) })}`}
            >
              Página anterior
            </Link>
          )}
          {snapshot.hasNextPage && page < 999999 && (
            <Link
              className={historyButton}
              href={`/estadisticas${statisticsSearch(filters, { detailPage: String(page + 1) })}`}
            >
              Página siguiente
            </Link>
          )}
        </nav>
      </section>
    </Card>
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
  const methodsSearch = (
    currency: Currency,
    kind: "income" | "expense",
    method: StatisticsFilters["method"],
  ) =>
    `/estadisticas${statisticsSearch(filters, { currency, kind, method, detailPage: undefined })}`;
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
            <p className="text-sm text-muted-foreground">
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
                  `/estadisticas${statisticsSearch(filters, { category, currency, kind: "expense", detailPage: undefined })}`
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
            <p className="text-sm text-muted-foreground">
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
                  `/estadisticas${statisticsSearch(filters, { category, currency, kind: "income", detailPage: undefined })}`
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
            <p className="text-sm text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">
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
  const visible = view === "favoritos" ? favorites : statisticsChartIdList;
  return (
    <div className="grid gap-4">
      {(filters.category || filters.method || filters.kind || filters.card) && (
        <StatisticsDrilldown
          snapshot={snapshot}
          filters={filters}
          categoryName={categoryName}
        />
      )}
      {visible.map((chart) => (
        <Fragment key={chart}>{cards[chart]}</Fragment>
      ))}
    </div>
  );
}
