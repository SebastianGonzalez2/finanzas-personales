import type { ClientConfig } from "pg";
import { neonDatabaseConfig, neonTargets } from "./neon-targets.ts";

// Configuración EXCLUSIVA de production para las herramientas de migración,
// migración Google Auth y aprovisionamiento de runtime. El runtime de la
// aplicación no la usa: sigue seleccionando su destino con neon-targets.ts.
// Ninguna variable de entorno puede seleccionar otro destino: solo CONFIRMAN
// el destino production fijado aquí.
export type ProductionTarget = {
  projectId: string;
  branchId: string;
  branchName: "production";
  database: string;
  endpointHost: string;
};

export class ProductionConfigError extends Error {
  constructor(
    message = "Configuración privada de Neon production incompleta o inválida",
  ) {
    super(message);
    this.name = "ProductionConfigError";
  }
}

// Verificado mediante Neon. Una variable de entorno no debe seleccionar una rama.
export const productionTarget: ProductionTarget = Object.freeze({
  projectId: neonTargets.production.projectId,
  branchId: neonTargets.production.branchId,
  branchName: "production",
  database: neonTargets.production.database,
  endpointHost: neonTargets.production.endpointHost,
});

// Único rol autorizado para ejecutar migraciones y aprovisionamiento en
// production: la URL directa privada del titular debe iniciar sesión con él.
export const productionOwnerRole = "neondb_owner";

type Environment = Record<string, string | undefined>;

export function requireProductionTarget(target: ProductionTarget | null) {
  if (!target || target.branchName !== "production") {
    throw new ProductionConfigError(
      "Pendiente confirmar proyecto y endpoint de production mediante Neon",
    );
  }
  return target;
}

export function productionDatabaseConfig(
  env: Environment,
  target: ProductionTarget | null,
  mode: "pooled" | "direct" = "pooled",
): ClientConfig {
  const approved = requireProductionTarget(target);
  try {
    return neonDatabaseConfig(
      env,
      { ...approved, environment: "production" },
      mode,
    );
  } catch {
    // Los errores de URL o del driver pueden contener credenciales.
    throw new ProductionConfigError();
  }
}

export type ProductionSessionRow = {
  database: unknown;
  branch: unknown;
  session_user: unknown;
  current_user: unknown;
};

type OwnerClient = {
  query(sql: string): Promise<{ rows: ProductionSessionRow[] }>;
};

// Identidad real de la sesión del titular antes de ejecutar cualquier DDL en
// production: base, rama, endpoint (host fijado por la configuración cerrada) y
// rol propietario. `neon.project_id` no es una GUC estable; la identidad del
// proyecto queda fijada por el host y la confirmación NEON_PROJECT_ID/rama.
export async function assertProductionOwnerSession(client: OwnerClient) {
  const { rows } = await client.query(
    `SELECT current_database() AS database,
      current_setting('neon.branch_id', true) AS branch,
      session_user AS session_user,
      current_user AS current_user`,
  );
  const row = rows[0];
  if (
    !row ||
    row.database !== productionTarget.database ||
    row.branch !== productionTarget.branchId ||
    row.session_user !== productionOwnerRole ||
    row.current_user !== productionOwnerRole
  ) {
    throw new ProductionConfigError(
      "Sesión no autorizada para Neon production",
    );
  }
  return row;
}
