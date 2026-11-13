import type { ClientConfig } from "pg";
import { neonDatabaseConfig, neonTargets } from "./neon-targets.ts";

// Configuración EXCLUSIVA de development para scripts de migración, sondas y
// pruebas. El runtime de la aplicación selecciona su destino con
// neon-targets.ts (development/production por entorno de ejecución).
export type DevelopmentTarget = {
  projectId: string;
  branchId: string;
  branchName: "development";
  database: string;
  endpointHost: string;
};

export class DevelopmentConfigError extends Error {
  constructor(
    message = "Configuración privada de Neon development incompleta o inválida",
  ) {
    super(message);
    this.name = "DevelopmentConfigError";
  }
}

// Verificado mediante Neon. Una variable de entorno no debe seleccionar una rama.
export const developmentTarget: DevelopmentTarget = {
  projectId: neonTargets.development.projectId,
  branchId: neonTargets.development.branchId,
  branchName: "development",
  database: neonTargets.development.database,
  endpointHost: neonTargets.development.endpointHost,
};

type Environment = Record<string, string | undefined>;

export function requireDevelopmentTarget(target: DevelopmentTarget | null) {
  if (!target || target.branchName !== "development") {
    throw new DevelopmentConfigError(
      "Pendiente confirmar proyecto y endpoint de development mediante Neon",
    );
  }
  return target;
}

export function developmentDatabaseConfig(
  env: Environment,
  target: DevelopmentTarget | null,
  mode: "pooled" | "direct" = "pooled",
): ClientConfig {
  const approved = requireDevelopmentTarget(target);
  try {
    return neonDatabaseConfig(
      env,
      { ...approved, environment: "development" },
      mode,
    );
  } catch {
    // Los errores de URL o del driver pueden contener credenciales.
    throw new DevelopmentConfigError();
  }
}
