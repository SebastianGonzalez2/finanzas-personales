"use client";

import { AmbientShader } from "./ambient";
import { CashflowChart, CategoryDonut } from "./charts";
import { cashflow, categorySpending, categoryTotal } from "./data";
import { LabIcon } from "./icons";
import { MovementsExplorer } from "./movements";
import type { LabView } from "./nav";
import { LabTour, openLabTour } from "./tour";
import { Brand, CurrencySegment, LabBar, LabNav, MonthStepper } from "./shell";
import { BalanceHero, CardObjects, FlowCard, Notices } from "./variant-b";
import { Dock } from "./variant-c";
import {
  BudgetList,
  FundsList,
  Panel,
  PanelLink,
  RecentMovements,
  UpcomingList,
} from "./widgets";

// Variante Final — combinación elegida por el usuario:
// fondo, color principal y navegación (escritorio y móvil) de C;
// tipografía, vidrio, saldo, ingresos/gastos, categorías, tarjetas,
// próximos pagos, fondos y avisos de B; gráfica de flujo de C.
// Presupuestos (sin elección explícita) usa la recomendación: C.

function Summary() {
  return (
    <>
      <div className="f-pagehead">
        <div>
          <p className="c-eyebrow">
            <span className="c-eyebrow__line" aria-hidden="true" />
            Sábado 14 de noviembre
          </p>
          <h1 id="titulo-pagina" tabIndex={-1} className="f-title">
            Resumen financiero
          </h1>
        </div>
        <MonthStepper />
      </div>

      <div className="b-grid">
        <BalanceHero showRegister={false} hint />
        <div className="b-flows">
          <FlowCard kind="income" />
          <FlowCard kind="expense" />
        </div>

        <Panel
          title="Flujo de los últimos seis meses"
          icon="stats"
          className="b-span-7 c-feature"
          action={
            <span className="lab-muted text-xs">
              UYU · ingresos arriba, gastos abajo
            </span>
          }
        >
          <CashflowChart data={cashflow} mode="mirror" height={264} />
        </Panel>
        <Panel
          title="Gastos por categoría"
          icon="categories"
          className="b-span-5"
        >
          <CategoryDonut data={categorySpending} total={categoryTotal} />
        </Panel>

        <Panel
          title="Tarjetas de crédito"
          icon="cards"
          className="b-span-7"
          action={<PanelLink href="#">Ver ciclos</PanelLink>}
        >
          <CardObjects />
        </Panel>
        <Panel title="Avisos" icon="notices" className="b-span-5">
          <Notices />
        </Panel>

        <Panel title="Fondos de ahorro" icon="funds" className="b-span-4">
          <FundsList style="rings" />
        </Panel>
        <Panel title="Presupuestos" icon="budgets" className="b-span-4">
          <BudgetList limit={4} />
        </Panel>
        <Panel title="Próximos pagos" icon="recurring" className="b-span-4">
          <UpcomingList withInstallments={false} />
        </Panel>

        <Panel
          title="Movimientos recientes"
          icon="history"
          className="b-span-12"
          action={
            <PanelLink href="/prototipos/ui/final?vista=movimientos">
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

export function VariantFinal({ view }: { view: LabView }) {
  return (
    <div className="lab-root lab-c lab-final">
      <AmbientShader preset="waves" scale={0.5} />
      <div className="c-grain" aria-hidden="true" />
      <LabBar variant="final" view={view} />
      <aside className="c-rail" aria-label="Menú lateral">
        <Brand />
        <LabNav variant="final" view={view} compact />
      </aside>
      <div className="c-shell">
        <header className="c-topbar">
          <Brand subtitle={false} />
          <div className="ml-auto flex items-center gap-2">
            {view === "resumen" && (
              <button
                type="button"
                className="lab-icon-btn"
                aria-label="Ver tutorial"
                title="Ver tutorial"
                onClick={openLabTour}
              >
                <LabIcon name="help" />
              </button>
            )}
            <div data-tour="moneda-app">
              <CurrencySegment />
            </div>
            <button
              type="button"
              className="lab-btn lab-btn--primary"
              data-tour="registrar"
            >
              <LabIcon name="plus" duotone={false} className="size-4" />
              <span className="hidden sm:inline">Registrar movimiento</span>
              <span className="sr-only sm:hidden">Registrar movimiento</span>
            </button>
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="c-main">
          {view === "resumen" ? (
            <Summary />
          ) : (
            <>
              <div className="f-pagehead">
                <div>
                  <p className="c-eyebrow">
                    <span className="c-eyebrow__line" aria-hidden="true" />
                    Noviembre 2026
                  </p>
                  <h1 id="titulo-pagina" tabIndex={-1} className="f-title">
                    Historial
                  </h1>
                </div>
              </div>
              <div className="lab-panel lab-panel--dense">
                <MovementsExplorer />
              </div>
            </>
          )}
        </main>
      </div>
      <Dock view={view} variant="final" />
      {view === "resumen" && <LabTour />}
    </div>
  );
}
