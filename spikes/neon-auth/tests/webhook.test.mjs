import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import test from "node:test";
import { verifyBeforeCreate } from "../webhook.mjs";

const now = 1_800_000_000_000;
function fixture({ age = 0, alg = "EdDSA" } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const kid = randomUUID();
  const jwks = {
    keys: [
      { ...publicKey.export({ format: "jwk" }), kid, alg: "EdDSA", use: "sig" },
    ],
  };
  const event = {
    event_id: randomUUID(),
    event_type: "user.before_create",
    context: { endpoint_id: "ep-fixture" },
    user: { id: randomUUID(), email: "test@example.invalid" },
  };
  const raw = JSON.stringify(event);
  const timestamp = String(now - age);
  const header = Buffer.from(JSON.stringify({ alg, kid })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    `${timestamp}.${Buffer.from(raw).toString("base64url")}`,
  ).toString("base64url");
  const signature = sign(
    null,
    Buffer.from(`${header}.${payload}`),
    privateKey,
  ).toString("base64url");
  const headers = new Headers({
    "x-neon-signature": `${header}..${signature}`,
    "x-neon-signature-kid": kid,
    "x-neon-timestamp": timestamp,
    "x-neon-event-id": event.event_id,
    "x-neon-event-type": event.event_type,
  });
  return {
    raw,
    event,
    headers,
    config: { jwks, endpointId: "ep-fixture", now },
  };
}

test("firma Ed25519 del cuerpo crudo con doble base64url acepta evento de prueba", () => {
  const f = fixture();
  assert.deepEqual(verifyBeforeCreate(f.raw, f.headers, f.config), f.event);
});

for (const [name, change] of [
  [
    "cuerpo alterado",
    (f) => {
      f.raw += " ";
    },
  ],
  [
    "clave desconocida",
    (f) => {
      f.config.jwks = { keys: [] };
    },
  ],
  ["kid discordante", (f) => f.headers.set("x-neon-signature-kid", "otro")],
  [
    "timestamp alterado",
    (f) => f.headers.set("x-neon-timestamp", String(now - 1000)),
  ],
  ["timestamp ausente", (f) => f.headers.delete("x-neon-timestamp")],
  [
    "timestamp no numérico",
    (f) => f.headers.set("x-neon-timestamp", "invalid"),
  ],
  [
    "evento discordante",
    (f) => f.headers.set("x-neon-event-type", "user.created"),
  ],
  ["id discordante", (f) => f.headers.set("x-neon-event-id", randomUUID())],
  [
    "rama distinta",
    (f) => {
      f.config.endpointId = "ep-other";
    },
  ],
  [
    "cuerpo excesivo",
    (f) => {
      f.raw = " ".repeat(32_769);
    },
  ],
]) {
  test(`rechaza ${name}`, () => {
    const f = fixture();
    change(f);
    assert.throws(() => verifyBeforeCreate(f.raw, f.headers, f.config));
  });
}
for (const options of [{ age: 300_001 }, { age: -30_001 }, { alg: "HS256" }]) {
  test(`rechaza antigüedad/futuro/algoritmo: ${JSON.stringify(options)}`, () => {
    const f = fixture(options);
    assert.throws(() => verifyBeforeCreate(f.raw, f.headers, f.config));
  });
}
