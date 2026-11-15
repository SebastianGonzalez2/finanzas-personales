import type { ReactNode } from "react";
import { budgetAlertMessage, type BudgetAlertState } from "@/domain/notices";
import { Card } from "./ui/card";

// F3-07: componentes de avisos internos compartidos por Avisos, Presupuestos
// y Fondos. Sin acciones automáticas: solo informar (RF-032/038).

const levelClass = {
  warning: "border-amber-500/70",
  danger: "border-red-600/70",
} as const;

export type NoticeLevel = keyof typeof levelClass;

const noticeText = {
  warning: "text-sm text-amber-400",
  danger: "text-sm text-red-400",
} as const;

/** Tarjeta de aviso con borde según gravedad y enlace opcional a su origen. */
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
    <Card className={`gap-2 p-4 text-sm ${levelClass[level]}`}>
      {children}
      {href && (
        <a
          className="min-h-11 content-center font-semibold underline"
          href={href}
        >
          {linkLabel}
        </a>
      )}
    </Card>
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
      className={className ?? noticeText[state]}
    >
      {budgetAlertMessage(state, percent, categoryName)}
    </p>
  );
}
