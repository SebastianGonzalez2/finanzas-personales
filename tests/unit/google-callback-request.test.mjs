import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { handleGoogleHttp } from "../../src/server/google-http.ts";
import {
  googleClientIpHeader,
  googlePrivateHeaders,
} from "../../src/server/google-http.ts";

const { Headers, Request, Response, URL } = globalThis;
const origin = "https://finanzas.example.test";
const callbackPath = ["callback", "google"];
// Valores sintéticos: ni un código OAuth real ni un secreto.
const oauthQuery =
  "code=4%2F0AsyntheticCode-123&state=synthetic-state-456" +
  "&iss=https%3A%2F%2Faccounts.google.com&scope=openid+email";
const callbackUrl = `${origin}/api/auth/callback/google?${oauthQuery}`;
const cookies =
  "__Secure-better-auth.state=synthetic-state-cookie; other=1; theme=dark";

// En el runtime de Next.js el manejador recibe un NextRequest "enlazado"; el
// constructor nativo de Request (undici) lo rechaza con
// "Cannot read private member #state from an object whose class did not
// declare it". Un objeto que hereda de un Request real sin ser una instancia
// genuina reproduce ese mismo fallo en Node.
function boundNextRequest(url, init) {
  const real = new NextRequest(url, init);
  return Object.create(real, {
    url: { value: real.url },
    method: { value: real.method },
    headers: { value: real.headers },
    signal: { value: real.signal },
    body: { value: null },
  });
}

function capture(extra = {}) {
  const seen = { calls: 0, request: undefined, failures: [] };
  const dependencies = {
    enabled: true,
    origin,
    handler: async (forward) => {
      seen.calls++;
      seen.request = forward;
      return Response.json({ ok: true }, { status: 200 });
    },
    onFailure: (stage) => seen.failures.push(stage),
    ...extra,
  };
  return { seen, dependencies };
}

async function assertForwardedCallback(forward) {
  assert.equal(forward.method, "GET");
  assert.equal(forward.body, null);
  const url = new URL(forward.url);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, "/api/auth/callback/google");
  assert.equal(url.searchParams.get("code"), "4/0AsyntheticCode-123");
  assert.equal(url.searchParams.get("state"), "synthetic-state-456");
  assert.equal(url.searchParams.get("iss"), "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email");
  // La cadena de consulta se conserva byte a byte.
  assert.equal(url.search, `?${oauthQuery}`);
  assert.equal(forward.headers.get("cookie"), cookies);
}

test("callback GET: conserva code, state, iss y cookies con un Request estándar", async () => {
  const { seen, dependencies } = capture();
  const response = await handleGoogleHttp(
    new Request(callbackUrl, {
      headers: { cookie: cookies, "user-agent": "synthetic-agent" },
    }),
    callbackPath,
    dependencies,
  );
  assert.equal(response.status, 200);
  assert.equal(seen.calls, 1);
  assert.deepEqual(seen.failures, []);
  await assertForwardedCallback(seen.request);
  assert.equal(seen.request.headers.get("user-agent"), "synthetic-agent");
  for (const [name, value] of Object.entries(googlePrivateHeaders))
    assert.equal(response.headers.get(name), value);
});

test("callback GET: acepta un NextRequest real", async () => {
  const { seen, dependencies } = capture();
  const response = await handleGoogleHttp(
    new NextRequest(callbackUrl, { headers: { cookie: cookies } }),
    callbackPath,
    dependencies,
  );
  assert.equal(response.status, 200);
  assert.equal(seen.calls, 1);
  assert.deepEqual(seen.failures, []);
  await assertForwardedCallback(seen.request);
});

test("callback GET: acepta el NextRequest enlazado del runtime de Next.js (regresión del 503 request.forward)", async () => {
  const request = boundNextRequest(callbackUrl, {
    headers: { cookie: cookies },
  });
  // La copia directa del objeto recibido es lo que fallaba en producción.
  assert.throws(
    () => new Request(request, { headers: new Headers(request.headers) }),
    { name: "TypeError", message: /private member/ },
  );
  const { seen, dependencies } = capture();
  const response = await handleGoogleHttp(request, callbackPath, dependencies);
  assert.equal(response.status, 200);
  assert.equal(seen.calls, 1);
  assert.deepEqual(seen.failures, []);
  await assertForwardedCallback(seen.request);
});

test("callback GET: la IP del cliente solo se confía en Vercel y se valida", async () => {
  const spoofed = { cookie: cookies, [googleClientIpHeader]: "203.0.113.9" };
  const untrusted = capture();
  await handleGoogleHttp(
    new Request(callbackUrl, { headers: spoofed }),
    callbackPath,
    untrusted.dependencies,
  );
  assert.equal(untrusted.seen.request.headers.get(googleClientIpHeader), null);

  const trusted = capture({ trustVercelClientIp: true });
  await handleGoogleHttp(
    new Request(callbackUrl, { headers: spoofed }),
    callbackPath,
    trusted.dependencies,
  );
  assert.equal(
    trusted.seen.request.headers.get(googleClientIpHeader),
    "203.0.113.9",
  );

  const invalid = capture({ trustVercelClientIp: true });
  await handleGoogleHttp(
    new Request(callbackUrl, {
      headers: { [googleClientIpHeader]: "no-es-una-ip" },
    }),
    callbackPath,
    invalid.dependencies,
  );
  assert.equal(invalid.seen.request.headers.get(googleClientIpHeader), null);
});

test("callback GET: un fallo del manejador responde 503 genérico y registra solo la etapa", async () => {
  const leaks = ["4/0AsyntheticCode-123", "synthetic-state-456", cookies];
  const { seen, dependencies } = capture({
    handler: async () => {
      throw new Error(`fallo ${leaks.join(" ")}`);
    },
  });
  const response = await handleGoogleHttp(
    new Request(callbackUrl, { headers: { cookie: cookies } }),
    callbackPath,
    dependencies,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "No se pudo completar el acceso.",
  });
  assert.deepEqual(seen.failures, ["request.unexpected"]);
  const logged = JSON.stringify(seen.failures);
  for (const secret of leaks) assert.equal(logged.includes(secret), false);
});

test("callback GET: las restricciones existentes siguen vigentes", async () => {
  const { seen, dependencies } = capture();
  // Ruta no permitida o método distinto: 404 sin ejecutar el manejador.
  for (const [method, path] of [
    ["GET", ["sign-in", "social"]],
    ["GET", ["callback", "github"]],
    ["PUT", callbackPath],
  ])
    assert.equal(
      (
        await handleGoogleHttp(
          new Request(callbackUrl, { method }),
          path,
          dependencies,
        )
      ).status,
      404,
    );
  // Acceso deshabilitado: 503 con etapa, sin ejecutar el manejador.
  const disabled = await handleGoogleHttp(
    new Request(callbackUrl),
    callbackPath,
    { ...dependencies, enabled: false },
  );
  assert.equal(disabled.status, 503);
  assert.deepEqual(seen.failures, ["request.disabled"]);
  // Origen configurado inválido: 503 con etapa, sin ejecutar el manejador.
  const badOrigin = await handleGoogleHttp(
    new Request(callbackUrl),
    callbackPath,
    { ...dependencies, origin: "https://example.invalid/path" },
  );
  assert.equal(badOrigin.status, 503);
  assert.deepEqual(seen.failures, ["request.disabled", "request.origin"]);
  assert.equal(seen.calls, 0);
});
