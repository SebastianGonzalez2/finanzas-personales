import type pg from "pg";

async function tableReady(client: pg.PoolClient, name: string) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS ready",
    [name],
  );
  return row.ready;
}

// Tablas de módulos retirados (SIMP-04): se leen solo para conservar el
// historial de los datos existentes.
export const creditOperationsReady = (client: pg.PoolClient) =>
  tableReady(client, "finance.credit_expenses");
export const loansReady = (client: pg.PoolClient) =>
  tableReady(client, "finance.loan_operations");
export const sharedExpensesReady = (client: pg.PoolClient) =>
  tableReady(client, "finance.shared_expenses");
export const mixedPurchasesReady = (client: pg.PoolClient) =>
  tableReady(client, "finance.mixed_purchases");
