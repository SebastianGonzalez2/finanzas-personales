import "server-only";
import process from "node:process";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "./neon-development-config.ts";

export function restrictedConfig(
  env: Record<string, string | undefined>,
  kind: "finance" | "admission",
) {
  const url =
    env[kind === "finance" ? "DATABASE_RUNTIME_URL" : "DATABASE_ADMISSION_URL"];
  const config = developmentDatabaseConfig(
    { ...env, DATABASE_URL: url },
    developmentTarget,
  );
  if (
    config.user !==
    (kind === "finance" ? "finanzas_runtime" : "finanzas_admission")
  )
    throw new Error("Credencial de runtime no autorizada");
  return { ...config, application_name: "finanzas-personales-F0-04", max: 3 };
}
const pools: Partial<Record<"finance" | "admission", pg.Pool>> = {};
export function authPool(kind: "finance" | "admission") {
  if (!pools[kind]) {
    pools[kind] = new pg.Pool(restrictedConfig(process.env, kind));
    pools[kind].on("error", () => {});
  }
  return pools[kind];
}
// Inspect effective privileges on every checked-out connection before work.
// The role name alone is insufficient if an administrator accidentally grants bypass.
export async function assertRuntime(
  client: pg.PoolClient,
  kind: "finance" | "admission",
) {
  const result = await client.query(
    `SELECT
    current_setting('neon.branch_id', true) = $1 AS branch,
    current_user = $2 AND session_user = $2 AS identity,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT rolinherit) AS login_restricted,
    NOT EXISTS (SELECT 1 FROM pg_roles r WHERE
      (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb)
      AND pg_has_role(session_user, r.oid, 'MEMBER')) AS restricted,
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('finance','admission','neon_auth','finance_meta')
      AND pg_has_role(session_user, c.relowner, 'MEMBER')) AS no_ownership,
    NOT has_schema_privilege(session_user, 'neon_auth', 'USAGE') AS no_auth,
    ($2 = 'finanzas_runtime' OR NOT has_schema_privilege(session_user, 'finance', 'USAGE')) AS separated
    `,
    [
      developmentTarget.branchId,
      kind === "finance" ? "finanzas_runtime" : "finanzas_admission",
    ],
  );
  if (!Object.values(result.rows[0] ?? {}).every((v) => v === true))
    throw new Error("Runtime no autorizado");
}
export async function admissionTransaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await authPool("admission").connect();
  let discard = false;
  try {
    await assertRuntime(client, "admission");
    await client.query("BEGIN");
    // Serializes issue/consume/rotate across instances. No per-process policy cache.
    await client.query("SELECT pg_advisory_xact_lock(704004)");
    const value = await work(client);
    if ((await client.query("COMMIT")).command !== "COMMIT")
      throw new Error("Sin confirmación");
    return value;
  } catch {
    await client.query("ROLLBACK").catch(() => {
      discard = true;
    });
    throw new Error("Admisión no disponible");
  } finally {
    client.release(discard);
  }
}
