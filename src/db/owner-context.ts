import "server-only";
import type pg from "pg";

// Infrastructure boundary, not authentication. Only a server auth adapter may
// provide this resolver after checking a fresh session AND authorization (v9.49).
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
  pool: { connect: () => Promise<pg.PoolClient> },
  resolveOwner: ResolveAuthorizedOwner,
  work: (client: pg.PoolClient, ownerId: string) => Promise<T>,
  options?: { repeatableRead?: boolean; exclusive?: boolean },
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
    await client.query(
      options?.repeatableRead
        ? "BEGIN ISOLATION LEVEL REPEATABLE READ"
        : "BEGIN",
    );
    await setOwnerContext(client, identity.ownerId);
    // Restores take the exclusive form. Ordinary requests still use their
    // existing domain locks and may proceed concurrently for this owner.
    await client.query(
      options?.exclusive
        ? "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:account:' || $1, 0))"
        : "SELECT pg_advisory_xact_lock_shared(hashtextextended('finanzas:account:' || $1, 0))",
      [identity.ownerId],
    );
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
