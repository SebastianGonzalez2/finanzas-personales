import type { ReactNode } from "react";
import { formatBankAmount } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { buttonClass } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

// UI-05-DESIGN — Piezas de pantalla propuestas (P-01). Componen las clases
// aprobadas de Resumen/Historial (`.f-pagehead`, `.c-eyebrow`, `.f-title`,
// `.lab-panel`, `.lab-tag`, `.b-notice`) con las nuevas `.ui05-*`.

/** Importe con el formato real de la app (decimal exacto, código ISO). */
export const m = (amount: string, currency: Currency = "UYU") =>
  formatBankAmount({ amount, currency });

export function Screen({ children }: { children: ReactNode }) {
  return <div className="glaciar-summary glaciar-history ui05">{children}</div>;
}

export function PageHead({
  eyebrow,
  title,
  description,
  back,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="f-pagehead">
      <div className="min-w-0">
        {back && (
          <a href={back.href} className="ui05-back">
            <Icon name="chevronLeft" duotone={false} className="size-4" />
            {back.label}
          </a>
        )}
        <p className="c-eyebrow">
          <span className="c-eyebrow__line" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1 id="titulo-pagina" tabIndex={-1} className="f-title wrap-anywhere">
          {title}
        </h1>
        {description && <p className="ui05-desc">{description}</p>}
      </div>
      {actions && <div className="ui05-actions">{actions}</div>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  icon,
  hero,
  extra,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  hero?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className={`ui05-kpi ${hero ? "ui05-kpi--hero" : ""}`}>
      <p className="ui05-kpi__label">
        {icon && <Icon name={icon} className="size-4" />}
        {label}
      </p>
      <p className="ui05-kpi__value">{value}</p>
      {sub && <p className="ui05-kpi__sub">{sub}</p>}
      {extra}
    </div>
  );
}

export function StateTag({
  tone,
  children,
}: {
  tone: "good" | "warning" | "critical" | "neutral";
  children: ReactNode;
}) {
  const icon: IconName =
    tone === "good" ? "check" : tone === "neutral" ? "dot" : "alert";
  return (
    <span className={`lab-tag lab-tag--${tone}`}>
      <Icon name={icon} duotone={false} className="size-3" />
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="lab-panel ui05-empty" aria-labelledby="estado-vacio">
      <span className="ui05-empty__icon" aria-hidden="true">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 id="estado-vacio" className="ui05-empty__title">
        {title}
      </h2>
      <p>{children}</p>
      {actions && <div className="ui05-actions">{actions}</div>}
    </section>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <section className="lab-panel" aria-labelledby="estado-error">
      <h2 id="estado-error" className="sr-only">
        Error de carga
      </h2>
      <div className="b-notice b-notice--critical" role="alert">
        <Icon name="alert" className="size-4.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">{message}</p>
          <p className="lab-muted mt-1 text-sm">
            Tus datos no se modificaron. Si el problema sigue, revisá tu
            conexión.
          </p>
        </div>
      </div>
      <div className="ui05-actions">
        <button type="button" className={buttonClass("outline")}>
          <Icon name="recurring" duotone={false} className="size-4" />
          Reintentar
        </button>
      </div>
    </section>
  );
}

export function FormPanel({
  title,
  description,
  children,
  foot,
  onCloseHref,
  labelId,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  foot: ReactNode;
  onCloseHref?: string;
  labelId: string;
}) {
  return (
    <section className="ui05-form" aria-labelledby={labelId}>
      <div className="ui05-form__head">
        <div className="min-w-0">
          <h2 id={labelId} className="ui05-form__title">
            {title}
          </h2>
          {description && <p className="ui05-hint mt-1">{description}</p>}
        </div>
        {onCloseHref && (
          <a href={onCloseHref} className="ui-icon-btn" aria-label="Cerrar">
            <Icon name="close" duotone={false} />
          </a>
        )}
      </div>
      {children}
      <div className="ui05-form__foot">{foot}</div>
    </section>
  );
}

export function Review({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="ui05-review">
      {rows.map(([term, value], index) => (
        <div key={index}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Effects({ items }: { items: string[] }) {
  return (
    <ul className="ui05-effects" aria-label="Qué cambia al confirmar">
      {items.map((item) => (
        <li key={item}>
          <Icon name="check" duotone={false} className="size-3.5" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function RowIcon({
  name,
  accent,
}: {
  name: IconName;
  accent?: boolean;
}) {
  return (
    <span
      className={`ui05-row__icon ${accent ? "ui05-row__icon--accent" : ""}`}
      aria-hidden="true"
    >
      <Icon name={name} className="size-4.5" />
    </span>
  );
}

export function HBars({
  items,
}: {
  items: { label: string; value: string; ratio: number; color: string }[];
}) {
  return (
    <ul className="ui05-hbars">
      {items.map((item) => (
        <li key={item.label}>
          <div className="ui05-hbars__head">
            <span className="flex min-w-0 items-center gap-2 wrap-anywhere">
              <span
                className="ui05-swatch"
                style={{ background: item.color }}
                aria-hidden="true"
              />
              {item.label}
            </span>
            <span className="tabular-nums">{item.value}</span>
          </div>
          <div className="ui05-hbars__track" aria-hidden="true">
            <span
              style={{
                width: `${Math.round(item.ratio * 100)}%`,
                background: item.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
