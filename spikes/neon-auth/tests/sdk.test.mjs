import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { createAuthClient } from "@neon/auth";
import {
  createAuthServer,
  handleAuthProxyRequest,
  resolveNeonAuthLogging,
  NEON_AUTH_SESSION_COOKIE_NAME,
  NEON_AUTH_SESSION_DATA_COOKIE_NAME,
} from "@neon/auth/server";

test("SDK real serializa Google additionalData; no prueba recepción de metadatos por Neon", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).host, "auth.example.invalid");
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({
      url: "https://auth.example.invalid/authorize",
      redirect: false,
    });
  });
  const client = createAuthClient("https://auth.example.invalid/auth");
  const { error } = await client.signIn.social({
    provider: "google",
    callbackURL: "/auth/callback",
    additionalData: { admissionId: "fixture-only" },
  });
  assert.equal(error, null);
  assert.equal(new URL(requests[0].url).pathname, "/auth/sign-in/social");
  assert.deepEqual(requests[0].body.additionalData, {
    admissionId: "fixture-only",
  });
});

test("SDK real construye rutas email, verificación OTP y reset con transporte simulado", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).host, "auth.example.invalid");
    requests.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
    return Response.json({ status: true });
  });
  const client = createAuthClient("https://auth.example.invalid/auth");
  await client.signUp.email({
    email: "test@example.invalid",
    name: "Prueba",
    password: "fixture-only",
  });
  await client.emailOtp.sendVerificationOtp({
    email: "test@example.invalid",
    type: "email-verification",
  });
  await client.emailOtp.verifyEmail({
    email: "test@example.invalid",
    otp: "000000",
  });
  await client.requestPasswordReset({
    email: "test@example.invalid",
    redirectTo: "/auth/reset-password",
  });
  await client.resetPassword({
    newPassword: "fixture-only-new",
    token: "fixture-only",
  });
  assert.deepEqual(
    requests.map((r) => r.path),
    [
      "/auth/sign-up/email",
      "/auth/email-otp/send-verification-otp",
      "/auth/email-otp/verify-email",
      "/auth/request-password-reset",
      "/auth/reset-password",
    ],
  );
  assert.equal(requests[1].body.type, "email-verification");
  assert.equal(requests[3].body.redirectTo, "/auth/reset-password");
});

// Reproducción de un límite de 0.8.2: el wrapper compara con string 'true',
// aunque los tipos públicos de Better Auth aceptan boolean. No usar este
// caché como autorización financiera ni como prueba de revocación inmediata.
test("SDK 0.8.2: boolean conserva caché; string y proxy HTTP fuerzan upstream", async (t) => {
  const secret = randomBytes(32).toString("hex");
  const date = new Date().toISOString();
  const session = {
    user: {
      id: "owner-fixture",
      email: "test@example.invalid",
      name: "Prueba",
      emailVerified: true,
      createdAt: date,
      updatedAt: date,
    },
    session: {
      id: "session-fixture",
      userId: "owner-fixture",
      token: "fixture-only",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: date,
      updatedAt: date,
    },
  };
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + 60 }),
  ).toString("base64url");
  const signed = `${header}.${payload}`;
  const cookie = `${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
  let fetched = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(new URL(url).host, "auth.example.invalid");
    assert.equal(new URL(url).searchParams.get("disableCookieCache"), "true");
    fetched += 1;
    return Response.json(null);
  });
  const auth = createAuthServer({
    baseUrl: "https://auth.example.invalid/auth",
    cookieSecret: secret,
    logLevel: "silent",
    context: () => ({
      getCookies: () =>
        `${NEON_AUTH_SESSION_COOKIE_NAME}=fixture-only; ${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=${cookie}`,
      setCookie() {},
      getHeader: () => null,
      getOrigin: () => "https://app.example.invalid",
      getFramework: () => "f0-04-test",
    }),
  });
  assert.equal(
    (await auth.getSession({ query: { disableCookieCache: true } })).data.user
      .id,
    "owner-fixture",
  );
  assert.equal(fetched, 0);
  assert.equal(
    (await auth.getSession({ query: { disableCookieCache: "true" } })).data,
    null,
  );
  assert.equal(fetched, 1);
  // Exercise the SDK HTTP proxy used by the Next handler, with the same cache.
  // Both lookups must consult upstream: a revoked session stays anonymous.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await handleAuthProxyRequest({
      baseUrl: "https://auth.example.invalid/auth",
      cookieSecret: secret,
      sameSite: "lax",
      path: "get-session",
      log: resolveNeonAuthLogging({ logLevel: "silent" }),
      request: new Request(
        "https://app.example.invalid/api/auth/get-session?disableCookieCache=true",
        {
          headers: {
            cookie: `${NEON_AUTH_SESSION_COOKIE_NAME}=fixture-only; ${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=${cookie}`,
          },
        },
      ),
    });
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
  }
  assert.equal(fetched, 3);
});
