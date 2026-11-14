import "server-only";
import process from "node:process";
import pg from "pg";
import {
  neonDatabaseConfig,
  neonTargetFor,
  type NeonTarget,
} from "./neon-targets.ts";
import { GoogleStageError } from "./google-diagnostics.ts";

type GoogleKind = "auth" | "finance";
type Environment = Record<string, string | undefined>;

const expectedRole = (kind: GoogleKind) =>
  kind === "auth" ? "finanzas_google_auth" : "finanzas_google_finance";

// El destino (development/production) lo determina el entorno de ejecución, no
// una variable libre; las variables solo se validan contra ese destino cerrado.
// Si Production está mal configurado, falla: nunca degrada a development.
export function googleDatabaseConfig(env: Environment, kind: GoogleKind) {
  const expected = expectedRole(kind);
  const value =
    env[
      kind === "auth"
        ? "GOOGLE_AUTH_DATABASE_URL"
        : "GOOGLE_FINANCE_DATABASE_URL"
    ];
  const config = neonDatabaseConfig(
    { ...env, DATABASE_URL: value },
    neonTargetFor(env),
  );
  if (config.user !== expected)
    throw new GoogleStageError("config.database-role", "Runtime no autorizado");
  return {
    ...config,
    max: 3,
    idleTimeoutMillis: 10000,
    application_name: `finanzas-F0-04-${kind}`,
  };
}
const pools: Partial<Record<GoogleKind, pg.Pool>> = {};
export function googlePool(kind: GoogleKind) {
  if (!pools[kind]) {
    const p = new pg.Pool(googleDatabaseConfig(process.env, kind));
    p.on("error", () => {});
    pools[kind] = p;
  }
  return pools[kind]!;
}

export type GoogleRuntimeRow = {
  branch?: string | null;
  database?: string | null;
  role?: string | null;
  privileged?: boolean | null;
  managed_access?: boolean | null;
  owns?: boolean | null;
};

// Comprobación pura de la identidad real de la sesión PostgreSQL frente al
// destino esperado: rama, base, rol, ausencia de privilegios y de acceso a los
// esquemas administrados por Neon.
export function assertGoogleRuntimeRow(
  row: GoogleRuntimeRow | undefined,
  kind: GoogleKind,
  target: NeonTarget,
) {
  // Cada comprobación tiene su propio código de etapa (sin valores) para que un
  // rechazo en Production pueda distinguirse sin registrar datos de la sesión.
  const stage = !row
    ? "runtime.mismatch-row"
    : row.branch !== target.branchId
      ? "runtime.mismatch-branch"
      : row.database !== target.database
        ? "runtime.mismatch-database"
        : row.role !== expectedRole(kind)
          ? "runtime.mismatch-role"
          : row.privileged !== false
            ? "runtime.mismatch-privileged"
            : row.managed_access !== false
              ? "runtime.mismatch-managed-access"
              : row.owns !== false
                ? "runtime.mismatch-owns"
                : undefined;
  if (stage) throw new GoogleStageError(stage, "Runtime no autorizado");
}

export async function assertGoogleRuntime(
  client: pg.PoolClient,
  kind: GoogleKind,
  env: Environment = process.env,
) {
  const target = neonTargetFor(env);
  const {
    rows: [r],
  } =
    await client.query(`SELECT current_setting('neon.branch_id',true) AS branch,
    current_database() AS database,
    current_user AS role, rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole AS privileged,
    has_schema_privilege(current_user,'neon_auth','USAGE') AS managed_access,
    EXISTS(WITH RECURSIVE memberships(oid) AS (
      SELECT oid FROM pg_roles WHERE rolname=current_user UNION SELECT am.roleid FROM pg_auth_members am JOIN memberships m ON am.member=m.oid
    ) SELECT 1 FROM memberships m JOIN pg_roles r ON r.oid=m.oid WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid)) AS owns
    FROM pg_roles WHERE rolname=current_user`);
  assertGoogleRuntimeRow(r, kind, target);
}
