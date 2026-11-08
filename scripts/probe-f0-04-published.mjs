import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
const { fetch, AbortSignal } = globalThis;

// Phase 1 only: all auth remains closed. No credentials, OTP or invitation used.
const args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== "--origin")
    throw new Error("Se requiere origen publicado autorizado");
  const origin = args[1],
    url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app")
  )
    throw new Error("Origen no autorizado");
  const checks = [];
  for (const [path, method, status] of [
    ["/auth/sign-up", "GET", 200],
    ["/api/account", "GET", 401],
    ["/api/account?owner_id=synthetic-other", "GET", 400],
    ["/api/admission", "POST", 503],
    ["/api/auth/sign-up/email", "POST", 503],
    ["/api/webhooks/neon-auth", "POST", 503],
  ]) {
    const response = await fetch(origin + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      ...(method === "POST"
        ? {
            headers: { "content-type": "application/json", origin },
            body: "{}",
          }
        : {}),
    });
    const passed = response.status === status;
    checks.push({ path: path.split("?")[0], status: response.status, passed });
  }
  console.log(
    JSON.stringify(
      {
        ticket: "F0-04",
        phase: "closed-publication",
        origin,
        checks,
        signupTested: false,
        containsSecrets: false,
      },
      null,
      2,
    ),
  );
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
} catch {
  console.error(
    "No se pudo verificar la publicación cerrada; no se habilitó Auth ni se enviaron credenciales.",
  );
  process.exitCode = 1;
}
