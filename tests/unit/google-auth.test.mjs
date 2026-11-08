import test from "node:test";
import assert from "node:assert/strict";
import {
  verifiedGoogleProfile,
  normalizeGoogleEmail,
  authOrigin,
} from "../../src/server/google-policy.ts";
import { handleGoogleHttp } from "../../src/server/google-http.ts";
import { googleDatabaseConfig } from "../../src/server/google-database.ts";
const { Request, Response } = globalThis;
const origin = "http://localhost:3000";
test("Google-only: identidad verificada, normalización conservadora y runtime limitado", () => {
  assert.deepEqual(
    verifiedGoogleProfile({
      sub: "google-A",
      email: " A.B+tag@Gmail.com ",
      email_verified: true,
    }),
    { email: "a.b+tag@gmail.com", subject: "google-A" },
  );
  for (const p of [
    {},
    { sub: "A", email: "a@example.invalid", email_verified: "true" },
    { sub: "", email: "a@example.invalid", email_verified: true },
  ])
    assert.throws(() => verifiedGoogleProfile(p));
  assert.notEqual(
    normalizeGoogleEmail("a.b@gmail.com"),
    normalizeGoogleEmail("ab@gmail.com"),
  );
  assert.throws(() => authOrigin("https://example.invalid/path"));
  const e = {
    NEON_PROJECT_ID: "dry-voice-45959315",
    NEON_BRANCH_ID: "br-late-feather-b6czfkx0",
    GOOGLE_AUTH_DATABASE_URL:
      "postgresql://finanzas_google_auth:fixture@ep-falling-queen-b63xbfuk-pooler.c-2.sa-east-1.aws.neon.tech/neondb",
  };
  assert.equal(googleDatabaseConfig(e, "auth").ssl.rejectUnauthorized, true);
  assert.throws(() =>
    googleDatabaseConfig(
      {
        ...e,
        GOOGLE_AUTH_DATABASE_URL: e.GOOGLE_AUTH_DATABASE_URL.replace(
          "finanzas_google_auth",
          "neondb_owner",
        ),
      },
      "auth",
    ),
  );
});
test("Google-only: rutas antiguas, ID tokens, owner, scopes y redirects del cliente son rechazados", async () => {
  let called = 0;
  const deps = {
    enabled: true,
    origin,
    handler: async (r) => {
      called++;
      const body = await r.json();
      assert.equal(body.callbackURL, `${origin}/account`);
      return Response.json({ ok: true });
    },
  };
  const post = (path, body = {}, requestOrigin = origin) =>
    handleGoogleHttp(
      new Request(`${origin}/api/auth/${path}`, {
        method: "POST",
        headers: { origin: requestOrigin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      path.split("/"),
      deps,
    );
  for (const path of [
    "sign-up/email",
    "sign-in/email",
    "reset-password",
    "email-otp/verify-email",
    "link-social",
    "admin/create-user",
  ])
    assert.equal((await post(path)).status, 404);
  for (const extra of [
    { idToken: { token: "fake" } },
    { owner_id: "B" },
    { scope: ["gmail"] },
    { callbackURL: "https://evil.invalid" },
    { additionalData: { email: "a@b.invalid" } },
  ])
    assert.equal(
      (await post("sign-in/social", { provider: "google", ...extra })).status,
      400,
    );
  assert.equal(
    (await post("sign-in/social", { provider: "github" })).status,
    400,
  );
  assert.equal(
    (
      await post(
        "sign-in/social",
        { provider: "google" },
        "https://evil.invalid",
      )
    ).status,
    403,
  );
  assert.equal(called, 0);
  assert.equal(
    (await post("sign-in/social", { provider: "google" })).status,
    200,
  );
  assert.equal(called, 1);
  const unavailable = { ...deps, enabled: false };
  assert.equal(
    (
      await handleGoogleHttp(
        new Request(`${origin}/api/auth/callback/google`),
        ["callback", "google"],
        unavailable,
      )
    ).status,
    503,
  );
});
