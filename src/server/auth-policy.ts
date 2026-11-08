import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// RF-002/004; CA-002/003/004; I-12. Pure boundary helpers, no browser identity.
export function normalizeEmail(input: unknown): string {
  if (typeof input !== "string" || input.length > 254)
    throw new Error("Entrada inválida");
  const email = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Entrada inválida");
  return email;
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function privateDigest(secret: string, purpose: string, value: string) {
  if (secret.length < 32) throw new Error("Configuración incompleta");
  return createHmac("sha256", secret)
    .update(`${purpose}\0${value}`)
    .digest("hex");
}
export function matchesHash(a: string, b: string | null) {
  return (
    !!b &&
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  );
}
export function newGrant() {
  return randomBytes(32).toString("base64url");
}
export function verifiedOwner(
  data: unknown,
  now = Date.now(),
): { ownerId: string; email: string } | null {
  if (!data || typeof data !== "object") return null;
  const value = data as {
    user?: { id?: unknown; email?: unknown; emailVerified?: unknown };
    session?: { userId?: unknown; expiresAt?: unknown };
  };
  const id = value.user?.id;
  if (
    typeof id !== "string" ||
    !id ||
    id.length > 200 ||
    id.trim() !== id ||
    value.user?.emailVerified !== true ||
    value.session?.userId !== id ||
    typeof value.session?.expiresAt !== "string" ||
    !(Date.parse(value.session.expiresAt) > now)
  )
    return null;
  try {
    return { ownerId: id, email: normalizeEmail(value.user?.email) };
  } catch {
    return null;
  }
}
export function requireSameOrigin(request: Request, origin: string) {
  if (
    request.headers.get("origin") !== origin ||
    new URL(request.url).origin !== origin
  )
    throw new Error("Origen no autorizado");
}
export function authInput(
  path: string,
  value: unknown,
  origin: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Entrada inválida");
  const input = value as Record<string, unknown>;
  if ("owner_id" in input || "ownerId" in input)
    throw new Error("Entrada inválida");
  const fields: Record<string, string[]> = {
    "sign-up/email": ["email", "password", "name"],
    "sign-in/email": ["email", "password", "rememberMe"],
    "sign-in/social": [],
    "sign-out": [],
    "email-otp/send-verification-otp": ["email", "type"],
    "email-otp/verify-email": ["email", "otp"],
    "request-password-reset": ["email"],
    "reset-password": ["newPassword", "token"],
    "revoke-session": ["token"],
    "revoke-other-sessions": [],
  };
  if (!fields[path]) throw new Error("Ruta inválida");
  const output = Object.fromEntries(
    fields[path].filter((key) => key in input).map((key) => [key, input[key]]),
  );
  if (path === "sign-in/social" || path === "sign-up/email") {
    if (path === "sign-in/social" && input.provider !== "google")
      throw new Error("Proveedor inválido");
    if (path === "sign-in/social")
      Object.assign(output, {
        provider: "google",
        callbackURL: `${origin}/auth/callback`,
        errorCallbackURL: `${origin}/auth/sign-in`,
        newUserCallbackURL: `${origin}/auth/callback`,
      });
    else output.callbackURL = `${origin}/auth/callback`;
    const additional = input.additionalData as
      { admissionId?: unknown } | undefined;
    if (additional?.admissionId !== undefined) {
      if (
        typeof additional.admissionId !== "string" ||
        !/^[\w-]{43}$/.test(additional.admissionId)
      )
        throw new Error("Permiso inválido");
      output.additionalData = { admissionId: additional.admissionId };
    }
    if (path === "sign-up/email" && !output.additionalData)
      throw new Error("Invitación requerida");
  }
  if (path === "request-password-reset")
    output.redirectTo = `${origin}/auth/reset-password`;
  if (
    path === "email-otp/send-verification-otp" &&
    input.type !== "email-verification"
  )
    throw new Error("Tipo inválido");
  return output;
}
export async function readLimitedBody(request: Request, limit = 16_384) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Solicitud demasiado grande");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
