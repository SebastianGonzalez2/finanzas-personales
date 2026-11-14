"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkline, seriesColors } from "./charts";
import {
  balances,
  cashflow,
  creditCards,
  labToday,
  money,
  moneyParts,
  monthTotals,
  notices,
  shortDate,
} from "./data";
import { LabIcon } from "./icons";
import type { LabView } from "./nav";
import { MobileDrawer } from "./shell";
import { Delta } from "./widgets";

// UI-01 — Piezas de la versión Final. Nacieron en las variantes B (saldo,
// ingresos/gastos, tarjetas, avisos) y C (barra flotante móvil).

export function BalanceHero({
  showRegister = true,
  hint = false,
}: {
  showRegister?: boolean;
  /** Aviso breve bajo las pestañas: aclara que no convierten (Final). */
  hint?: boolean;
}) {
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
        <div className="b-hero__switch">
          <div
            role="tablist"
            aria-label="Moneda del saldo"
            aria-describedby={hint ? "b-hero-hint" : undefined}
            className="lab-segment"
            data-tour="moneda-cuenta"
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
          {hint && (
            <p id="b-hero-hint" className="b-hero__hint">
              Cambiá entre tu cuenta en pesos, dólares o euros
            </p>
          )}
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
            Ya descuenta fondos reservados y deuda de tarjetas
          </span>
        </p>
      </div>
      <div className="b-hero__actions">
        {showRegister && (
          <button type="button" className="lab-btn lab-btn--primary">
            <LabIcon name="plus" duotone={false} className="size-4" />
            Registrar movimiento
          </button>
        )}
        <button
          type="button"
          className="lab-btn lab-btn--glass"
          data-tour="cambio-moneda"
        >
          <LabIcon name="swap" duotone={false} className="size-4" />
          Cambio de moneda
        </button>
        <button
          type="button"
          className="lab-btn lab-btn--glass"
          data-tour="confirmar-saldo"
        >
          <LabIcon name="check" duotone={false} className="size-4" />
          Confirmar saldo
        </button>
      </div>
    </section>
  );
}

export function FlowCard({ kind }: { kind: "income" | "expense" }) {
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

export function CardObjects() {
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

export function Notices() {
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

export function Dock({
  view,
  variant = "final",
}: {
  view: LabView;
  variant?: "final";
}) {
  return (
    <nav aria-label="Accesos rápidos" className="c-dock">
      <Link
        href={`/prototipos/ui/${variant}?vista=resumen`}
        aria-current={view === "resumen" ? "page" : undefined}
        className="c-dock__item"
      >
        <LabIcon name="summary" />
        <span className="sr-only">Resumen</span>
      </Link>
      <Link
        href={`/prototipos/ui/${variant}?vista=movimientos`}
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
      <MobileDrawer variant={variant} view={view} />
    </nav>
  );
}
