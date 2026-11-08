import type { ClientConfig } from "pg";

export type DevelopmentTarget = {
  projectId: string;
  branchId: string;
  branchName: "development";
  database: string;
  endpointHost: string;
  authBaseUrl: string | null;
};

export class DevelopmentConfigError extends Error {
  constructor(
    message = "Configuración privada de Neon development incompleta o inválida",
  ) {
    super(message);
    this.name = "DevelopmentConfigError";
  }
}

// Populate only after resolving the project ID and verifying its development
// endpoint through Neon. An environment variable must not select a branch.
export const developmentTarget: DevelopmentTarget = {
  projectId: "dry-voice-45959315",
  branchId: "br-late-feather-b6czfkx0",
  branchName: "development",
  database: "neondb",
  endpointHost: "ep-falling-queen-b63xbfuk.c-2.sa-east-1.aws.neon.tech",
  authBaseUrl:
    "https://ep-falling-queen-b63xbfuk.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth",
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
    if (
      env.NEON_BRANCH_ID !== approved.branchId ||
      env.NEON_PROJECT_ID !== approved.projectId
    ) {
      throw new DevelopmentConfigError();
    }
    const url = new URL(
      env[mode === "pooled" ? "DATABASE_URL" : "DATABASE_URL_UNPOOLED"] ?? "",
    );
    const expectedHost =
      mode === "pooled"
        ? approved.endpointHost.replace(".", "-pooler.")
        : approved.endpointHost;
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== expectedHost ||
      (url.port !== "" && url.port !== "5432") ||
      decodeURIComponent(url.pathname) !== `/${approved.database}` ||
      !url.username ||
      !url.password ||
      url.hash
    )
      throw new DevelopmentConfigError();
    // Parse credentials, never pass the URL to pg: URL SSL/options parameters
    // must not override certificate verification or inject startup settings.
    for (const [key, value] of url.searchParams) {
      if (!(
        (key === "sslmode" && ["require", "verify-full"].includes(value)) ||
        (key === "channel_binding" && value === "require")
      )) {
        throw new DevelopmentConfigError();
      }
    }
    return {
      host: expectedHost,
      port: 5432,
      database: approved.database,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true },
      enableChannelBinding: true,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
      statement_timeout: 10_000,
      application_name: "finanzas-personales-F0-NEON",
    };
  } catch {
    // URL parsers/driver errors may contain credentials; do not preserve causes.
    throw new DevelopmentConfigError();
  }
}

export function developmentAuthConfig(
  env: Environment,
  target: DevelopmentTarget | null,
) {
  const approved = requireDevelopmentTarget(target);
  if (
    !approved.authBaseUrl ||
    env.NEON_AUTH_BASE_URL !== approved.authBaseUrl ||
    env.NEON_BRANCH_ID !== approved.branchId ||
    env.NEON_PROJECT_ID !== approved.projectId ||
    !env.NEON_AUTH_COOKIE_SECRET ||
    env.NEON_AUTH_COOKIE_SECRET.length < 32
  )
    throw new DevelopmentConfigError();
  return {
    baseUrl: approved.authBaseUrl,
    cookies: { secret: env.NEON_AUTH_COOKIE_SECRET, sameSite: "lax" as const },
    logLevel: "silent" as const,
  };
}
