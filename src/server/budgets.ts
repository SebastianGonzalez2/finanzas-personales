import "server-only";
import type pg from "pg";
import type { Budget } from "../domain/budgets.ts";

/** La migración de presupuestos es parte del servidor del ticket F3-06. */
export async function budgetsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.budget_limits') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export const budgetsPending = "budgets-server-pending";

/**
 * Implementar en la parte de servidor asignada a Codex (F3-06): listado con
 * límite efectivo por mes, consumo convertido por cotización, cuotas con
 * cotización fija (v5.4), historial de ediciones y excepciones temporales.
 */
export async function listBudgets(
  client: pg.PoolClient,
  ownerId: string,
): Promise<Budget[]> {
  if (!client || !ownerId) throw new Error("Owner requerido");
  throw new Error(budgetsPending);
}
