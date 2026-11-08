import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
const { Request, Response } = globalThis;
import { createHmac } from "node:crypto";
import {
  createAuthServer,
  handleAuthProxyRequest,
  NEON_AUTH_SESSION_COOKIE_NAME,
  NEON_AUTH_SESSION_DATA_COOKIE_NAME,
  resolveNeonAuthLogging,
} from "@neon/auth/server";

test("SDK real 0.8.2: signup conserva destino configurado y cuerpo, sin reescribir endpoint", async (t) => {
  const baseUrl =
    "https://ep-falling-queen-b63xbfuk.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth";
  const body = JSON.stringify({
    name: "Synthetic",
    email: "a@example.invalid",
    password: "synthetic-password",
    additionalData: { admissionId: "synthetic-grant" },
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(String(url), `${baseUrl}/sign-up/email`);
    assert.equal(options.method, "POST");
    assert.equal(options.body, body);
    return Response.json({ code: "WEBHOOK_DELIVERY_FAILED" }, { status: 502 });
  });
  const response = await handleAuthProxyRequest({
    baseUrl,
    cookieSecret: "fixture-secret-with-at-least-32-characters",
    path: "sign-up/email",
    log: resolveNeonAuthLogging({ logLevel: "silent" }),
    request: new Request("https://app.example.invalid/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "WEBHOOK_DELIVERY_FAILED");
});

test("SDK real 0.8.2: cookie obsoleta no autoriza al pasar por HTTP sin caché", async (t) => {
  const secret = "fixture-secret-with-at-least-32-characters";
  const session = {
    user: {
      id: "A",
      email: "a@example.invalid",
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    session: {
      id: "session-a",
      userId: "A",
      token: "fixture-only",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  };
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + 60 }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const cached = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
  const cookie = `${NEON_AUTH_SESSION_COOKIE_NAME}=fixture-only; ${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=${cached}`;
  let fetched = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(new URL(url).hostname, "auth.example.invalid");
    assert.equal(new URL(url).searchParams.get("disableCookieCache"), "true");
    fetched++;
    return Response.json(null);
  });
  const auth = createAuthServer({
    baseUrl: "https://auth.example.invalid/auth",
    cookieSecret: secret,
    logLevel: "silent",
    context: () => ({
      getCookies: () => cookie,
      setCookie() {},
      getHeader: () => null,
      getOrigin: () => "https://app.example.invalid",
      getFramework: () => "fixture",
    }),
  });
  assert.equal(
    (await auth.getSession({ query: { disableCookieCache: true } })).data.user
      .id,
    "A",
  );
  assert.equal(fetched, 0);
  for (let i = 0; i < 2; i++) {
    const response = await handleAuthProxyRequest({
      baseUrl: "https://auth.example.invalid/auth",
      cookieSecret: secret,
      path: "get-session",
      log: resolveNeonAuthLogging({ logLevel: "silent" }),
      request: new Request(
        "https://app.example.invalid/api/auth/get-session?disableCookieCache=true",
        { headers: { cookie } },
      ),
    });
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
  }
  assert.equal(fetched, 2);
});
