"use client";

import Link from "next/link";
import { BalanceHero as SharedBalanceHero } from "@/components/glaciar-summary/balance-hero";
import {
  FlowCard as SharedFlowCard,
  CardObjects as SharedCards,
  Notices as SharedNotices,
} from "@/components/glaciar-summary/pieces";
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
  hint?: boolean;
}) {
  return (
    <SharedBalanceHero
      hint={hint}
      balances={balances.map((balance) => {
        const parts = moneyParts(balance.amount, balance.currency);
        return {
          currency: balance.currency,
          content: (
            <>
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
              <div className="b-hero__actions mt-5">
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
            </>
          ),
        };
      })}
    />
  );
}

export function FlowCard({ kind }: { kind: "income" | "expense" }) {
  const totals = monthTotals[kind];
  return (
    <SharedFlowCard
      kind={kind}
      amounts={totals.rows.map((row) => money(row.amount, row.currency))}
      trend={cashflow.map((point) => point[kind])}
      variation={
        <Delta
          current={totals.rows[0].amount}
          previous={totals.previousUYU}
          inverse={kind === "expense"}
        />
      }
    />
  );
}

export function CardObjects() {
  return (
    <SharedCards
      cards={creditCards.map((card) => ({
        id: card.last4,
        name: card.name,
        debts: card.debts.map((debt) => money(debt.amount, debt.currency)),
        progress: Math.round(
          ((Date.parse(labToday) - Date.parse(card.cycleStart)) /
            (Date.parse(card.closesOn) - Date.parse(card.cycleStart))) *
            100,
        ),
        footer: (
          <>
            <span className="tabular-nums">···· {card.last4}</span>
            <span>
              Cierre {shortDate(card.closesOn)} · Vence {shortDate(card.dueOn)}
            </span>
          </>
        ),
      }))}
    />
  );
}

export function Notices() {
  return (
    <SharedNotices
      notices={notices.map((notice) => ({ id: notice.title, ...notice }))}
    />
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
