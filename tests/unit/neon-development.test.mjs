import assert from "node:assert/strict";
import test from "node:test";
import {
  developmentAuthConfig,
  developmentDatabaseConfig,
  developmentTarget,
} from "../../src/server/neon-development-config.mts";

const target = {
  projectId: "synthetic-project",
  branchId: "br-synthetic-dev",
  branchName: "development",
  database: "neondb",
  endpointHost: "ep-synthetic.sa-east-1.aws.neon.tech",
  authBaseUrl:
    "https://ep-synthetic.neonauth.sa-east-1.aws.neon.tech/neondb/auth",
};
const env = {
  NEON_PROJECT_ID: target.projectId,
  NEON_BRANCH_ID: target.branchId,
  DATABASE_URL:
    "postgresql://fixture:fixture%40only@ep-synthetic-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  DATABASE_URL_UNPOOLED:
    "postgresql://fixture:fixture%40only@ep-synthetic.sa-east-1.aws.neon.tech/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: target.authBaseUrl,
  NEON_AUTH_COOKIE_SECRET: "synthetic-cookie-secret-at-least-32-characters",
};

test("development: endpoint aprobado, TLS verificado, channel binding y decimal sin parsers float", () => {
  const config = developmentDatabaseConfig(env, target);
  assert.equal(config.password, "fixture@only");
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.enableChannelBinding, true);
  assert.equal(config.connectionString, undefined);
  assert.equal(config.host, "ep-synthetic-pooler.sa-east-1.aws.neon.tech");
  assert.equal(
    developmentDatabaseConfig(env, target, "direct").host,
    target.endpointHost,
  );
});

test("development: rechaza proyecto/rama, production, otro endpoint/DB y opciones inseguras antes de red", () => {
  for (const patch of [
    { NEON_PROJECT_ID: "other-project" },
    { NEON_BRANCH_ID: "production" },
    {
      DATABASE_URL: env.DATABASE_URL.replace("ep-synthetic-", "ep-production-"),
    },
    { DATABASE_URL: env.DATABASE_URL.replace("/neondb", "/otherdb") },
    {
      DATABASE_URL: env.DATABASE_URL.replace(
        "sslmode=require",
        "sslmode=disable",
      ),
    },
    {
      DATABASE_URL: `${env.DATABASE_URL}&options=-c%20search_path%3Dneon_auth`,
    },
    { DATABASE_URL: `${env.DATABASE_URL}&sslmode=no-verify` },
    { DATABASE_URL: env.DATABASE_URL_UNPOOLED },
    { DATABASE_URL: "not-a-url" },
  ])
    assert.throws(
      () => developmentDatabaseConfig({ ...env, ...patch }, target),
      (error) =>
        !error.message.includes("fixture") &&
        !error.message.includes("postgresql://"),
    );
  assert.throws(() => developmentDatabaseConfig(env, null));
  assert.throws(() =>
    developmentDatabaseConfig(env, { ...target, branchName: "production" }),
  );
});

test("Auth: exige URL exacta de la rama verificada y secret privado; sin logs SDK", () => {
  assert.equal(developmentAuthConfig(env, target).logLevel, "silent");
  for (const patch of [
    { NEON_AUTH_BASE_URL: `${target.authBaseUrl}/other` },
    { NEON_AUTH_COOKIE_SECRET: "short" },
    { NEON_BRANCH_ID: "production" },
  ])
    assert.throws(() => developmentAuthConfig({ ...env, ...patch }, target));
  assert.throws(() =>
    developmentAuthConfig(env, { ...target, authBaseUrl: null }),
  );
});

test("destino real verificado: rechaza también credenciales de otro proyecto development", () => {
  assert.equal(developmentTarget.projectId, "dry-voice-45959315");
  assert.equal(developmentTarget.branchId, "br-late-feather-b6czfkx0");
  assert.throws(() => developmentDatabaseConfig(env, developmentTarget));
});
