import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  amountUnits,
  comparison,
  formatStatisticsAmount,
  statisticsChartIdList,
  statisticsChartIds,
  statisticsSearch,
  statisticsSummary,
  unitsDecimal,
  type StatisticsChartId,
  type StatisticsFilters,
  type StatisticsSnapshot,
  type StatisticsView,
} from "@/domain/statistics";
import { formatBankReference } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import {
  historyKinds,
  historySearch,
  historyStates,
  type HistoryEntry,
} from "@/domain/history";
import { HistoryAmount } from "./history-entry";
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

function StatisticsMetrics({
  snapshot,
  favorite,
}: {
  snapshot: StatisticsSnapshot;
  favorite: boolean;
}) {
  return (
    <StatisticsChartCard
      chart="metrics"
      favorite={favorite}
      title={statisticsChartIds.metrics}
      description={`${snapshot.range.label}. Comparación con ${snapshot.previous?.label ?? "el período anterior"}.`}
    >
      {snapshot.totals.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No hay ingresos ni gastos registrados con estos filtros.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.totals.map((total) => {
            const previous = snapshot.previousTotals.find(
              (row) => row.currency === total.currency,
            );
            const balance = unitsDecimal(
              amountUnits(total.income) - amountUnits(total.expense),
            );
            const incomeChange = comparison(
              total.income,
              previous?.income ?? null,
              total.movements,
              snapshot.previous?.label,
            );
            const expenseChange = comparison(
              total.expense,
              previous?.expense ?? null,
              total.movements,
              snapshot.previous?.label,
            );
            return (
              <section key={total.currency} className="grid gap-2">
                <h3 className="text-sm font-semibold">{total.currency}</h3>
                <dl className="grid gap-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3 border-b pb-1">
                    <dt>Ingresos</dt>
                    <dd className="tabular-nums">
                      {formatStatisticsAmount(total.income, total.currency)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 border-b pb-1">
                    <dt>Gastos</dt>
                    <dd className="tabular-nums">
                      {formatStatisticsAmount(total.expense, total.currency)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 border-b pb-1 font-semibold">
                    <dt>Balance ordinario</dt>
                    <dd className="tabular-nums">
                      {formatStatisticsAmount(balance, total.currency)}
                    </dd>
                  </div>
                  {amountUnits(total.refunds) > BigInt(0) && (
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <dt>Devoluciones informadas aparte</dt>
                      <dd className="tabular-nums">
                        {formatStatisticsAmount(total.refunds, total.currency)}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Ingresos: {incomeChange.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Gastos: {expenseChange.label}
                </p>
              </section>
            );
          })}
        </div>
      )}
    </StatisticsChartCard>
  );
}

function StatisticsSummaryCard({
  snapshot,
  favorite,
}: {
  snapshot: StatisticsSnapshot;
  favorite: boolean;
}) {
  const summary = statisticsSummary(snapshot);
  return (
    <StatisticsChartCard
      chart="summary"
      favorite={favorite}
      title={statisticsChartIds.summary}
      description="Resumen determinista con los movimientos registrados. No inventa comercios, tendencias ni gastos."
    >
      <div
        role={summary.status === "insufficient" ? "status" : undefined}
        className="grid gap-2 text-sm"
      >
        {summary.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </StatisticsChartCard>
  );
}

function StatisticsDrilldown({
  snapshot,
  filters,
  entries,
  hasNextPage,
}: {
  snapshot: StatisticsSnapshot;
  filters: StatisticsFilters;
  entries: HistoryEntry[];
  hasNextPage: boolean;
}) {
  const selected =
    filters.category === "none"
      ? null
      : snapshot.categories.find(
          (category) => category.categoryId === filters.category,
        );
  const children =
    filters.category && filters.category !== "none"
      ? snapshot.categories.filter(
          (category) =>
            category.parentId === filters.category &&
            category.categoryId !== filters.category,
        )
      : [];
  const historyFilters = {
    from: snapshot.range.from,
    to: snapshot.range.to,
    ...(filters.currency ? { currency: filters.currency } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.method ? { method: filters.method } : {}),
  };
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            Detalle: {selected?.category ?? "Sin categorizar"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Categoría → subcategoría → movimientos. Se conservan período, moneda
            y medio de pago.
          </p>
        </div>
        <Link
          href={`/estadisticas${statisticsSearch(filters, { category: undefined })}`}
          className="inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"
        >
          Volver a estadísticas
        </Link>
      </div>
      {children.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">Subcategorías</h3>
          <StatisticsBarList
            label="Subcategorías de la categoría seleccionada"
            empty="Sin subcategorías con movimientos."
            rows={children.map((child) => ({
              key: `${child.currency}-${child.categoryId}`,
              label: child.category,
              amount: child.amount,
              currency: child.currency,
              href: `/estadisticas${statisticsSearch(filters, {
                category: child.categoryId ?? "none",
              })}`,
              detail: `${child.currency} · ${child.count} ${child.count === 1 ? "movimiento" : "movimientos"}`,
            }))}
          />
        </section>
      )}
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">
          Movimientos que explican la cifra
        </h3>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay movimientos visibles con estos filtros.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`}>
                <Link
                  href={`/historial/${entry.kind === "checkpoint" ? "saldos" : "movimientos"}/${entry.id}${historySearch(historyFilters)}#titulo-pagina`}
                  className="grid gap-2 rounded-md px-2 py-3 hover:bg-muted sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium wrap-anywhere">{entry.concept}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatBankReference(entry.effectiveOn)} ·{" "}
                      {historyKinds[entry.kind]} · {historyStates[entry.status]}
                    </p>
                  </div>
                  <HistoryAmount entry={entry} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hasNextPage && (
          <Link
            href={`/historial${historySearch(historyFilters)}#titulo-pagina`}
            className="inline-flex min-h-11 w-fit items-center rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            Ver todos los movimientos en Historial
          </Link>
        )}
      </section>
    </Card>
  );
}

export function StatisticsDashboard({
  snapshot,
  filters,
  favorites,
  view,
  entries,
  hasNextPage,
}: {
  snapshot: StatisticsSnapshot;
  filters: StatisticsFilters;
  favorites: StatisticsChartId[];
  view: StatisticsView;
  entries: HistoryEntry[];
  hasNextPage: boolean;
}) {
  const favorite = (chart: StatisticsChartId) => favorites.includes(chart);
  const monthlyCurrencies = currencies([
    ...snapshot.totals,
    ...snapshot.months,
  ]);
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
          {currencies(snapshot.categories).map((currency) => (
            <section key={currency} className="grid gap-2">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <StatisticsCategoryBars
                categories={snapshot.categories}
                kind="expense"
                currency={currency}
                search={(category) =>
                  `/estadisticas${statisticsSearch(filters, { category })}`
                }
              />
            </section>
          ))}
          {currencies(snapshot.categories).length === 0 && (
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
          {currencies(snapshot.categories).map((currency) => (
            <section key={currency} className="grid gap-2">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <StatisticsCategoryBars
                categories={snapshot.categories}
                kind="income"
                currency={currency}
                search={(category) =>
                  `/estadisticas${statisticsSearch(filters, { category })}`
                }
              />
            </section>
          ))}
          {currencies(snapshot.categories).length === 0 && (
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
          {currencies(snapshot.methods).map((currency) => (
            <section key={currency} className="grid gap-3">
              <h3 className="text-sm font-semibold">{currency}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <h4 className="text-sm font-medium">Gastos</h4>
                  <StatisticsMethodBars
                    methods={snapshot.methods}
                    kind="expense"
                    currency={currency}
                  />
                </div>
                <div className="grid gap-2">
                  <h4 className="text-sm font-medium">Ingresos</h4>
                  <StatisticsMethodBars
                    methods={snapshot.methods}
                    kind="income"
                    currency={currency}
                  />
                </div>
              </div>
            </section>
          ))}
          {currencies(snapshot.methods).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin medios de pago registrados en el período.
            </p>
          )}
        </div>
      </StatisticsChartCard>
    ),
    history: (
      <StatisticsChartCard
        key="history"
        chart="history"
        favorite={favorite("history")}
        title={statisticsChartIds.history}
        description="Evolución mensual del balance ordinario. Los meses sin datos se marcan como faltantes."
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
      </StatisticsChartCard>
    ),
    summary: (
      <StatisticsSummaryCard
        key="summary"
        snapshot={snapshot}
        favorite={favorite("summary")}
      />
    ),
  };
  const visible = view === "favoritos" ? favorites : statisticsChartIdList;
  return (
    <div className="grid gap-4">
      {filters.category && (
        <StatisticsDrilldown
          snapshot={snapshot}
          filters={filters}
          entries={entries}
          hasNextPage={hasNextPage}
        />
      )}
      {visible.map((chart) => (
        <Fragment key={chart}>{cards[chart]}</Fragment>
      ))}
    </div>
  );
}
