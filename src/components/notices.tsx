import type { ReactNode } from "react";
import { budgetAlertMessage, type BudgetAlertState } from "@/domain/notices";
import { Panel } from "./glaciar-summary/panel";
import { Icon, type IconName } from "./ui/icon";

// F3-07: componentes de avisos internos compartidos por Avisos, Presupuestos
// y Fondos. Sin acciones automáticas: solo informar (RF-032/038).
// UI-05H: presentación Glaciar (`.b-notice`); niveles y contenido sin cambios.

const levelTone = {
  warning: "warning",
  danger: "critical",
} as const;

export type NoticeLevel = keyof typeof levelTone;

/** Aviso con icono y gravedad (color + icono) y enlace opcional a su origen. */
export function NoticeCard({
  level,
  href,
  linkLabel,
  children,
}: {
  level: NoticeLevel;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={`b-notice b-notice--${levelTone[level]}`}>
      <Icon name="alert" className="size-4.5 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1 wrap-anywhere">
        {children}
        {href && (
          <a className="lab-link min-h-11 content-center" href={href}>
            {linkLabel}
            <Icon name="chevronRight" duotone={false} className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/** Grupo de avisos por módulo: panel Glaciar con contador y lista. */
export function NoticeGroup({
  id,
  title,
  icon,
  count,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Panel
      id={id}
      title={title}
      icon={icon}
      action={
        count !== undefined && count > 0 ? (
          <span className="lab-tag lab-tag--neutral">{count}</span>
        ) : undefined
      }
    >
      {children}
    </Panel>
  );
}

/** Aviso de presupuesto al 80% (advertencia) o 100% (límite alcanzado). */
export function BudgetThresholdNotice({
  categoryName,
  percent,
  state,
  className,
}: {
  categoryName: string;
  percent: number;
  state: Exclude<BudgetAlertState, "ok">;
  /** Reemplaza el color por defecto (p. ej. tokens semánticos Glaciar). */
  className?: string;
}) {
  return (
    <p
      role={state === "danger" ? "alert" : "status"}
      className={className ?? "lab-muted text-sm"}
    >
      {budgetAlertMessage(state, percent, categoryName)}
    </p>
  );
}
