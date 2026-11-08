import assert from "node:assert/strict";
import test from "node:test";
const { Request } = globalThis;
import {
  authInput,
  digest,
  matchesHash,
  newGrant,
  normalizeEmail,
  privateDigest,
  readLimitedBody,
  requireSameOrigin,
  verifiedOwner,
} from "../../src/server/auth-policy.ts";
import { restrictedConfig } from "../../src/server/auth-database.ts";

test("identidad fresca: email verificado, vínculo sesión/usuario y caducidad obligatorios", () => {
  const now = Date.now();
  const valid = {
    user: { id: "A", email: " A@example.invalid ", emailVerified: true },
    session: { userId: "A", expiresAt: new Date(now + 10000).toISOString() },
  };
  assert.deepEqual(verifiedOwner(valid, now), {
    ownerId: "A",
    email: "a@example.invalid",
  });
  for (const invalid of [
    null,
    {},
    { ...valid, user: { ...valid.user, emailVerified: false } },
    { ...valid, session: { ...valid.session, userId: "B" } },
    {
      ...valid,
      session: { ...valid.session, expiresAt: new Date(now).toISOString() },
    },
    { ...valid, user: { ...valid.user, id: " A" } },
    { ...valid, user: { ...valid.user, email: "bad" } },
  ])
    assert.equal(verifiedOwner(invalid, now), null);
});
test("permisos aleatorios y hashes separados; no se normalizan aliases Gmail", () => {
  const secret = "synthetic-secret-at-least-thirty-two-characters";
  assert.equal(normalizeEmail("Name+one@gmail.com"), "name+one@gmail.com");
  assert.notEqual(newGrant(), newGrant());
  assert.match(newGrant(), /^[\w-]{43}$/);
  const hash = privateDigest(secret, "code", "fixture");
  assert.ok(matchesHash(hash, hash));
  assert.ok(!matchesHash(hash, null));
  assert.ok(!matchesHash(hash, digest("fixture")));
  assert.notEqual(hash, privateDigest(secret, "email", "fixture"));
  assert.throws(() => privateDigest("short", "code", "fixture"));
});
test("frontera HTTP rechaza owner, proveedores ajenos, OTP de login y redirects inyectados", () => {
  const origin = "https://app.example.invalid";
  assert.throws(() => authInput("sign-in/email", { owner_id: "B" }, origin));
  assert.throws(() =>
    authInput("sign-in/social", { provider: "github" }, origin),
  );
  assert.throws(() =>
    authInput("email-otp/send-verification-otp", { type: "sign-in" }, origin),
  );
  assert.throws(() =>
    authInput("sign-up/email", { email: "a@example.invalid" }, origin),
  );
  assert.throws(() => authInput("admin/create-user", {}, origin));
  assert.throws(() => authInput("sign-in/email", [], origin));
  const value = authInput(
    "sign-in/social",
    {
      provider: "google",
      callbackURL: "https://evil.invalid",
      scopes: ["gmail"],
      role: "admin",
      additionalData: { admissionId: newGrant(), role: "admin" },
    },
    origin,
  );
  assert.equal(value.callbackURL, `${origin}/auth/callback`);
  assert.equal(value.scopes, undefined);
  assert.equal(value.role, undefined);
  assert.equal(value.additionalData.role, undefined);
  assert.equal(
    authInput(
      "request-password-reset",
      { email: "a@example.invalid", redirectTo: "//evil.invalid" },
      origin,
    ).redirectTo,
    `${origin}/auth/reset-password`,
  );
});
test("CSRF, cuerpos grandes y credenciales propietarias son rechazados", async () => {
  const origin = "https://app.example.invalid";
  assert.throws(() => requireSameOrigin(new Request(origin), origin));
  assert.throws(() =>
    requireSameOrigin(
      new Request(origin, { headers: { origin: "https://evil.invalid" } }),
      origin,
    ),
  );
  requireSameOrigin(new Request(origin, { headers: { origin } }), origin);
  assert.equal(
    await readLimitedBody(
      new Request(origin, { method: "POST", body: "small" }),
      5,
    ),
    "small",
  );
  await assert.rejects(
    readLimitedBody(
      new Request(origin, { method: "POST", body: "too large" }),
      2,
    ),
  );
  const env = {
    NEON_PROJECT_ID: "dry-voice-45959315",
    NEON_BRANCH_ID: "br-late-feather-b6czfkx0",
    DATABASE_RUNTIME_URL:
      "postgres://neondb_owner:fixture-only@ep-falling-queen-b63xbfuk-pooler.c-2.sa-east-1.aws.neon.tech/neondb",
  };
  assert.throws(() => restrictedConfig(env, "finance"));
  env.DATABASE_RUNTIME_URL = env.DATABASE_RUNTIME_URL.replace(
    "neondb_owner",
    "finanzas_runtime",
  );
  assert.equal(restrictedConfig(env, "finance").user, "finanzas_runtime");
  assert.throws(() => restrictedConfig(env, "admission"));
});
