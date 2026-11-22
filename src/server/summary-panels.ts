import "server-only";
import type pg from "pg";
import { budgetsReady, readBudgets } from "./budgets.ts";
import { listRecurrenceDueNotices } from "./due-notices.ts";

export async function summaryBudgets(
  client: pg.PoolClient,
  ownerId: string,
  period: string,
) {
  if (!(await budgetsReady(client))) return null;
  return readBudgets(client, ownerId, period);
}

/** Avisos del Resumen: solo recurrentes de gasto. */
export async function summaryRecurrenceNotices(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
) {
  const upcomingDays = 30;
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + upcomingDays);
  return {
    recurrences: (
      await listRecurrenceDueNotices(client, ownerId, today, upcomingDays)
    ).filter(({ isPayment }) => isPayment),
    upcomingThrough: horizon.toISOString().slice(0, 10),
  };
}
