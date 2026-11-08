import "server-only";
import process from "node:process";
import pg from "pg";
import {
  developmentDatabaseConfig,
  developmentTarget,
} from "./neon-development-config.ts";
export function googleDatabaseConfig(
  env: Record<string, string | undefined>,
  kind: "auth" | "finance",
) {
  const expected =
    kind === "auth" ? "finanzas_google_auth" : "finanzas_google_finance";
  const value =
    env[
      kind === "auth"
        ? "GOOGLE_AUTH_DATABASE_URL"
        : "GOOGLE_FINANCE_DATABASE_URL"
    ];
  const config = developmentDatabaseConfig(
    { ...env, DATABASE_URL: value },
    developmentTarget,
  );
  if (config.user !== expected) throw new Error("Runtime no autorizado");
  return {
    ...config,
    max: 3,
    idleTimeoutMillis: 10000,
    application_name: `finanzas-F0-04-${kind}`,
  };
}
const pools: Partial<Record<"auth" | "finance", pg.Pool>> = {};
export function googlePool(kind: "auth" | "finance") {
  if (!pools[kind]) {
    const p = new pg.Pool(googleDatabaseConfig(process.env, kind));
    p.on("error", () => {});
    pools[kind] = p;
  }
  return pools[kind]!;
}
export async function assertGoogleRuntime(
  client: pg.PoolClient,
  kind: "auth" | "finance",
) {
  const expected =
    kind === "auth" ? "finanzas_google_auth" : "finanzas_google_finance";
  const {
    rows: [r],
  } =
    await client.query(`SELECT current_setting('neon.branch_id',true) AS branch,
    current_user AS role, rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole AS privileged,
    has_schema_privilege(current_user,'neon_auth','USAGE') AS managed_access,
    EXISTS(WITH RECURSIVE memberships(oid) AS (
      SELECT oid FROM pg_roles WHERE rolname=current_user UNION SELECT am.roleid FROM pg_auth_members am JOIN memberships m ON am.member=m.oid
    ) SELECT 1 FROM memberships m JOIN pg_roles r ON r.oid=m.oid WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid)) AS owns
    FROM pg_roles WHERE rolname=current_user`);
  if (
    r?.branch !== developmentTarget.branchId ||
    r.role !== expected ||
    r.privileged ||
    r.managed_access ||
    r.owns
  )
    throw new Error("Runtime no autorizado");
}
