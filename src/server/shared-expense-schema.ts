import "server-only";
import type pg from "pg";

export async function sharedExpensesReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.shared_expenses') IS NOT NULL AS ready",
  );
  return row.ready;
}

export async function isSharedExpense(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (!(await sharedExpensesReady(client))) return false;
  const { rowCount } = await client.query(
    "SELECT 1 FROM finance.shared_expenses WHERE owner_id = $1 AND event_id = $2",
    [ownerId, eventId],
  );
  return !!rowCount;
}
