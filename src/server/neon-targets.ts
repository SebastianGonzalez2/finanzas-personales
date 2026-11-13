import type { ClientConfig } from "pg";

// Lista CERRADA de destinos Neon permitidos. Ninguna variable de entorno puede
// introducir otra rama, endpoint o base: las variables solo CONFIRMAN el destino
// que el entorno de ejecución ya determinó (ver resolveNeonEnvironment).
export type NeonEnvironment = "development" | "production";

export type NeonTarget = {
  environment: NeonEnvironment;
  projectId: string;
  branchId: string;
  branchName: NeonEnvironment;
  database: string;
  endpointHost: string;
};

export type NeonConfigReason =
  "environment" | "identity" | "connection" | "ssl-option" | "target";

// Los mensajes nunca contienen valores de variables: un parser de URL o el
// driver pueden incluir credenciales, así que no se conservan causas.
export class NeonConfigError extends Error {
  readonly environment: NeonEnvironment | "unknown";
  readonly reason: NeonConfigReason;
  constructor(
    environment: NeonEnvironment | "unknown",
    reason: NeonConfigReason,
  ) {
    super(
      `Configuración privada de Neon ${environment} incompleta o inválida (${reason})`,
    );
    this.name = "NeonConfigError";
    this.environment = environment;
    this.reason = reason;
  }
}

const developmentTargetValue: NeonTarget = Object.freeze({
  environment: "development",
  projectId: "dry-voice-45959315",
  branchId: "br-late-feather-b6czfkx0",
  branchName: "development",
  database: "neondb",
  endpointHost: "ep-falling-queen-b63xbfuk.c-2.sa-east-1.aws.neon.tech",
});

const productionTargetValue: NeonTarget = Object.freeze({
  environment: "production",
  projectId: "dry-voice-45959315",
  branchId: "br-wild-mode-b64fgovd",
  branchName: "production",
  database: "neondb",
  endpointHost: "ep-morning-sunset-b6i4kxdg.c-2.sa-east-1.aws.neon.tech",
});

export const neonTargets: Readonly<Record<NeonEnvironment, NeonTarget>> =
  Object.freeze({
    development: developmentTargetValue,
    production: productionTargetValue,
  });

type Environment = Record<string, string | undefined>;

// Vercel Production -> production. Vercel Preview/Development y ejecución local
// (ni VERCEL ni VERCEL_ENV definidos) -> development. Cualquier otra señal es un
// error: nunca se adivina ni se degrada a development en entornos hospedados.
export function resolveNeonEnvironment(env: Environment): NeonEnvironment {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === "production") {
    // Un VERCEL_ENV=production heredado (p. ej. un archivo .env descargado) fuera
    // de Vercel no debe poder abrir conexiones locales a production.
    if (env.VERCEL !== "1")
      throw new NeonConfigError("production", "environment");
    return "production";
  }
  if (vercelEnv === "preview" || vercelEnv === "development") {
    return "development";
  }
  if (vercelEnv === undefined || vercelEnv === "") {
    // Hospedado sin identificar el entorno: no asumir development.
    if (env.VERCEL) throw new NeonConfigError("unknown", "environment");
    return "development";
  }
  throw new NeonConfigError("unknown", "environment");
}

export function neonTargetFor(env: Environment): NeonTarget {
  return neonTargets[resolveNeonEnvironment(env)];
}

// Núcleo de validación. Solo recibe destinos de la lista cerrada (los scripts y
// pruebas con destinos sintéticos pasan por developmentDatabaseConfig).
export function neonDatabaseConfig(
  env: Environment,
  target: NeonTarget,
  mode: "pooled" | "direct" = "pooled",
): ClientConfig {
  if (target.branchName !== target.environment) {
    throw new NeonConfigError(target.environment, "target");
  }
  if (
    env.NEON_BRANCH_ID !== target.branchId ||
    env.NEON_PROJECT_ID !== target.projectId
  ) {
    throw new NeonConfigError(target.environment, "identity");
  }
  try {
    const url = new URL(
      env[mode === "pooled" ? "DATABASE_URL" : "DATABASE_URL_UNPOOLED"] ?? "",
    );
    const expectedHost =
      mode === "pooled"
        ? target.endpointHost.replace(".", "-pooler.")
        : target.endpointHost;
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== expectedHost ||
      (url.port !== "" && url.port !== "5432") ||
      decodeURIComponent(url.pathname) !== `/${target.database}` ||
      !url.username ||
      !url.password ||
      url.hash
    ) {
      throw new NeonConfigError(target.environment, "connection");
    }
    // Se parsean las credenciales y nunca se pasa la URL a pg: los parámetros SSL
    // u opciones de la URL no deben anular la verificación de certificados ni
    // inyectar ajustes de arranque.
    for (const [key, value] of url.searchParams) {
      if (!(
        (key === "sslmode" && ["require", "verify-full"].includes(value)) ||
        (key === "channel_binding" && value === "require")
      )) {
        throw new NeonConfigError(target.environment, "ssl-option");
      }
    }
    return {
      host: expectedHost,
      port: 5432,
      database: target.database,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true },
      enableChannelBinding: true,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
      statement_timeout: 10_000,
      application_name: "finanzas-personales-F0-NEON",
    };
  } catch (error) {
    if (error instanceof NeonConfigError) throw error;
    throw new NeonConfigError(target.environment, "connection");
  }
}
