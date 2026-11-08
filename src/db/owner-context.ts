import "server-only";
import type pg from "pg";

// Infrastructure boundary, not authentication. Only a server auth adapter may
// provide this resolver after checking a fresh session AND invitation admission.
// F0-04 supplies the fresh-session + persistent-admission resolver.
export type ResolveAuthorizedOwner = () => Promise<{ ownerId: string } | null>;

export async function setOwnerContext(client: pg.Client, ownerId: string) {
  if (
    typeof ownerId !== "string" ||
    ownerId.length < 1 ||
    ownerId.length > 200 ||
    ownerId.trim() !== ownerId
  )
    throw new Error("Identidad autorizada requerida");
  await client.query("SET LOCAL ROLE finanzas_app");
  await client.query("SELECT set_config('finance.owner_id', $1, true)", [
    ownerId,
  ]);
}

// A client checked out from a pool stays checked out through COMMIT/ROLLBACK.
// Never use pool.query for an interactive transaction.
export async function withOwnerTransaction<T>(
  pool: pg.Pool,
  resolveOwner: ResolveAuthorizedOwner,
  work: (client: pg.PoolClient, ownerId: string) => Promise<T>,
  validateConnection?: (client: pg.PoolClient) => Promise<void>,
): Promise<T> {
  let identity;
  try {
    identity = await resolveOwner();
  } catch {
    throw new Error("Acceso denegado");
  }
  if (!identity) throw new Error("Acceso denegado");
  let client;
  try {
    client = await pool.connect();
  } catch {
    throw new Error("Conexión de datos no disponible");
  }
  let discard = false;
  try {
    await validateConnection?.(client);
    await client.query("BEGIN");
    await setOwnerContext(client, identity.ownerId);
    const result = await work(client, identity.ownerId);
    // PostgreSQL answers COMMIT with ROLLBACK when work swallowed a SQL error.
    // A resolved query alone does not prove that the operation was persisted.
    const committed = await client.query("COMMIT");
    if (committed.command !== "COMMIT")
      throw new Error("Transacción no confirmada");
    return result;
  } catch {
    await client.query("ROLLBACK").catch(() => {
      discard = true;
    });
    // Raw PG errors can include values, concepts or connection information.
    throw new Error("Operación de datos rechazada");
  } finally {
    client.release(discard);
  }
}
