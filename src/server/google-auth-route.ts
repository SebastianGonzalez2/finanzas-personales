import {
  GoogleStageError,
  authHandlerStage,
  databaseStage,
  googleStageOf,
  type GoogleStage,
} from "./google-diagnostics.ts";

// Secuencia del manejador de /api/auth con una etapa predefinida por paso.
// Las dependencias se inyectan para poder ejercitar cada fallo sin red real;
// ninguna excepción original se conserva: solo sale un GoogleStageError con un
// código fijo (el límite HTTP responde de forma genérica y registra el código).
type Releasable = { release: () => void };
export type GoogleAuthRouteDependencies<C extends Releasable> = {
  pool: () => { connect: () => Promise<C> };
  assertRuntime: (client: C) => Promise<void>;
  auth: () => { handler: (request: Request) => Promise<Response> };
};

async function step<T>(
  stage: GoogleStage | ((error: unknown) => GoogleStage),
  work: () => T | Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof GoogleStageError) throw error;
    const resolved = typeof stage === "function" ? stage(error) : stage;
    // Los errores de configuración ya etiquetados (p. ej. NeonConfigError) se
    // reconocen por su clase; cualquier otro recibe la etapa indicada.
    throw new GoogleStageError(
      googleStageOf(error, resolved),
      "No se pudo completar el acceso.",
    );
  }
}

export async function googleAuthRoute<C extends Releasable>(
  request: Request,
  dependencies: GoogleAuthRouteDependencies<C>,
) {
  const pool = await step("config.database-unknown", dependencies.pool);
  const client = await step(
    (error) => databaseStage("db.connect", error),
    () => pool.connect(),
  );
  try {
    await step(
      (error) => databaseStage("runtime.query", error),
      () => dependencies.assertRuntime(client),
    );
  } finally {
    client.release();
  }
  const auth = await step("auth.init-failed", dependencies.auth);
  return step(authHandlerStage, () => auth.handler(request));
}
