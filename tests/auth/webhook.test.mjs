import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
const { Headers } = globalThis;
import { generateKeyPairSync, sign } from "node:crypto";
import {
  verifyBeforeCreate,
  WebhookValidationError,
  webhookRejection,
} from "../../src/server/neon-webhook.ts";
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
  // Real phase-2 failure: a valid signature with production's endpoint must
  // remain rejected. Shared project signing keys do not establish the branch.
  const foreign = signed({
    ...event,
    context: { endpoint_id: "ep-morning-sunset-b6i4kxdg" },
  });
  assert.throws(
    () =>
      verifyBeforeCreate(foreign.raw, foreign.headers, { keys: [key] }, now),
    (error) => {
      assert.ok(error instanceof WebhookValidationError);
      assert.equal(error.reason, "event_envelope");
      const denial = webhookRejection(error);
      assert.equal(denial.status, 200);
      assert.equal(denial.body.allowed, false);
      assert.equal(denial.body.error_code, "AUTH_CONTEXT_MISMATCH");
      assert.deepEqual(error.envelopeChecks, {
        endpointMatches: false,
        typeMatches: true,
        headerTypeMatches: true,
        idPresent: true,
        idMatches: true,
        signedEndpoint: "ep-morning-sunset-b6i4kxdg",
      });
      return true;
    },
  );
  valid.headers.set("x-neon-event-id", "other");
  assert.throws(() =>
    verifyBeforeCreate(valid.raw, valid.headers, { keys: [key] }, now),
  );
});

test("webhook: errores de firma, clave, red y DB nunca se convierten en una admisión", () => {
  for (const error of [
    new WebhookValidationError("signature"),
    new WebhookValidationError("unknown_key"),
    new Error("synthetic database/network error"),
    { reason: "event_envelope" },
  ]) {
    const rejection = webhookRejection(error);
    assert.equal(rejection.status, 503);
    assert.equal(rejection.body.allowed, false);
    assert.equal(rejection.body.error_code, "ADMISSION_UNAVAILABLE");
  }
});
