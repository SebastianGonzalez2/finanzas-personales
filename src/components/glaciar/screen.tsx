import type { ReactNode, Ref } from "react";
import { buttonClass } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { HelpPopover } from "./help-popover";

// UI-05A — Kit de pantalla Glaciar (P-01). Compone las clases aprobadas de
// Resumen/Historial (`.f-pagehead`, `.c-eyebrow`, `.f-title`, `.lab-panel`,
// `.b-notice`) con las `gs-*` de `glaciar-screens.css`. Solo presentación.

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="glaciar-summary glaciar-history glaciar-screen">
      {children}
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="f-pagehead">
      <div className="min-w-0">
        <p className="c-eyebrow">
          <span className="c-eyebrow__line" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1 id="titulo-pagina" tabIndex={-1} className="f-title wrap-anywhere">
          {title}
        </h1>
        {description && <p className="gs-desc">{description}</p>}
      </div>
      {actions && <div className="gs-actions">{actions}</div>}
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
  tone,
  help,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  hero?: boolean;
  extra?: ReactNode;
  tone?: "good" | "warning" | "critical";
  help?: { label: string; text: string };
}) {
  return (
    <div
      className={`gs-kpi ${hero ? "gs-kpi--hero" : ""} ${tone ? `gs-kpi--${tone}` : ""}`}
    >
      {hero && <span className="gs-kpi__glow" aria-hidden="true" />}
      <p className="gs-kpi__label">
        {icon && <Icon name={icon} className="size-4" />}
        {label}
        {help && <HelpPopover label={help.label}>{help.text}</HelpPopover>}
      </p>
      <p className="gs-kpi__value">{value}</p>
      {sub && <p className="gs-kpi__sub">{sub}</p>}
      {extra}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  labelId = "estado-vacio",
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  labelId?: string;
}) {
  return (
    <section className="lab-panel gs-empty" aria-labelledby={labelId}>
      <span className="gs-empty__icon" aria-hidden="true">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 id={labelId} className="gs-empty__title">
        {title}
      </h2>
      <p>{children}</p>
      {actions && <div className="gs-actions">{actions}</div>}
    </section>
  );
}

export function PageNotice({
  tone,
  message,
  retryHref,
}: {
  tone: "info" | "critical";
  message: string;
  retryHref?: string;
}) {
  const critical = tone === "critical";
  return (
    <section className="lab-panel">
      <div
        className={`b-notice b-notice--${tone}`}
        role={critical ? "alert" : "status"}
      >
        <Icon
          name={critical ? "alert" : "info"}
          className="size-4.5 shrink-0"
        />
        <div className="min-w-0">
          <p className="font-medium">{message}</p>
          {critical && (
            <p className="lab-muted mt-1 text-sm">
              Tus datos no se modificaron. Si el problema sigue, revisá tu
              conexión.
            </p>
          )}
        </div>
      </div>
      {critical && retryHref && (
        <div className="gs-actions">
          <a href={retryHref} className={buttonClass("outline")}>
            <Icon name="recurring" duotone={false} className="size-4" />
            Reintentar
          </a>
        </div>
      )}
    </section>
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
      className={`gs-row__icon ${accent ? "gs-row__icon--accent" : ""}`}
      aria-hidden="true"
    >
      <Icon name={name} className="size-4.5" />
    </span>
  );
}

export function FormPanel({
  labelId,
  title,
  description,
  headingRef,
  children,
}: {
  labelId: string;
  title: string;
  description?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <section className="gs-form" aria-labelledby={labelId}>
      <div className="gs-form__head">
        <div className="min-w-0">
          <h2
            id={labelId}
            ref={headingRef}
            tabIndex={-1}
            className="gs-form__title"
          >
            {title}
          </h2>
          {description && <p className="gs-hint mt-1">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function FormFoot({ children }: { children: ReactNode }) {
  return <div className="gs-form__foot">{children}</div>;
}

export function FormSection({
  legend,
  children,
}: {
  legend: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="gs-form__section">
      <legend className="gs-form__section-title">{legend}</legend>
      {children}
    </fieldset>
  );
}

// UI-05B — Etiqueta de estado (icono + texto: el color nunca es la única señal).
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
