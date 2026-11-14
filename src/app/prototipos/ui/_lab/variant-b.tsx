"use client";

import Link from "next/link";
import { useState } from "react";
import { AmbientShader } from "./ambient";
import {
  CashflowChart,
  CategoryDonut,
  Sparkline,
  seriesColors,
} from "./charts";
import {
  balances,
  cashflow,
  categorySpending,
  categoryTotal,
  creditCards,
  labToday,
  money,
  moneyParts,
  monthTotals,
  notices,
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
  Delta,
  FundsList,
  Panel,
  PanelLink,
  RecentMovements,
  UpcomingList,
} from "./widgets";

// Variante B — Ambient Dynamic: shader de auroras en movimiento, vidrio más
// perceptible, iconos con color propio por destino y piezas visuales
// expresivas (saldo por moneda, tarjetas como objetos, anillo de categorías).

function BalanceHero() {
  const [selected, setSelected] = useState(0);
  const balance = balances[selected];
  const parts = moneyParts(balance.amount, balance.currency);
  return (
    <section aria-labelledby="b-disponible" className="lab-panel b-hero">
      <span className="b-hero__orb" aria-hidden="true" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="b-disponible" className="b-eyebrow">
          <span className="b-eyebrow__icon">
            <LabIcon name="wallet" className="size-4" />
          </span>
          Disponible libre
        </h2>
        <div
          role="tablist"
          aria-label="Moneda del saldo"
          className="lab-segment"
        >
          {balances.map((item, index) => (
            <button
              key={item.currency}
              type="button"
              role="tab"
              id={`b-tab-${item.currency}`}
              aria-selected={index === selected}
              aria-controls="b-hero-panel"
              tabIndex={index === selected ? 0 : -1}
              className="lab-segment__option"
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                  return;
                const next =
                  (index +
                    (event.key === "ArrowRight" ? 1 : balances.length - 1)) %
                  balances.length;
                setSelected(next);
                document
                  .getElementById(`b-tab-${balances[next].currency}`)
                  ?.focus();
              }}
            >
              {item.currency}
            </button>
          ))}
        </div>
      </header>
      <div
        id="b-hero-panel"
        role="tabpanel"
        aria-labelledby={`b-tab-${balance.currency}`}
      >
        <p className="b-hero__value tabular-nums" key={balance.currency}>
          <span className="b-hero__currency">{parts.currency}</span>
          {parts.whole}
          <span className="b-hero__cents">,{parts.cents}</span>
        </p>
        <p className="b-hero__meta">
          <span className="lab-tag lab-tag--good">
            <LabIcon name="check" duotone={false} className="size-3" />
            Saldo confirmado el {shortDate(balance.confirmedOn)}
          </span>
          <span className="lab-muted text-sm">
            Ya descuenta lo reservado en fondos
          </span>
        </p>
      </div>
      <div className="b-hero__actions">
        <button type="button" className="lab-btn lab-btn--primary">
          <LabIcon name="plus" duotone={false} className="size-4" />
          Registrar movimiento
        </button>
        <button type="button" className="lab-btn lab-btn--glass">
          <LabIcon name="swap" duotone={false} className="size-4" />
          Cambio de moneda
        </button>
        <button type="button" className="lab-btn lab-btn--glass">
          <LabIcon name="check" duotone={false} className="size-4" />
          Confirmar saldo
        </button>
      </div>
    </section>
  );
}

function FlowCard({ kind }: { kind: "income" | "expense" }) {
  const totals = monthTotals[kind];
  const [main, ...rest] = totals.rows;
  return (
    <section
      aria-labelledby={`b-${kind}`}
      className={`lab-panel b-flow b-flow--${kind}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 id={`b-${kind}`} className="b-eyebrow">
          <span className="b-eyebrow__icon">
            <LabIcon name={kind} duotone={false} className="size-4" />
          </span>
          {totals.label}
        </h2>
        <Delta
          current={main.amount}
          previous={totals.previousUYU}
          inverse={kind === "expense"}
        />
      </header>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="b-flow__value tabular-nums">
            {money(main.amount, main.currency)}
          </p>
          <p className="lab-muted text-sm tabular-nums">
            {rest.map((row) => money(row.amount, row.currency)).join(" · ")}
          </p>
        </div>
        <Sparkline
          values={cashflow.map((point) => point[kind])}
          color={seriesColors[kind]}
          label={`Tendencia de ${kind === "income" ? "ingresos" : "gastos"} en seis meses`}
          width={104}
          height={40}
        />
      </div>
    </section>
  );
}

function CardObjects() {
  return (
    <ul className="b-cards">
      {creditCards.map((card) => {
        const total =
          (Date.parse(card.closesOn) - Date.parse(card.cycleStart)) /
          86_400_000;
        const elapsed =
          (Date.parse(labToday) - Date.parse(card.cycleStart)) / 86_400_000;
        return (
          <li key={card.last4} className={`b-card b-card--${card.tone}`}>
            <div className="flex items-start justify-between">
              <span className="text-sm font-semibold">{card.name}</span>
              <span className="b-card__chip" aria-hidden="true" />
            </div>
            <p className="b-card__debt tabular-nums">
              {card.debts.map((debt) => (
                <span key={debt.currency}>
                  {money(debt.amount, debt.currency)}
                </span>
              ))}
            </p>
            <div className="b-card__cycle" aria-hidden="true">
              <span style={{ width: `${(elapsed / total) * 100}%` }} />
            </div>
            <p className="flex justify-between text-xs">
              <span className="tabular-nums">···· {card.last4}</span>
              <span>
                Cierre {shortDate(card.closesOn)} · Vence{" "}
                {shortDate(card.dueOn)}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function Notices() {
  return (
    <ul className="b-notices">
      {notices.map((notice) => (
        <li key={notice.title} className={`b-notice b-notice--${notice.tone}`}>
          <LabIcon
            name={notice.tone === "info" ? "info" : "alert"}
            className="size-4.5"
          />
          <span className="min-w-0">
            <span className="block font-medium">{notice.title}</span>
            <span className="lab-muted block text-xs">{notice.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Summary() {
  return (
    <>
      <div className="b-pagehead">
        <div>
          <p className="lab-muted text-sm">Sábado 14 de noviembre</p>
          <h1 id="titulo-pagina" tabIndex={-1} className="b-title">
            Resumen financiero
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthStepper />
          <CurrencySegment className="hidden md:inline-flex" />
        </div>
      </div>

      <div className="b-grid">
        <BalanceHero />
        <div className="b-flows">
          <FlowCard kind="income" />
          <FlowCard kind="expense" />
        </div>

        <Panel
          title="Ingresos y gastos"
          icon="stats"
          className="b-span-8"
          action={<span className="lab-muted text-xs">UYU · 6 meses</span>}
        >
          <CashflowChart data={cashflow} mode="area" height={248} />
        </Panel>
        <Panel
          title="Gastos por categoría"
          icon="categories"
          className="b-span-4"
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
            <PanelLink href="/prototipos/ui/b?vista=movimientos">
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

function TabBar({ view }: { view: LabView }) {
  return (
    <nav aria-label="Accesos rápidos" className="b-tabbar">
      <Link
        href="/prototipos/ui/b?vista=resumen"
        aria-current={view === "resumen" ? "page" : undefined}
        className="b-tabbar__item"
      >
        <LabIcon name="summary" />
        Resumen
      </Link>
      <Link
        href="/prototipos/ui/b?vista=movimientos"
        aria-current={view === "movimientos" ? "page" : undefined}
        className="b-tabbar__item"
      >
        <LabIcon name="history" />
        Historial
      </Link>
      <button
        type="button"
        className="b-tabbar__fab"
        aria-label="Registrar movimiento"
      >
        <LabIcon name="plus" duotone={false} className="size-6" />
      </button>
      <span className="b-tabbar__item is-inert" aria-disabled="true">
        <LabIcon name="cards" />
        Tarjetas
      </span>
      <MobileDrawer
        variant="b"
        view={view}
        trigger={
          <span className="b-tabbar__more">
            <LabIcon name="menu" duotone={false} />
            Más
          </span>
        }
      />
    </nav>
  );
}

export function VariantB({ view }: { view: LabView }) {
  return (
    <div className="lab-root lab-b">
      <AmbientShader preset="aurora" scale={0.35} />
      <LabBar variant="b" view={view} />
      <div className="b-shell">
        <aside className="b-sidebar">
          <Brand />
          <LabNav variant="b" view={view} />
        </aside>
        <div className="min-w-0">
          <header className="b-topbar">
            <Brand subtitle={false} />
            <label className="b-search">
              <LabIcon name="search" duotone={false} className="size-4" />
              <span className="sr-only">Buscar movimientos</span>
              <input
                type="search"
                placeholder="Buscar movimientos, comercios o categorías"
              />
            </label>
            <button
              type="button"
              className="lab-icon-btn b-bell"
              aria-label="Avisos: 3 sin leer"
            >
              <LabIcon name="notices" />
              <span className="b-bell__dot" aria-hidden="true" />
            </button>
          </header>
          <main id="contenido" tabIndex={-1} className="b-main">
            {view === "resumen" ? (
              <Summary />
            ) : (
              <>
                <div className="b-pagehead">
                  <div>
                    <p className="lab-muted text-sm">Noviembre 2026</p>
                    <h1 id="titulo-pagina" tabIndex={-1} className="b-title">
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
      </div>
      <TabBar view={view} />
    </div>
  );
}
