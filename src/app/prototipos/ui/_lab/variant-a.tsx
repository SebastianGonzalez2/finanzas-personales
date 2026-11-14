"use client";

import { AmbientCss } from "./ambient";
import { CashflowChart, CategoryBars, Sparkline, seriesColors } from "./charts";
import {
  balances,
  cashflow,
  categorySpending,
  categoryTotal,
  labToday,
  money,
  moneyParts,
  monthTotals,
  shortDate,
} from "./data";
import { LabIcon } from "./icons";
import { MovementsExplorer } from "./movements";
import type { LabView } from "./nav";
import {
  Brand,
  CurrencySegment,
  LabBar,
  LabNav,
  MobileDrawer,
  MonthStepper,
} from "./shell";
import {
  BudgetList,
  CardCycles,
  Delta,
  FundsList,
  Panel,
  PanelLink,
  RecentMovements,
  UpcomingList,
} from "./widgets";

// Variante A — Ambient Minimal: luz ambiental CSS muy tenue, vidrio casi
// imperceptible, iconos monocromos y la jerarquía construida con tipografía,
// espacio y alineación. Prioriza la lectura sobre el efecto.

function Totals({ kind }: { kind: "income" | "expense" }) {
  const totals = monthTotals[kind];
  const [main, ...rest] = totals.rows;
  const parts = moneyParts(main.amount, main.currency);
  return (
    <section aria-labelledby={`a-${kind}`} className="lab-panel a-kpi">
      <header className="flex items-center justify-between gap-3">
        <h2 id={`a-${kind}`} className="a-kpi__label">
          <LabIcon name={kind} duotone={false} className="size-4" />
          {totals.label}
        </h2>
        <Delta
          current={main.amount}
          previous={totals.previousUYU}
          inverse={kind === "expense"}
        />
      </header>
      <p className="a-kpi__value tabular-nums">
        {parts.whole}
        <span className="a-cents">,{parts.cents}</span>
        <span className="a-currency">{parts.currency}</span>
      </p>
      <div className="flex items-end justify-between gap-3">
        <p className="lab-muted text-sm tabular-nums">
          {rest.map((row) => money(row.amount, row.currency)).join(" · ")}
        </p>
        <Sparkline
          values={cashflow.map((point) => point[kind])}
          color={seriesColors[kind]}
          label={`Tendencia de ${kind === "income" ? "ingresos" : "gastos"} en seis meses`}
          width={96}
          height={32}
        />
      </div>
    </section>
  );
}

function Summary() {
  const [main, ...others] = balances;
  const parts = moneyParts(main.amount, main.currency);
  return (
    <>
      <div className="a-pagehead">
        <div>
          <h1 id="titulo-pagina" tabIndex={-1} className="a-title">
            Resumen financiero
          </h1>
          <p className="lab-muted mt-1">Noviembre 2026 · datos al 14/11</p>
        </div>
        <MonthStepper />
      </div>

      <div className="a-grid">
        <section aria-labelledby="a-disponible" className="lab-panel a-balance">
          <header className="flex items-center justify-between gap-3">
            <h2 id="a-disponible" className="a-kpi__label">
              <LabIcon name="wallet" className="size-4" />
              Disponible libre
            </h2>
            <span className="lab-tag lab-tag--neutral">
              <LabIcon name="check" duotone={false} className="size-3" />
              Confirmado {shortDate(main.confirmedOn)}
            </span>
          </header>
          <p className="a-balance__value tabular-nums">
            {parts.whole}
            <span className="a-cents">,{parts.cents}</span>
            <span className="a-currency">{parts.currency}</span>
          </p>
          <dl className="a-balance__others">
            {others.map((balance) => (
              <div key={balance.currency}>
                <dt className="lab-muted">{balance.currency}</dt>
                <dd className="tabular-nums">
                  {money(balance.amount, balance.currency).replace(
                    ` ${balance.currency}`,
                    "",
                  )}
                </dd>
              </div>
            ))}
            <div>
              <dt className="lab-muted">Devoluciones</dt>
              <dd className="tabular-nums">
                {money(monthTotals.refunds[0].amount, "UYU")}
              </dd>
            </div>
          </dl>
        </section>
        <Totals kind="income" />
        <Totals kind="expense" />

        <Panel
          title="Flujo mensual"
          icon="stats"
          className="a-span-8"
          action={
            <span className="lab-muted text-xs">UYU · últimos 6 meses</span>
          }
        >
          <CashflowChart data={cashflow} mode="bars" height={232} />
        </Panel>
        <Panel
          title="Gastos por categoría"
          icon="categories"
          className="a-span-4"
        >
          <CategoryBars data={categorySpending} total={categoryTotal} />
        </Panel>

        <Panel
          title="Presupuestos"
          icon="budgets"
          className="a-span-4"
          action={<PanelLink href="#">Ver todos</PanelLink>}
        >
          <BudgetList limit={4} />
        </Panel>
        <Panel title="Tarjetas" icon="cards" className="a-span-4">
          <CardCycles today={labToday} />
        </Panel>
        <Panel title="Próximos pagos" icon="recurring" className="a-span-4">
          <UpcomingList />
        </Panel>

        <Panel title="Fondos de ahorro" icon="funds" className="a-span-5">
          <FundsList style="bars" />
        </Panel>
        <Panel
          title="Movimientos recientes"
          icon="history"
          className="a-span-7"
          action={
            <PanelLink href="/prototipos/ui/a?vista=movimientos">
              Ver historial
            </PanelLink>
          }
        >
          <RecentMovements count={6} />
        </Panel>
      </div>
    </>
  );
}

export function VariantA({ view }: { view: LabView }) {
  return (
    <div className="lab-root lab-a">
      <AmbientCss />
      <LabBar variant="a" view={view} />
      <div className="a-shell">
        <aside className="a-sidebar">
          <Brand />
          <button
            type="button"
            className="lab-btn lab-btn--outline w-full justify-start"
          >
            <LabIcon name="plus" duotone={false} className="size-4" />
            Registrar movimiento
          </button>
          <LabNav variant="a" view={view} />
          <div className="a-account">
            <span className="a-avatar" aria-hidden="true">
              TU
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                Cuenta personal
              </span>
              <span className="lab-muted block text-xs">Acceso con Google</span>
            </span>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="a-topbar">
            <div className="flex items-center gap-2 lg:hidden">
              <MobileDrawer variant="a" view={view} />
            </div>
            <p className="a-crumbs">
              <span className="lab-muted hidden sm:inline">Finanzas</span>
              <span className="lab-muted hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span>{view === "resumen" ? "Resumen" : "Historial"}</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              <CurrencySegment className="hidden md:flex" />
              <button type="button" className="lab-btn lab-btn--primary">
                <LabIcon name="plus" duotone={false} className="size-4" />
                <span className="hidden sm:inline">Registrar</span>
                <span className="sr-only sm:hidden">Registrar movimiento</span>
              </button>
            </div>
          </header>
          <main id="contenido" tabIndex={-1} className="a-main">
            {view === "resumen" ? (
              <Summary />
            ) : (
              <>
                <div className="a-pagehead">
                  <div>
                    <h1 id="titulo-pagina" tabIndex={-1} className="a-title">
                      Historial
                    </h1>
                    <p className="lab-muted mt-1">
                      Todos los movimientos confirmados, pendientes y corregidos
                    </p>
                  </div>
                </div>
                <div className="lab-panel lab-panel--dense">
                  <MovementsExplorer />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
