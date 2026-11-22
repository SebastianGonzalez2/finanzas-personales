import type pg from "pg";

// Serializa las escrituras de un titular dentro de la transacción. La clave se
// conserva tal como la usaban las escrituras anteriores.
export async function lockOwnerWrites(client: pg.PoolClient, ownerId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:bank:' || $1::text, 0))",
    [ownerId],
  );
}
