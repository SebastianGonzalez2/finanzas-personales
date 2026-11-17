import type { ReactNode } from "react";
import { Icon } from "../ui/icon";
import { ProgressRing } from "./charts";

export type BudgetItem = {
  id: string;
  title: string;
  limit: string;
  spent: string | null;
  percent: number | null;
  tone: "good" | "warning" | "critical";
  label: string;
};

export function BudgetList({ items }: { items: BudgetItem[] }) {
  return (
    <ul className="lab-budgets">
      {items.map(({ id, title, limit, spent, percent, tone, label }) => (
        <li key={id}>
          <div className="lab-budgets__head">
            <span className="min-w-0 font-medium wrap-anywhere">{title}</span>
            {percent !== null && (
              <span className={`lab-tag lab-tag--${tone}`}>
                <Icon
                  name={tone === "good" ? "check" : "alert"}
                  duotone={false}
                  className="size-3"
                />
                {label}
              </span>
            )}
          </div>
          {percent !== null && (
            <div
              className={`lab-meter lab-meter--${tone}`}
              role="meter"
              aria-label={title}
              aria-valuetext={`${percent} % del presupuesto`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, percent)}
            >
              <span style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
          )}
          <p className="lab-budgets__foot flex-wrap">
            <span className="tabular-nums">
              {spent ?? "Consumo sin equivalencia"}
            </span>
            <span className="lab-muted tabular-nums">
              {spent ? "de " : "Límite "}
              {limit}
              {percent !== null && ` · ${percent} %`}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export type UpcomingItem = {
  id: string;
  title: ReactNode;
  date: { major: string; minor: string; label: string; installment?: boolean };
  detail: ReactNode;
  amount: ReactNode;
};

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  return (
    <ul className="lab-upcoming">
      {items.map(({ id, title, date, detail, amount }) => (
        <li key={id}>
          <span
            className={`lab-upcoming__date ${date.installment ? "is-installment" : ""}`}
          >
            <strong aria-hidden="true">{date.major}</strong>
            <span aria-hidden="true">{date.minor}</span>
            <span className="sr-only">{date.label}</span>
          </span>
          <div className="min-w-0 flex-1 wrap-anywhere">
            <p className="font-medium">{title}</p>
            <p className="lab-muted text-xs">{detail}</p>
          </div>
          <div className="summary-upcoming-amount tabular-nums text-sm">
            {amount}
          </div>
        </li>
      ))}
    </ul>
  );
}

const fundColors = ["#3987e5", "#199e70", "#9085e9"];

export type FundItem = {
  id: string;
  title: string;
  saved: string;
  target: string | null;
  ratio: number | null;
  state?: string;
};

export function FundsList({
  items,
  style = "rings",
}: {
  items: FundItem[];
  style?: "rings" | "bars";
}) {
  return (
    <ul className={`lab-funds lab-funds--${style}`}>
      {items.map((fund, index) => {
        const pct =
          fund.ratio === null ? null : `${Math.round(fund.ratio * 100)} %`;
        const color = fundColors[index % fundColors.length];
        return (
          <li key={fund.id}>
            {style === "rings" && fund.ratio !== null && (
              <ProgressRing value={fund.ratio} color={color}>
                {pct}
              </ProgressRing>
            )}
            <div className="min-w-0 flex-1 wrap-anywhere">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 font-medium">{fund.title}</p>
                {style === "bars" && (
                  <span className="lab-muted text-xs tabular-nums">{pct}</span>
                )}
              </div>
              <p className="lab-muted text-sm tabular-nums">
                <span className="text-foreground">{fund.saved}</span>
                {fund.target ? ` de ${fund.target}` : " · Sin meta de importe"}
              </p>
              {fund.state && <p className="lab-muted text-xs">{fund.state}</p>}
              {style === "bars" && fund.ratio !== null && (
                <div className="lab-meter mt-2" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(1, fund.ratio) * 100}%`,
                      background: color,
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

export type RecentItem = {
  id: string;
  badge: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  amount: ReactNode;
  actions?: ReactNode;
};

export function RecentList({
  items,
  dense = false,
}: {
  items: RecentItem[];
  dense?: boolean;
}) {
  return (
    <ul className={`lab-recent${dense ? " is-dense" : ""}`}>
      {items.map((movement) => (
        <li key={movement.id}>
          {movement.badge}
          <div className="lab-recent__content">
            <p className="lab-recent__title">{movement.title}</p>
            <div className="lab-recent__sub">{movement.detail}</div>
          </div>
          <div className="lab-recent__amount">{movement.amount}</div>
          {movement.actions}
        </li>
      ))}
    </ul>
  );
}
