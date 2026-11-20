import type { ReactNode } from "react";
import { Icon } from "../ui/icon";
import { Sparkline } from "./charts";

export function ExpenseCard({
  amounts,
  variation,
  comparison,
  trend,
}: {
  amounts: string[];
  variation?: ReactNode;
  comparison?: ReactNode;
  trend: (number | null)[];
}) {
  return (
    <section
      aria-labelledby="b-expense"
      className="lab-panel b-flow b-flow--expense b-span-7"
      data-tour="gastos-mes"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="b-expense" className="b-eyebrow">
          <span className="b-eyebrow__icon">
            <Icon name="expense" duotone={false} className="size-4" />
          </span>
          Gastos del mes
        </h2>
        {variation}
      </header>
      <div className="flex items-end justify-between gap-3">
        {amounts.length ? (
          <ul aria-label="Gastos del mes" className="min-w-0 wrap-anywhere">
            {amounts.map((amount, index) => (
              <li
                key={amount}
                className={`tabular-nums ${index === 0 ? "b-flow__value" : "lab-muted text-sm"}`}
              >
                {amount}
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="b-flow__value">Sin gastos</p>
            <p className="lab-muted text-sm">
              Los gastos registrados aparecerán acá.
            </p>
          </div>
        )}
        <Sparkline
          values={trend}
          color="var(--data-expense)"
          label="Tendencia de gastos en seis meses"
          width={104}
          height={40}
        />
      </div>
      {comparison}
    </section>
  );
}

export type SummaryNotice = {
  id: string;
  title: ReactNode;
  detail: ReactNode;
  tone: "info" | "warning" | "critical";
};

export function Notices({ notices }: { notices: SummaryNotice[] }) {
  return (
    <ul className="b-notices">
      {notices.map((notice) => (
        <li key={notice.id} className={`b-notice b-notice--${notice.tone}`}>
          <Icon
            name={notice.tone === "info" ? "info" : "alert"}
            className="size-4.5 shrink-0"
          />
          <div className="min-w-0 wrap-anywhere">
            <p className="font-medium">{notice.title}</p>
            <div className="lab-muted text-xs">{notice.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
