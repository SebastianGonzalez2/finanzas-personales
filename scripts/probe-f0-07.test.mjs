import assert from "node:assert/strict";
import test from "node:test";
import { runPublicProbes } from "./probe-f0-07.mjs";

test("probe offline: seis JSON 200 producen éxito; sin credenciales", async () => {
  const requested = [];
  const result = await runPublicProbes(async (url, options) => {
    requested.push(url);
    assert.ok(options.signal);
    assert.equal(options.headers, undefined);
    return globalThis.Response.json({ data: [] });
  });
  assert.equal(requested.length, 6);
  assert.equal(result.ok, true);
});
test("probe offline: 429 conserva Retry-After y falla", async () => {
  const result = await runPublicProbes(async () =>
    globalThis.Response.json(
      {},
      {
        status: 429,
        headers: { "retry-after": "60" },
      },
    ),
  );
  assert.equal(result.ok, false);
  assert.equal(result.observations[0].retryAfter, "60");
});
test("probe offline: HTML o JSON inválido con HTTP 200 no es éxito", async () => {
  for (const response of [
    () => new globalThis.Response("<html>error</html>"),
    () =>
      new globalThis.Response("{invalid", {
        headers: { "content-type": "application/json" },
      }),
    () => globalThis.Response.json(null),
  ]) {
    const result = await runPublicProbes(async () => response());
    assert.equal(result.ok, false);
  }
});
test("probe offline: error de red falla y no filtra mensaje de transporte", async () => {
  const result = await runPublicProbes(async () => {
    throw Error("diagnóstico-privado-sintético");
  });
  assert.equal(result.ok, false);
  assert.equal(result.observations.length, 6);
  assert.ok(!JSON.stringify(result).includes("diagnóstico-privado-sintético"));
});
