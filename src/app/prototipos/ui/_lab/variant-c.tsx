"use client";

import Link from "next/link";
import { AmbientShader } from "./ambient";
import { CashflowChart, SegmentBar, seriesColors } from "./charts";
import {
  balances,
  cashflow,
  categorySpending,
  categoryTotal,
  creditCards,
  formatUYU,
  labToday,
  loans,
  money,
  moneyParts,
  monthTotals,
  shortDate,
  upcomingRecurring,
} from "./data";
import { LabIcon, type LabIconName } from "./icons";
import { MovementsExplorer } from "./movements";
import type { LabView } from "./nav";
import { Brand, CurrencySegment, LabBar, LabNav, MobileDrawer } from "./shell";
import {
  BudgetList,
  Delta,
  FundsList,
  Panel,
  PanelLink,
  RecentMovements,
} from "./widgets";

// Variante C — Ambient Premium: composición editorial (cifra principal en
// serif), ondas de luz WebGL limitadas a la cabecera, navegación flotante que
// se expande y piezas propias: flujo espejado y agenda de 30 días.

function Hero() {
  const [main, ...others] = balances;
  const parts = moneyParts(main.amount, main.currency);
  const income = Number(monthTotals.income.rows[0].amount);
  const expense = Number(monthTotals.expense.rows[0].amount);
  const net = income - expense;
  return (
    <section aria-labelledby="titulo-pagina" className="c-hero">
      <div className="c-hero__main">
        <h1 id="titulo-pagina" tabIndex={-1} className="c-eyebrow">
          <span className="c-eyebrow__line" aria-hidden="true" />
          Resumen · Noviembre 2026
        </h1>
        <p className="c-hero__label">Disponible libre</p>
        <p className="c-hero__value tabular-nums">
          <span>{parts.whole}</span>
          <span className="c-hero__cents">,{parts.cents}</span>
          <span className="c-hero__currency">{parts.currency}</span>
        </p>
        <ul className="c-hero__others">
          {others.map((balance) => (
            <li key={balance.currency}>
              <span className="lab-muted">{balance.currency}</span>
              <span className="tabular-nums">
                {money(balance.amount, balance.currency).replace(
                  ` ${balance.currency}`,
                  "",
                )}
              </span>
            </li>
          ))}
          <li>
            <LabIcon
              name="check"
              duotone={false}
              className="size-3.5 text-[#5fd3b0]"
            />
            <span className="lab-muted">
              Confirmado el {shortDate(main.confirmedOn)}
            </span>
          </li>
        </ul>
      </div>

      <section aria-labelledby="c-pulso" className="lab-panel c-pulse">
        <h2 id="c-pulso" className="c-pulse__title">
          Resultado del mes
        </h2>
        <p className="c-pulse__value tabular-nums">
          {net >= 0 ? "+" : "−"}
          {formatUYU(Math.abs(net))}
        </p>
        <dl className="c-pulse__rows">
          {(
            [
              ["income", income, monthTotals.income.previousUYU],
              ["expense", expense, monthTotals.expense.previousUYU],
            ] as const
          ).map(([kind, value, previous]) => (
            <div key={kind}>
              <dt>
                <span
                  aria-hidden="true"
                  className="lab-key-rect"
                  style={{ background: seriesColors[kind] }}
                />
                {kind === "income" ? "Ingresos" : "Gastos"}
                <Delta
                  current={String(value)}
                  previous={previous}
                  inverse={kind === "expense"}
                />
              </dt>
              <dd className="tabular-nums">{formatUYU(value)}</dd>
              <div className="c-pulse__bar" aria-hidden="true">
                <span
                  style={{
                    width: `${(value / income) * 100}%`,
                    background: seriesColors[kind],
                  }}
                />
              </div>
            </div>
          ))}
        </dl>
        <p className="lab-muted text-xs">
          También: {money(monthTotals.income.rows[1].amount, "USD")} ingresados
          y {money(monthTotals.expense.rows[1].amount, "USD")} gastados.
        </p>
      </section>
    </section>
  );
}

type AgendaEvent = {
  date: string;
  label: string;
  detail: string;
  icon: LabIconName;
  tone: string;
};

/** Agenda de los próximos 30 días: cierres, vencimientos y recurrentes. */
function Agenda() {
  const start = Date.parse(labToday);
  const days = 30;
  const events: AgendaEvent[] = [
    ...creditCards.flatMap((card) => [
      {
        date: card.closesOn,
        label: `Cierre ${card.name.split(" ")[0]}`,
        detail: `···· ${card.last4}`,
        icon: "cards" as const,
        tone: "card",
      },
      {
        date: card.dueOn,
        label: `Vence ${card.name.split(" ")[0]}`,
        detail: card.debts
          .map((debt) => money(debt.amount, debt.currency))
          .join(" + "),
        icon: "alert" as const,
        tone: "due",
      },
    ]),
    ...upcomingRecurring.map((item) => ({
      date: item.dueOn,
      label: item.concept,
      detail: money(item.amount, item.currency),
      icon: "recurring" as const,
      tone: "recurring",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const position = (date: string) =>
    ((Date.parse(date) - start) / 86_400_000 / days) * 100;

  return (
    <div className="c-agenda">
      <div className="c-agenda__track" aria-hidden="true">
        <span className="c-agenda__today" style={{ left: "0%" }}>
          Hoy
        </span>
        {events.map((event) => (
          <span
            key={`${event.date}-${event.label}`}
            className={`c-agenda__mark c-agenda__mark--${event.tone}`}
            style={{ left: `${position(event.date)}%` }}
          />
        ))}
        <span
          className="c-agenda__month"
          style={{ left: `${position("2026-12-01")}%` }}
        >
          Dic
        </span>
      </div>
      <ol className="c-agenda__list">
        {events.map((event) => (
          <li
            key={`${event.date}-${event.label}`}
            className={`c-agenda__item c-agenda__item--${event.tone}`}
          >
            <span className="c-agenda__icon">
              <LabIcon name={event.icon} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{event.label}</span>
              <span className="lab-muted block text-xs tabular-nums">
                {event.detail}
              </span>
            </span>
            <time dateTime={event.date} className="c-agenda__date tabular-nums">
              {shortDate(event.date)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Summary() {
  return (
    <>
      <Hero />
      <div className="c-grid">
        <Panel
          title="Flujo de los últimos seis meses"
          icon="stats"
          className="c-span-7 c-feature"
          action={
            <span className="lab-muted text-xs">
              UYU · ingresos arriba, gastos abajo
            </span>
          }
        >
          <CashflowChart data={cashflow} mode="mirror" height={264} />
        </Panel>
        <Panel
          title="¿En qué se fue noviembre?"
          icon="categories"
          className="c-span-5"
        >
          <SegmentBar data={categorySpending} total={categoryTotal} />
          <p className="c-note">
            <LabIcon name="info" className="size-4" />
            Los pagos de tarjeta no se cuentan de nuevo: el gasto ya figura al
            registrar la compra.
          </p>
        </Panel>

        <Panel title="Próximos 30 días" icon="calendar" className="c-span-7">
          <Agenda />
        </Panel>
        <Panel
          title="Presupuestos"
          icon="budgets"
          className="c-span-5"
          action={<PanelLink href="#">Ajustar</PanelLink>}
        >
          <BudgetList />
        </Panel>

        <Panel title="Fondos de ahorro" icon="funds" className="c-span-5">
          <FundsList style="rings" />
          <p className="c-note">
            <LabIcon name="info" className="size-4" />
            Los fondos reservan dinero dentro de tu saldo; no mueven dinero
            entre bancos.
          </p>
        </Panel>
        <Panel
          title="Movimientos recientes"
          icon="history"
          className="c-span-7"
          action={
            <PanelLink href="/prototipos/ui/c?vista=movimientos">
              Historial completo
            </PanelLink>
          }
        >
          <RecentMovements count={5} />
          <div className="c-loan">
            <LabIcon name="debts" className="size-4.5" />
            <span className="min-w-0 flex-1 text-sm">
              {loans.owedToYou.contact} te debe{" "}
              <strong className="tabular-nums">
                {money(loans.owedToYou.amount, loans.owedToYou.currency)}
              </strong>
              <span className="lab-muted">
                {" "}
                · capital prestado, no es gasto
              </span>
            </span>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Dock({ view }: { view: LabView }) {
  return (
    <nav aria-label="Accesos rápidos" className="c-dock">
      <Link
        href="/prototipos/ui/c?vista=resumen"
        aria-current={view === "resumen" ? "page" : undefined}
        className="c-dock__item"
      >
        <LabIcon name="summary" />
        <span className="sr-only">Resumen</span>
      </Link>
      <Link
        href="/prototipos/ui/c?vista=movimientos"
        aria-current={view === "movimientos" ? "page" : undefined}
        className="c-dock__item"
      >
        <LabIcon name="history" />
        <span className="sr-only">Historial</span>
      </Link>
      <button
        type="button"
        className="c-dock__add"
        aria-label="Registrar movimiento"
      >
        <LabIcon name="plus" duotone={false} />
      </button>
      <span
        className="c-dock__item is-inert"
        aria-disabled="true"
        title="Fuera del alcance del prototipo"
      >
        <LabIcon name="stats" />
        <span className="sr-only">Estadísticas</span>
      </span>
      <MobileDrawer variant="c" view={view} />
    </nav>
  );
}

export function VariantC({ view }: { view: LabView }) {
  return (
    <div className="lab-root lab-c">
      <AmbientShader preset="waves" scale={0.5} />
      <div className="c-grain" aria-hidden="true" />
      <LabBar variant="c" view={view} />
      <aside className="c-rail" aria-label="Menú lateral">
        <Brand />
        <LabNav variant="c" view={view} compact />
      </aside>
      <div className="c-shell">
        <header className="c-topbar">
          <Brand subtitle={false} />
          <div className="ml-auto flex items-center gap-2">
            <CurrencySegment className="hidden sm:flex" />
            <button type="button" className="lab-btn lab-btn--primary">
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
              <div className="c-hero c-hero--compact">
                <div className="c-hero__main">
                  <p className="c-eyebrow">
                    <span className="c-eyebrow__line" aria-hidden="true" />
                    Noviembre 2026
                  </p>
                  <h1
                    id="titulo-pagina"
                    tabIndex={-1}
                    className="c-hero__title"
                  >
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
      <Dock view={view} />
    </div>
  );
}
