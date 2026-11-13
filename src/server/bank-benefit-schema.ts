import "server-only";
import type pg from "pg";

// F5-09: lectura segura antes de aplicar la migración 0035 en cada entorno.
export async function bankBenefitsReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.bank_benefits') IS NOT NULL AS ready",
  );
  return row.ready;
}
