import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
const { Headers } = globalThis;
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyBeforeCreate } from "../../src/server/neon-webhook.ts";
import { newGrant } from "../../src/server/auth-policy.ts";

test("webhook: firma Ed25519, cuerpo crudo, rama, ID, tipo y ventana temporal", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = {
    ...publicKey.export({ format: "jwk" }),
    kid: "synthetic",
    use: "sig",
    alg: "EdDSA",
  };
  const now = Date.now();
  const event = {
    event_type: "user.before_create",
    event_id: "fixture-event",
    context: { endpoint_id: "ep-falling-queen-b63xbfuk" },
    user: { id: "A", email: "a@example.invalid" },
    event_data: {
      auth_provider: "credential",
      signup_metadata: { admissionId: newGrant() },
    },
  };
  function signed(input = event, timestamp = now) {
    const raw = JSON.stringify(input);
    const header = Buffer.from(
      JSON.stringify({ alg: "EdDSA", kid: key.kid }),
    ).toString("base64url");
    const payload = Buffer.from(
      `${timestamp}.${Buffer.from(raw).toString("base64url")}`,
    ).toString("base64url");
    const signature = sign(
      null,
      Buffer.from(`${header}.${payload}`),
      privateKey,
    ).toString("base64url");
    const headers = new Headers({
      "x-neon-timestamp": String(timestamp),
      "x-neon-signature-kid": key.kid,
      "x-neon-signature": `${header}..${signature}`,
      "x-neon-event-id": input.event_id,
      "x-neon-event-type": input.event_type,
    });
    return { raw, headers };
  }
  const valid = signed();
  assert.deepEqual(
    verifyBeforeCreate(valid.raw, valid.headers, { keys: [key] }, now),
    event,
  );
  for (const sample of [
    signed(event, now - 300001),
    signed(event, now + 30001),
    signed({ ...event, context: { endpoint_id: "other" } }),
    signed({ ...event, event_type: "user.created" }),
  ])
    assert.throws(() =>
      verifyBeforeCreate(sample.raw, sample.headers, { keys: [key] }, now),
    );
  assert.throws(() =>
    verifyBeforeCreate(valid.raw + " ", valid.headers, { keys: [key] }, now),
  );
  assert.throws(() =>
    verifyBeforeCreate(valid.raw, valid.headers, { keys: [] }, now),
  );
  valid.headers.set("x-neon-event-id", "other");
  assert.throws(() =>
    verifyBeforeCreate(valid.raw, valid.headers, { keys: [key] }, now),
  );
});
