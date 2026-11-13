import assert from "node:assert/strict";

// Cobertura RLS dinámica del esquema financiero (solo lectura). Toda tabla del
// esquema `finance` con columna `owner_id` es financiera por titular y debe
// tener RLS habilitada y forzada. No se fija un número de tablas: crece con las
// migraciones y cualquier tabla sin protección hace fallar la verificación.
export const financeRlsCoverageSql = `SELECT
  count(*)::int AS owner_tables,
  (count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity))::int AS protected_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='finance' AND c.relkind IN ('r','p') AND NOT c.relispartition
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='owner_id' AND a.attnum>0 AND NOT a.attisdropped
    )`;

// Devuelve el total de tablas protegidas. Lanza ERR_ASSERTION si no hay tablas
// con owner_id (esquema ausente o consulta inválida) o si alguna no está
// protegida. Solo recibe contadores: nunca expone nombres ni datos.
export const assertFinanceRlsCoverage = (row: unknown): number => {
  assert.ok(row && typeof row === "object");
  const { owner_tables: total, protected_tables: protectedCount } = row as {
    owner_tables?: number;
    protected_tables?: number;
  };
  assert.ok(typeof total === "number" && Number.isInteger(total) && total > 0);
  assert.ok(Number.isInteger(protectedCount));
  assert.equal(protectedCount, total);
  return total;
};
