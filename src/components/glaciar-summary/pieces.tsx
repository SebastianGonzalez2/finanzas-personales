import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "../ui/icon";
import { Sparkline } from "./charts";

export function FlowCard({
  kind,
  amounts,
  variation,
  trend,
}: {
  kind: "income" | "expense";
  amounts: string[];
  variation?: ReactNode;
  trend: (number | null)[];
}) {
  const income = kind === "income";
  const title = income ? "Ingresos del mes" : "Gastos del mes";
  return (
    <section
      aria-labelledby={`b-${kind}`}
      className={`lab-panel b-flow b-flow--${kind}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`b-${kind}`} className="b-eyebrow">
          <span className="b-eyebrow__icon">
            <Icon name={kind} duotone={false} className="size-4" />
          </span>
          {title}
        </h2>
        {variation}
      </header>
      <div className="flex items-end justify-between gap-3">
        {amounts.length ? (
          <ul aria-label={title} className="min-w-0 wrap-anywhere">
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
            <p className="b-flow__value">Sin datos</p>
            <p className="lab-muted text-sm">
              {income
                ? "Los ingresos registrados aparecerán acá."
                : "Los gastos registrados aparecerán acá."}
            </p>
          </div>
        )}
        <Sparkline
          values={trend}
          color={`var(--data-${kind})`}
          label={`Tendencia de ${income ? "ingresos" : "gastos"} en seis meses`}
          width={104}
          height={40}
        />
      </div>
    </section>
  );
}

export type CardObject = {
  id: string;
  name: string;
  debts: string[];
  footer: ReactNode;
  progress: number | null;
  href?: string;
};

export function CardObjects({ cards }: { cards: CardObject[] }) {
  return (
    <ul className="b-cards">
      {cards.map((card, index) => (
        <li
          key={card.id}
          className={`b-card ${index % 2 ? "b-card--teal" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            {card.href ? (
              <Link
                href={card.href}
                className="min-w-0 text-sm font-semibold wrap-anywhere hover:underline"
              >
                {card.name}
              </Link>
            ) : (
              <span className="min-w-0 text-sm font-semibold wrap-anywhere">
                {card.name}
              </span>
            )}
            <span className="b-card__chip shrink-0" aria-hidden="true" />
          </div>
          <p className="b-card__debt wrap-anywhere tabular-nums">
            {card.debts.map((debt) => (
              <span key={debt}>{debt}</span>
            ))}
          </p>
          {card.progress !== null && (
            <div
              className="b-card__cycle"
              role="progressbar"
              aria-label="Avance del ciclo"
              aria-valuenow={card.progress}
            >
              <span style={{ width: `${card.progress}%` }} />
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-x-2 text-xs">
            {card.footer}
          </div>
        </li>
      ))}
    </ul>
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
