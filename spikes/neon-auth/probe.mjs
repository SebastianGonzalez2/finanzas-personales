// Sonda opcional de solo lectura. No registra usuarios ni manda correos.
import { createAuthClient } from "@neon/auth";
import { developmentTarget } from "../../src/server/neon-development-config.mts";

const value = process.env.NEON_AUTH_BASE_URL;
if (!value) {
  console.error(
    "PENDIENTE: configurar NEON_AUTH_BASE_URL de la rama de prueba en .env.local.",
  );
  process.exitCode = 2;
} else {
  try {
    const url = new URL(value);
    if (
      value !== developmentTarget.authBaseUrl ||
      process.env.NEON_PROJECT_ID !== developmentTarget.projectId ||
      process.env.NEON_BRANCH_ID !== developmentTarget.branchId ||
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".neon.tech") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("URL de prueba inválida");
    }
    const client = createAuthClient(url.href.replace(/\/$/, ""));
    const { data, error } = await client.getSession({
      fetchOptions: { timeout: 10_000 },
    });
    if (error || data?.user) throw new Error("Sesión anónima inesperada");
    const response = await fetch(
      `${url.href.replace(/\/$/, "")}/.well-known/jwks.json`,
      {
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("JWKS no disponible");
    const jwks = await response.json();
    const keyAvailable =
      jwks.keys?.some((key) => key.kty === "OKP" && key.crv === "Ed25519") ===
      true;
    console.log(
      JSON.stringify({
        anonymousSessionEmpty: true,
        jwksEd25519KeyAvailable: keyAvailable,
      }),
    );
    if (!keyAvailable) process.exitCode = 1;
  } catch {
    // No volcar errores del SDK, URLs, cookies ni respuestas con datos de identidad.
    console.error(
      "FALLÓ: revisar conexión/configuración de la rama de prueba; sin detalles sensibles.",
    );
    process.exitCode = 1;
  }
}
