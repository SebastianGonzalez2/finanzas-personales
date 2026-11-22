import type pg from "pg";

// PERF-01: una tabla o vista que ya existe no desaparece mientras el proceso
// vive (las migraciones solo agregan). Las sondas `to_regclass` se repetían en
// cada petición (hasta 39 viajes a la base por pantalla). Solo se recuerda el
// resultado positivo: mientras falte una migración se vuelve a consultar.
export const schemaKnown = new Set<string>();

export function rememberSchema(key: string, ready: boolean) {
  if (ready) schemaKnown.add(key);
  return ready;
}

async function tableReady(client: pg.PoolClient, name: string) {
  if (schemaKnown.has(name)) return true;
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS ready",
    [name],
  );
  return rememberSchema(name, row.ready);
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
