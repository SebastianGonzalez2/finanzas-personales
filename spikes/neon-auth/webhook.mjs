// Verificación del contrato público de Neon con claves Ed25519.
// https://neon.com/docs/auth/guides/webhooks#signature-verification
// jwks debe proceder SOLO de la URL de la rama configurada por servidor.
import { createPublicKey, verify } from "node:crypto";

export function verifyBeforeCreate(
  rawBody,
  headers,
  { jwks, endpointId, now = Date.now() },
) {
  const invalid = () => {
    throw new Error("Webhook inválido");
  };
  if (typeof rawBody !== "string" || Buffer.byteLength(rawBody) > 32_768)
    invalid();
  const timestamp = headers.get("x-neon-timestamp");
  const kid = headers.get("x-neon-signature-kid");
  const signature = headers.get("x-neon-signature");
  if (
    !timestamp ||
    !/^\d{13}$/.test(timestamp) ||
    !kid ||
    !signature ||
    signature.length > 2048
  )
    invalid();
  const age = now - Number(timestamp);
  if (age > 300_000 || age < -30_000) invalid();
  const parts = signature.split(".");
  if (
    parts.length !== 3 ||
    parts[1] !== "" ||
    !/^[\w-]+$/.test(parts[0]) ||
    !/^[\w-]+$/.test(parts[2])
  )
    invalid();
  const header = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8"),
  );
  if (
    header.alg !== "EdDSA" ||
    header.kid !== kid ||
    header.b64 === false ||
    header.crit
  )
    invalid();
  const key = jwks?.keys?.find(
    (key) =>
      key.kid === kid &&
      key.kty === "OKP" &&
      key.crv === "Ed25519" &&
      (!key.alg || key.alg === "EdDSA") &&
      (!key.use || key.use === "sig"),
  );
  if (!key) invalid();
  const payloadB64 = Buffer.from(rawBody).toString("base64url");
  const signed = `${parts[0]}.${Buffer.from(`${timestamp}.${payloadB64}`).toString("base64url")}`;
  if (
    !verify(
      null,
      Buffer.from(signed),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    )
  )
    invalid();
  const event = JSON.parse(rawBody);
  if (
    !endpointId ||
    event?.context?.endpoint_id !== endpointId ||
    event?.event_type !== "user.before_create" ||
    event.event_type !== headers.get("x-neon-event-type") ||
    !event.event_id ||
    event.event_id !== headers.get("x-neon-event-id")
  )
    invalid();
  return event;
}
