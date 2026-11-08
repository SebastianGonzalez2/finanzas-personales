import assert from "node:assert/strict";
import test from "node:test";
import { testDatabaseConfig } from "../support/test-database.mjs";

const url = "postgresql://f0_test:f0_test@127.0.0.1:55432/finanzas_test";
test("la integración falla cerrada si falta confirmación o URL", () => {
  assert.throws(() => testDatabaseConfig({}));
  assert.throws(() => testDatabaseConfig({ TEST_DATABASE_URL: url }));
  assert.throws(() =>
    testDatabaseConfig({ TEST_DATABASE_CONFIRM: "isolated-local-test" }),
  );
});
test("rechaza destinos remotos, nombres reales, parámetros y credenciales diferentes", () => {
  for (const value of [
    url.replace("127.0.0.1", "example.neon.tech"),
    url.replace("finanzas_test", "production"),
    `${url}?sslmode=require`,
    url.replace(":55432", ":5432"),
    url.replace("f0_test:f0_test", "owner:secret"),
  ]) {
    assert.throws(() =>
      testDatabaseConfig({
        TEST_DATABASE_CONFIRM: "isolated-local-test",
        TEST_DATABASE_URL: value,
      }),
    );
  }
});
test("acepta solo el servicio desechable y no utiliza DATABASE_URL", () => {
  const config = testDatabaseConfig({
    TEST_DATABASE_CONFIRM: "isolated-local-test",
    TEST_DATABASE_URL: url,
    DATABASE_URL: "ignored",
  });
  assert.equal(config.connectionString, url);
  assert.equal(config.ssl, false);
});
