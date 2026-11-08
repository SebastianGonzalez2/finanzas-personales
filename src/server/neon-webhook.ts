import { createPublicKey, verify } from "node:crypto";
import type { BeforeCreate } from "./admission.ts";

type RejectionReason =
  | "body_size"
  | "timestamp_or_headers"
  | "detached_jws"
  | "protected_header"
  | "unknown_key"
  | "signature"
  | "event_envelope";
export class WebhookValidationError extends Error {
  readonly reason: RejectionReason;
  constructor(reason: RejectionReason) {
    super("Webhook inválido");
    this.reason = reason;
  }
}

// Same signed-wire contract as spikes/neon-auth/webhook.mjs; no JWT acceptance.
export function verifyBeforeCreate(
  rawBody: string,
  headers: Headers,
  jwks: { keys?: Record<string, unknown>[] },
  now = Date.now(),
): BeforeCreate {
  const invalid = (reason: RejectionReason) => {
    throw new WebhookValidationError(reason);
  };
  if (Buffer.byteLength(rawBody) > 32_768) invalid("body_size");
  const timestamp = headers.get("x-neon-timestamp") ?? "";
  const kid = headers.get("x-neon-signature-kid");
  const signature = headers.get("x-neon-signature") ?? "";
  if (
    !/^\d{13}$/.test(timestamp) ||
    !kid ||
    signature.length > 2048 ||
    now - Number(timestamp) > 300_000 ||
    now - Number(timestamp) < -30_000
  )
    invalid("timestamp_or_headers");
  const parts = signature.split(".");
  if (
    parts.length !== 3 ||
    parts[1] !== "" ||
    !/^[\w-]+$/.test(parts[0]) ||
    !/^[\w-]+$/.test(parts[2])
  )
    invalid("detached_jws");
  const header = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8"),
  );
  if (
    header.alg !== "EdDSA" ||
    header.kid !== kid ||
    header.b64 === false ||
    header.crit ||
    header.jku ||
    header.jwk ||
    header.x5u
  )
    invalid("protected_header");
  const key = jwks.keys?.find(
    (k) =>
      k.kid === kid &&
      k.kty === "OKP" &&
      k.crv === "Ed25519" &&
      (!k.alg || k.alg === "EdDSA") &&
      (!k.use || k.use === "sig"),
  );
  if (!key) return invalid("unknown_key");
  const payload = Buffer.from(
    `${timestamp}.${Buffer.from(rawBody).toString("base64url")}`,
  ).toString("base64url");
  if (
    !verify(
      null,
      Buffer.from(`${parts[0]}.${payload}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    )
  )
    invalid("signature");
  const event = JSON.parse(rawBody);
  if (
    event?.context?.endpoint_id !== "ep-falling-queen-b63xbfuk" ||
    event.event_type !== "user.before_create" ||
    event.event_type !== headers.get("x-neon-event-type") ||
    typeof event.event_id !== "string" ||
    event.event_id !== headers.get("x-neon-event-id")
  )
    invalid("event_envelope");
  return event;
}
