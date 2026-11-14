"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressRing } from "./charts";
import {
  budgetState,
  budgets,
  formatUYU,
  funds,
  installments,
  money,
  movements,
  shortDate,
  upcomingRecurring,
  variation,
} from "./data";
import { LabIcon, type LabIconName } from "./icons";
import { KindBadge, MovementAmount } from "./movements";

export function Panel({
  title,
  icon,
  action,
  className = "",
  children,
  id,
}: {
  title: string;
  icon?: LabIconName;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const headingId =
    id ?? `panel-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className={`lab-panel ${className}`}>
      <header className="lab-panel__head">
        <h2 id={headingId} className="lab-panel__title">
          {icon && (
            <span className="lab-panel__icon">
              <LabIcon name={icon} className="size-4.5" />
            </span>
          )}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Variación frente al mes anterior. Para gastos, bajar es favorable: el tono
 * lo indica, pero el signo y el texto también (no solo el color).
 */
export function Delta({
  current,
  previous,
  inverse = false,
}: {
  current: string;
  previous: string;
  inverse?: boolean;
}) {
  const { value, label } = variation(current, previous);
  const favorable = inverse ? value < 0 : value > 0;
  return (
    <span className={`lab-delta ${favorable ? "is-good" : "is-bad"}`}>
      <LabIcon
        name={value >= 0 ? "trendUp" : "trendDown"}
        duotone={false}
        className="size-3.5"
      />
      {label}
      <span className="sr-only"> respecto del mes anterior</span>
    </span>
  );
}

export function PanelLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="lab-link">
      {children}
      <LabIcon name="chevronRight" duotone={false} className="size-3.5" />
    </Link>
  );
}

const toneIcon = {
  good: "check",
  warning: "alert",
  critical: "alert",
} as const;

export function BudgetList({ limit }: { limit?: number }) {
  return (
    <ul className="lab-budgets">
      {budgets.slice(0, limit).map((budget) => {
        const state = budgetState(budget.spent, budget.limit);
        return (
          <li key={budget.name}>
            <div className="lab-budgets__head">
              <span className="font-medium">{budget.name}</span>
              <span className={`lab-tag lab-tag--${state.tone}`}>
                <LabIcon
                  name={toneIcon[state.tone]}
                  duotone={false}
                  className="size-3"
                />
                {state.label}
              </span>
            </div>
            <div
              className={`lab-meter lab-meter--${state.tone}`}
              role="meter"
              aria-label={`${budget.name}: ${Math.round(state.ratio * 100)} % del presupuesto`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(state.ratio * 100))}
            >
              <span style={{ width: `${Math.min(1, state.ratio) * 100}%` }} />
            </div>
            <p className="lab-budgets__foot">
              <span className="tabular-nums">{formatUYU(budget.spent)}</span>
              <span className="lab-muted tabular-nums">
                de {formatUYU(budget.limit)} · {Math.round(state.ratio * 100)} %
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentMovements({
  count = 5,
  dense = false,
}: {
  count?: number;
  dense?: boolean;
}) {
  return (
    <ul className={`lab-recent${dense ? " is-dense" : ""}`}>
      {movements
        .filter((movement) => movement.kind !== "checkpoint")
        .slice(0, count)
        .map((movement) => (
          <li key={movement.id}>
            <KindBadge kind={movement.kind} />
            <span className="min-w-0 flex-1">
              <span className="lab-recent__title">{movement.concept}</span>
              <span className="lab-recent__sub">
                {shortDate(movement.effectiveOn)}
                {movement.category ? ` · ${movement.category}` : ""}
              </span>
            </span>
            <MovementAmount movement={movement} />
          </li>
        ))}
    </ul>
  );
}

export function UpcomingList({
  withInstallments = true,
}: {
  withInstallments?: boolean;
}) {
  return (
    <ul className="lab-upcoming">
      {upcomingRecurring.map((item) => {
        const [, month, day] = item.dueOn.split("-");
        return (
          <li key={item.concept}>
            <span className="lab-upcoming__date" aria-hidden="true">
              <strong>{day}</strong>
              <span>{month === "11" ? "nov" : "dic"}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.concept}</span>
              <span className="lab-muted block text-xs">
                <span className="sr-only">
                  Vence el {shortDate(item.dueOn)} ·{" "}
                </span>
                {item.method}
              </span>
            </span>
            <span className="tabular-nums text-sm">
              {money(item.amount, item.currency)}
            </span>
          </li>
        );
      })}
      {withInstallments &&
        installments.map((item) => (
          <li key={item.concept}>
            <span
              className="lab-upcoming__date is-installment"
              aria-hidden="true"
            >
              <strong>{item.current}</strong>
              <span>de {item.total}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.concept}</span>
              <span className="lab-muted block text-xs">
                Cuota {item.current} de {item.total}
              </span>
            </span>
            <span className="tabular-nums text-sm">
              {money(item.amount, item.currency)}
            </span>
          </li>
        ))}
    </ul>
  );
}

const fundColors = ["#3987e5", "#199e70", "#9085e9"];

export function FundsList({ style }: { style: "bars" | "rings" }) {
  return (
    <ul className={`lab-funds lab-funds--${style}`}>
      {funds.map((fund, index) => {
        const ratio = Number(fund.saved) / Number(fund.target);
        const pct = `${Math.round(ratio * 100)} %`;
        return (
          <li key={fund.name}>
            {style === "rings" && (
              <ProgressRing value={ratio} color={fundColors[index]}>
                {pct}
              </ProgressRing>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{fund.name}</span>
                {style === "bars" && (
                  <span className="lab-muted text-xs tabular-nums">{pct}</span>
                )}
              </p>
              <p className="lab-muted text-sm tabular-nums">
                <span className="text-[var(--lab-text)]">
                  {money(fund.saved, fund.currency)}
                </span>{" "}
                de {money(fund.target, fund.currency)}
              </p>
              {style === "bars" && (
                <div className="lab-meter mt-2" aria-hidden="true">
                  <span
                    style={{
                      width: `${ratio * 100}%`,
                      background: fundColors[index],
                    }}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
