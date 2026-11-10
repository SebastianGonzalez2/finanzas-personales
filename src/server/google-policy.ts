// F0-04 v9.49; RF-001..004, CA-001..005, I-12.
export function normalizeGoogleEmail(value: unknown) {
  if (typeof value !== "string" || value.length > 254)
    throw new Error("Identidad no autorizada");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Identidad no autorizada");
  return email; // Preserve dots, aliases and domains.
}
export function verifiedGoogleProfile(profile: unknown) {
  const p = profile as Record<string, unknown> | null;
  if (
    !p ||
    p.email_verified !== true ||
    typeof p.sub !== "string" ||
    !/^[a-zA-Z0-9_-]{1,255}$/.test(p.sub)
  )
    throw new Error("Identidad no autorizada");
  return { email: normalizeGoogleEmail(p.email), subject: p.sub };
}
export function authOrigin(value: string | undefined) {
  const u = new URL(value ?? "");
  if (
    u.origin !== value ||
    (u.protocol !== "https:" &&
      !(u.protocol === "http:" && u.hostname === "localhost" && !!u.port))
  )
    throw new Error("Origen de Auth inválido");
  return u.origin;
}
export async function limitedJson(request: Request, maxBytes = 4096) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSON requerido");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Cuerpo requerido");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Solicitud grande");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
