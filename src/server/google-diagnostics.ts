// OPS: diagnóstico seguro por etapas del acceso con Google.
//
// El navegador siempre recibe una respuesta genérica; el servidor registra
// únicamente un CÓDIGO DE ETAPA tomado de una lista cerrada. Nunca se registran
// mensajes, stacks, causas, URLs de conexión, usuarios, contraseñas, tokens ni
// valores de variables: la clasificación lee propiedades del error (código
// SQLSTATE/Node, nombre, estado) solo para ELEGIR un código predefinido.

// Clases de fallo de base de datos (se eligen por SQLSTATE/código de red).
export const googleDatabaseFailureKinds = [
  "auth-failed", // credenciales/SASL/channel binding rechazados
  "permission", // 42501: el rol no tiene privilegio
  "missing-object", // 42P01/3F000/42703: tabla, esquema o columna ausente
  "timeout", // conexión o consulta excedió el tiempo
  "network", // DNS, rechazo o corte de conexión
  "tls", // certificado o nombre de host TLS inválido
  "other",
] as const;
export type GoogleDatabaseFailureKind =
  (typeof googleDatabaseFailureKinds)[number];

const databaseStagePrefixes = [
  "db.connect", // pool.connect() de la conexión de Auth
  "runtime.query", // consulta de identidad del runtime
  "auth.handler-db", // fallo de base de datos dentro de Better Auth
] as const;
type DatabaseStagePrefix = (typeof databaseStagePrefixes)[number];

const fixedStages = [
  // Solicitud HTTP (google-http.ts)
  "request.disabled", // GOOGLE_AUTH_READY no es exactamente "true"
  "request.origin", // GOOGLE_AUTH_ORIGIN inválido para la política de origen
  "request.body", // JSON ausente, inválido o demasiado grande
  "request.forward", // armado de la solicitud reenviada
  "request.response", // armado de la respuesta
  "request.unexpected",
  // Configuración privada (sin leer ni registrar valores)
  "config.neon-environment", // VERCEL/VERCEL_ENV no identifican un destino válido
  "config.neon-identity-development", // NEON_PROJECT_ID/NEON_BRANCH_ID != destino
  "config.neon-identity-production",
  "config.neon-connection-development", // URL de conexión ausente o fuera del destino
  "config.neon-connection-production",
  "config.neon-ssl-option", // parámetros de URL no permitidos
  "config.neon-target",
  "config.database-role", // el usuario de la URL no es el rol esperado
  "config.database-unknown",
  "config.auth-origin", // GOOGLE_AUTH_ORIGIN inválido al iniciar Better Auth
  "config.auth-secret", // GOOGLE_AUTH_SECRET ausente o menor de 32 caracteres
  "config.auth-client", // GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes
  // Validación de identidad del runtime frente al destino
  "runtime.mismatch-row",
  "runtime.mismatch-branch",
  "runtime.mismatch-database",
  "runtime.mismatch-role",
  "runtime.mismatch-privileged",
  "runtime.mismatch-managed-access",
  "runtime.mismatch-owns",
  // Better Auth
  "auth.init-failed",
  "auth.handler-api-bad-request",
  "auth.handler-api-unauthorized",
  "auth.handler-api-forbidden",
  "auth.handler-api-not-found",
  "auth.handler-api-too-many-requests",
  "auth.handler-api-internal",
  "auth.handler-api-other",
  "auth.handler-failed",
] as const;

export type GoogleStage =
  | (typeof fixedStages)[number]
  | `${DatabaseStagePrefix}-${GoogleDatabaseFailureKind}`;

export const googleStages: readonly GoogleStage[] = Object.freeze([
  ...fixedStages,
  ...databaseStagePrefixes.flatMap((prefix) =>
    googleDatabaseFailureKinds.map(
      (kind): GoogleStage => `${prefix}-${kind}` as GoogleStage,
    ),
  ),
]);
const stageSet: ReadonlySet<string> = new Set(googleStages);

export const isGoogleStage = (value: unknown): value is GoogleStage =>
  typeof value === "string" && stageSet.has(value);

// Error con etapa. El mensaje es fijo y definido por quien lo lanza; nunca
// conserva la causa original.
export class GoogleStageError extends Error {
  readonly stage: GoogleStage;
  constructor(stage: GoogleStage, message: string) {
    super(message);
    this.name = "GoogleStageError";
    this.stage = stage;
  }
}

const networkCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "57P01", // admin_shutdown
  "57P02",
  "57P03", // cannot_connect_now
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
]);
const tlsCodes = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);
const missingObjectCodes = new Set([
  "42P01",
  "3F000",
  "42703",
  "42704",
  "42883",
]);

function errorChain(error: unknown) {
  const chain: Record<string, unknown>[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== "object") break;
    chain.push(current as Record<string, unknown>);
    current = (current as Record<string, unknown>).cause;
  }
  return chain;
}

// Elige una clase predefinida; el mensaje solo se usa para reconocer patrones
// y nunca se devuelve ni se registra.
export function classifyDatabaseError(
  error: unknown,
): GoogleDatabaseFailureKind {
  for (const e of errorChain(error)) {
    const code = typeof e.code === "string" ? e.code : "";
    if (code === "28P01" || code === "28000") return "auth-failed";
    if (code === "42501") return "permission";
    if (missingObjectCodes.has(code)) return "missing-object";
    if (code === "ETIMEDOUT" || code === "57014") return "timeout";
    if (tlsCodes.has(code)) return "tls";
    if (networkCodes.has(code)) return "network";
  }
  for (const e of errorChain(error)) {
    const message = typeof e.message === "string" ? e.message : "";
    if (/SASL|SCRAM|channel binding|password authentication/i.test(message))
      return "auth-failed";
    if (/timeout|timed out/i.test(message)) return "timeout";
    if (/certificate|self[- ]signed|altname/i.test(message)) return "tls";
  }
  return "other";
}

export const databaseStage = (
  prefix: DatabaseStagePrefix,
  error: unknown,
): GoogleStage => `${prefix}-${classifyDatabaseError(error)}` as GoogleStage;

const apiStatusStages: Record<string, GoogleStage> = {
  BAD_REQUEST: "auth.handler-api-bad-request",
  UNAUTHORIZED: "auth.handler-api-unauthorized",
  FORBIDDEN: "auth.handler-api-forbidden",
  NOT_FOUND: "auth.handler-api-not-found",
  TOO_MANY_REQUESTS: "auth.handler-api-too-many-requests",
  INTERNAL_SERVER_ERROR: "auth.handler-api-internal",
};

// Un error lanzado por Better Auth: APIError (estado conocido), un fallo de
// base de datos reconocible por su código, o un fallo genérico.
export function authHandlerStage(error: unknown): GoogleStage {
  const e = error as Record<string, unknown> | null;
  if (
    e &&
    typeof e === "object" &&
    typeof e.status === "string" &&
    typeof e.statusCode === "number"
  )
    return apiStatusStages[e.status] ?? "auth.handler-api-other";
  const kind = classifyDatabaseError(error);
  return kind === "other"
    ? "auth.handler-failed"
    : (`auth.handler-db-${kind}` as GoogleStage);
}

const neonReasons = new Set([
  "environment",
  "identity",
  "connection",
  "ssl-option",
  "target",
]);
function neonConfigStage(error: unknown): GoogleStage | undefined {
  const e = error as Record<string, unknown> | null;
  if (!e || typeof e !== "object" || e.name !== "NeonConfigError") return;
  const production = e.environment === "production";
  const suffix = production ? "production" : "development";
  const reason = typeof e.reason === "string" ? e.reason : "";
  if (!neonReasons.has(reason)) return "config.database-unknown";
  if (reason === "environment") return "config.neon-environment";
  if (reason === "identity") return `config.neon-identity-${suffix}`;
  if (reason === "connection") return `config.neon-connection-${suffix}`;
  if (reason === "ssl-option") return "config.neon-ssl-option";
  return "config.neon-target";
}

// Etapa de un error ya etiquetado (GoogleStageError o NeonConfigError), o la
// etapa de respaldo indicada por quien llama.
export function googleStageOf(
  error: unknown,
  fallback: GoogleStage,
): GoogleStage {
  const e = error as Record<string, unknown> | null;
  if (e && typeof e === "object" && e.name === "GoogleStageError")
    return isGoogleStage(e.stage) ? e.stage : fallback;
  return neonConfigStage(error) ?? fallback;
}

// Único registro del módulo. Solo emite una cadena fija con un código de la
// lista cerrada; cualquier otro valor se reduce a "request.unexpected".
export function logGoogleStage(
  stage: GoogleStage,
  sink: (line: string) => void = (line) => console.error(line),
) {
  const code = isGoogleStage(stage) ? stage : "request.unexpected";
  try {
    sink(`[google-auth] stage=${code}`);
  } catch {
    // El diagnóstico nunca debe alterar la respuesta.
  }
}
