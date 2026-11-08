import "server-only";
import process from "node:process";
import { createNeonAuth } from "@neon/auth/next/server";
import {
  developmentAuthConfig,
  developmentTarget,
} from "./neon-development-config.ts";
import { verifiedOwner } from "./auth-policy.ts";
import { authPool, assertRuntime } from "./auth-database.ts";
import { emailDigest } from "./admission.ts";

export function authEnabled() {
  return process.env.NEON_AUTH_ADMISSION_READY === "true";
}
export function appOrigin() {
  const value = process.env.AUTH_APP_ORIGIN ?? "";
  const url = new URL(value);
  if (
    url.origin !== value ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        !!url.port
      ))
  )
    throw new Error("Origen no configurado");
  return value;
}
export function neonAuth() {
  return createNeonAuth(developmentAuthConfig(process.env, developmentTarget));
}
export async function resolveAuthorizedOwner(request: Request) {
  if (!authEnabled()) return null;
  try {
    // HTTP handler is the tested public SDK escape hatch for the 0.8.2 boolean bug.
    // Always discard caller query/options and require a round trip to Neon.
    const fresh = new Request(
      `${appOrigin()}/api/auth/get-session?disableCookieCache=true`,
      {
        headers: { cookie: request.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(8000),
      },
    );
    const response = await neonAuth()
      .handler()
      .GET(fresh, { params: Promise.resolve({ path: ["get-session"] }) });
    if (!response.ok) return null;
    const identity = verifiedOwner(await response.json());
    if (!identity) return null;
    const client = await authPool("finance").connect();
    try {
      await assertRuntime(client, "finance");
      const result = await client.query(
        "SELECT admission.is_admitted($1,$2) AS admitted",
        [identity.ownerId, emailDigest(identity.email)],
      );
      return result.rows[0]?.admitted === true
        ? { ownerId: identity.ownerId }
        : null;
    } finally {
      client.release();
    }
  } catch {
    return null;
  }
}
