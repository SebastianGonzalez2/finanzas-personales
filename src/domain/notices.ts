import type { Budget } from "./budgets.ts";

// F3-07 (RF-032/038): avisos internos de presupuestos y metas de fondos.
// Cálculo y mensajes compartidos por el servidor y la interfaz.

const scale = BigInt(10000);

function decimalUnits(value: string) {
  if (typeof value !== "string") return null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const units =
    BigInt(whole) * scale + BigInt(fraction.padEnd(4, "0").slice(0, 4));
  return negative ? -units : units;
}

/** Porcentaje entero del límite ya consumido (piso), o null si no se puede calcular. */
export function budgetAlertPercent(consumed: string, limit: string) {
  const used = decimalUnits(consumed);
  const budgeted = decimalUnits(limit);
  if (used === null || budgeted === null || budgeted <= BigInt(0)) return null;
  return Number((used * BigInt(100)) / budgeted);
}

export type BudgetAlertState = "ok" | "warning" | "danger";

/** Umbral de aviso: 80% advierte y 100% indica límite alcanzado. */
export function budgetAlertState(percent: number | null): BudgetAlertState {
  if (percent === null) return "ok";
  if (percent >= 100) return "danger";
  if (percent >= 80) return "warning";
  return "ok";
}

export type BudgetAlert = {
  budget: Budget;
  state: "warning" | "danger";
  percent: number;
};

/** Avisos del mes mostrado, del más urgente al menos urgente. */
export function budgetAlerts(budgets: Budget[], month: string): BudgetAlert[] {
  return budgets
    .map((budget) => {
      const percent =
        budget.progress && budget.progress.month === month
          ? budgetAlertPercent(budget.progress.consumed, budget.effectiveLimit)
          : null;
      return { budget, state: budgetAlertState(percent), percent };
    })
    .filter(
      (
        item,
      ): item is {
        budget: Budget;
        state: "warning" | "danger";
        percent: number;
      } => item.state !== "ok",
    )
    .sort((a, b) =>
      a.state === b.state
        ? b.percent - a.percent
        : a.state === "danger"
          ? -1
          : 1,
    );
}

export function budgetAlertMessage(
  state: "warning" | "danger",
  percent: number,
  categoryName: string,
) {
  return state === "danger"
    ? `Llegaste al límite del presupuesto de ${categoryName} este mes (${percent}%). Podés seguir gastando: no se bloquean compras.`
    : `El consumo llegó al ${percent}% del presupuesto de ${categoryName} este mes.`;
}
