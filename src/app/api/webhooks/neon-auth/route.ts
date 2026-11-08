import { developmentTarget } from "@/server/neon-development-config.ts";
import { readLimitedBody } from "@/server/auth-policy.ts";
import {
  verifyBeforeCreate,
  WebhookValidationError,
} from "@/server/neon-webhook.ts";
import { decideAdmission } from "@/server/admission.ts";
import { privateHeaders } from "@/server/auth-http.ts";
export const runtime = "nodejs";
export const maxDuration = 10;
let cached: { keys: Record<string, unknown>[] } | null = null;
let fetchedAt = 0;
let attemptedAt = 0;
export async function POST(request: Request) {
  let stage = "body";
  try {
    const raw = await readLimitedBody(request, 32_768);
    stage = "headers";
    const kid = request.headers.get("x-neon-signature-kid");
    if (!kid || kid.length > 200) throw new Error("Firma requerida");
    const now = Date.now();
    stage = "jwks";
    if (
      (!cached ||
        now - fetchedAt > 60_000 ||
        !cached.keys.some((k) => k.kid === kid)) &&
      now - attemptedAt > 10_000
    ) {
      attemptedAt = now;
      const response = await fetch(
        `${developmentTarget.authBaseUrl}/.well-known/jwks.json`,
        {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(2000),
        },
      );
      if (!response.ok) throw new Error("Clave no disponible");
      const keys = await response.json();
      if (!Array.isArray(keys?.keys) || keys.keys.length > 10)
        throw new Error("Clave inválida");
      cached = keys;
      fetchedAt = now;
    }
    if (!cached || now - fetchedAt > 300_000)
      throw new Error("Clave no disponible");
    stage = "verification";
    const event = verifyBeforeCreate(raw, request.headers, cached);
    stage = "admission";
    const allowed = await decideAdmission(event, raw);
    return Response.json(
      allowed
        ? { allowed: true }
        : {
            allowed: false,
            error_code: "INVITATION_REQUIRED",
            error_message: "No se pudo autorizar el registro.",
          },
      { headers: privateHeaders },
    );
  } catch (error) {
    // Only local enum values: never log bodies, headers, identities or Error text.
    console.warn("neon_webhook_rejected", {
      stage,
      reason:
        error instanceof WebhookValidationError ? error.reason : "unavailable",
    });
    return Response.json(
      { allowed: false, error_code: "ADMISSION_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
}
