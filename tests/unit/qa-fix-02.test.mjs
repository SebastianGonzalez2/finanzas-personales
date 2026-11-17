/* global Request, Response */
import assert from "node:assert/strict";
import test from "node:test";
import { handleGoogleHttp } from "../../src/server/google-http.ts";
import { handleMovement } from "../../src/server/movements-http.ts";

// QA-FIX-02 (M-01 y M-02). Sin red ni base de datos: manejadores simulados.
const origin = "https://finanzas.example.test";
const json = { "content-type": "application/json", origin };
const validExpense = JSON.stringify({
  kind: "expense",
  currency: "UYU",
  amount: "10.00",
  effectiveOn: "2025-01-10",
  method: "debit",
  concept: "Prueba QA-FIX-02",
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
});

const movement = async (init, authenticate, saves = []) =>
  handleMovement(
    new Request(`${origin}/api/movements`, { method: "POST", ...init }),
    origin,
    async (value) => {
      saves.push(value);
      return { status: "created" };
    },
    authenticate,
  );

test("M-01: sin sesión responde 401 con cuerpo válido, inválido, vacío o sin tipo", async () => {
  for (const [label, init] of [
    ["válido", { headers: json, body: validExpense }],
    ["JSON vacío", { headers: json, body: "{}" }],
    ["inválido", { headers: json, body: "{no-json" }],
    ["vacío", { headers: json }],
    ["sin content-type", { headers: { origin }, body: "{}" }],
  ]) {
    const saves = [];
    const response = await movement(init, async () => false, saves);
    assert.equal(response.status, 401, label);
    assert.equal(saves.length, 0, `${label}: no guarda`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("M-01: Origin y query se verifican antes que la sesión", async () => {
  let asked = 0;
  const authenticate = async () => {
    asked += 1;
    return false;
  };
  const cross = await movement(
    { headers: { ...json, origin: "https://evil.example" }, body: "{}" },
    authenticate,
  );
  assert.equal(cross.status, 403);
  const query = await handleMovement(
    new Request(`${origin}/api/movements?x=1`, {
      method: "POST",
      headers: json,
      body: "{}",
    }),
    origin,
    async () => ({ status: "created" }),
    authenticate,
  );
  assert.equal(query.status, 400);
  assert.equal(asked, 0);
});

test("M-01: con sesión sigue validando el cuerpo (400) y guardando", async () => {
  const bad = await movement({ headers: json, body: "{}" }, async () => true);
  assert.equal(bad.status, 400);
  const saves = [];
  const ok = await movement(
    { headers: json, body: validExpense },
    async () => true,
    saves,
  );
  assert.notEqual(ok.status, 401);
  assert.equal(saves.length, 1);
});

test("M-01: un fallo al verificar la sesión responde 503 y no guarda", async () => {
  const saves = [];
  const response = await movement(
    { headers: json, body: validExpense },
    async () => {
      throw new Error("db");
    },
    saves,
  );
  assert.equal(response.status, 503);
  assert.equal(saves.length, 0);
});

const signOut = async (init, failures = [], calls = []) => {
  const response = await handleGoogleHttp(
    new Request(`${origin}/api/auth/sign-out`, { method: "POST", ...init }),
    ["sign-out"],
    {
      enabled: true,
      origin,
      handler: async (forward) => {
        calls.push(forward);
        return Response.json({ success: true });
      },
      onFailure: (stage) => failures.push(stage),
    },
  );
  return response;
};

test("M-02: cierre de sesión con cuerpo vacío o inválido responde 400 sin error de runtime", async () => {
  for (const [label, init] of [
    ["sin cuerpo", { headers: { origin } }],
    ["sin cuerpo y con content-type", { headers: json }],
    ["no JSON", { headers: json, body: "{no-json" }],
    ["cuerpo no vacío", { headers: json, body: '{"a":1}' }],
    ["arreglo", { headers: json, body: "[]" }],
    [
      "cuerpo grande",
      { headers: json, body: JSON.stringify({ a: "x".repeat(5000) }) },
    ],
  ]) {
    const failures = [];
    const calls = [];
    const response = await signOut(init, failures, calls);
    assert.equal(response.status, 400, label);
    assert.deepEqual(failures, [], `${label}: no se registra error`);
    assert.equal(calls.length, 0, `${label}: no llega a Better Auth`);
  }
});

test("M-02: el cierre de sesión normal sigue funcionando, con y sin cookie", async () => {
  for (const headers of [json, { ...json, cookie: "sid=abc" }]) {
    const failures = [];
    const calls = [];
    const response = await signOut({ headers, body: "{}" }, failures, calls);
    assert.equal(response.status, 200);
    assert.deepEqual(failures, []);
    assert.equal(calls.length, 1);
    assert.equal(await calls[0].text(), "{}");
  }
});
