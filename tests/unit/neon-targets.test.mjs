import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGoogleRuntime,
  assertGoogleRuntimeRow,
  googleDatabaseConfig,
} from "../../src/server/google-database.ts";
import {
  NeonConfigError,
  neonTargetFor,
  neonTargets,
  resolveNeonEnvironment,
} from "../../src/server/neon-targets.ts";

const dev = neonTargets.development;
const prod = neonTargets.production;
const pooled = (target) => target.endpointHost.replace(".", "-pooler.");
// La contraseña del fixture debe ser exactamente "fixture": el detector de
// secretos F6-02 escanea el texto versionado (git ls-files) y solo acepta
// credenciales sintéticas de su lista cerrada. La decodificación de
// contraseñas con caracteres especiales (%40) ya se verifica en
// tests/unit/neon-development.test.mjs sobre el mismo núcleo
// neonDatabaseConfig.
const url = (target, role, extra = "") =>
  `postgresql://${role}:fixture@${pooled(target)}/${target.database}${extra}`;
const identity = (target) => ({
  NEON_PROJECT_ID: target.projectId,
  NEON_BRANCH_ID: target.branchId,
});
const runtimeUrls = (target, extra = "") => ({
  GOOGLE_AUTH_DATABASE_URL: url(target, "finanzas_google_auth", extra),
  GOOGLE_FINANCE_DATABASE_URL: url(target, "finanzas_google_finance", extra),
});
const productionEnv = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  ...identity(prod),
  ...runtimeUrls(prod),
};
const developmentEnv = { ...identity(dev), ...runtimeUrls(dev) };

const noSecrets = (error) =>
  error instanceof Error &&
  !error.message.includes("fixture") &&
  !error.message.includes("postgresql://") &&
  !error.message.includes(prod.branchId) &&
  !error.message.includes(dev.branchId);

test("lista cerrada: development y production son destinos distintos y fijos", () => {
  assert.deepEqual(Object.keys(neonTargets).sort(), [
    "development",
    "production",
  ]);
  assert.equal(dev.branchId, "br-late-feather-b6czfkx0");
  assert.equal(
    dev.endpointHost,
    "ep-falling-queen-b63xbfuk.c-2.sa-east-1.aws.neon.tech",
  );
  assert.equal(prod.branchId, "br-wild-mode-b64fgovd");
  assert.equal(
    prod.endpointHost,
    "ep-morning-sunset-b6i4kxdg.c-2.sa-east-1.aws.neon.tech",
  );
  for (const target of [dev, prod]) {
    assert.equal(target.projectId, "dry-voice-45959315");
    assert.equal(target.database, "neondb");
    assert.equal(target.branchName, target.environment);
    assert.ok(Object.isFrozen(target));
  }
  assert.notEqual(dev.branchId, prod.branchId);
  assert.notEqual(dev.endpointHost, prod.endpointHost);
  assert.ok(Object.isFrozen(neonTargets));
});

test("Production selecciona exclusivamente Neon Production", () => {
  assert.equal(resolveNeonEnvironment(productionEnv), "production");
  assert.equal(neonTargetFor(productionEnv), prod);
  for (const kind of ["auth", "finance"]) {
    const config = googleDatabaseConfig(productionEnv, kind);
    assert.equal(config.host, pooled(prod));
    assert.equal(config.database, prod.database);
    assert.equal(config.user, `finanzas_google_${kind}`);
    assert.equal(config.password, "fixture");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.enableChannelBinding, true);
    assert.equal(config.connectionString, undefined);
    assert.notEqual(config.host, pooled(dev));
  }
});

test("Preview, Vercel development y desarrollo local seleccionan exclusivamente Neon Development", () => {
  for (const env of [
    { VERCEL: "1", VERCEL_ENV: "preview", ...developmentEnv },
    { VERCEL: "1", VERCEL_ENV: "development", ...developmentEnv },
    { VERCEL_ENV: "development", ...developmentEnv },
    developmentEnv,
    { VERCEL_ENV: "", ...developmentEnv },
  ]) {
    assert.equal(neonTargetFor(env), dev);
    for (const kind of ["auth", "finance"]) {
      const config = googleDatabaseConfig(env, kind);
      assert.equal(config.host, pooled(dev));
      assert.equal(config.user, `finanzas_google_${kind}`);
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.enableChannelBinding, true);
    }
  }
});

test("los entornos nunca se mezclan: credenciales de production en preview/local y viceversa se rechazan", () => {
  const cases = [
    // Preview o local con rama/endpoint de production.
    {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      ...identity(prod),
      ...runtimeUrls(prod),
    },
    { ...identity(prod), ...runtimeUrls(prod) },
    { ...identity(dev), ...runtimeUrls(prod) },
    { ...identity(prod), ...runtimeUrls(dev) },
    // Production con rama/endpoint de development.
    { ...productionEnv, ...identity(dev) },
    { ...productionEnv, ...runtimeUrls(dev) },
    { ...productionEnv, ...identity(dev), ...runtimeUrls(dev) },
  ];
  for (const env of cases)
    for (const kind of ["auth", "finance"])
      assert.throws(() => googleDatabaseConfig(env, kind), noSecrets);
});

test("un identificador de rama o proyecto incorrecto es rechazado", () => {
  for (const base of [productionEnv, { ...developmentEnv }]) {
    for (const patch of [
      { NEON_BRANCH_ID: "br-arbitrary-branch" },
      { NEON_BRANCH_ID: "" },
      { NEON_BRANCH_ID: undefined },
      { NEON_PROJECT_ID: "other-project" },
      { NEON_PROJECT_ID: undefined },
    ])
      assert.throws(
        () => googleDatabaseConfig({ ...base, ...patch }, "auth"),
        (error) =>
          error instanceof NeonConfigError && error.reason === "identity",
      );
  }
});

test("un endpoint, base o URL incorrectos son rechazados", () => {
  for (const base of [
    { env: productionEnv, target: prod },
    { env: developmentEnv, target: dev },
  ]) {
    const host = pooled(base.target);
    for (const value of [
      url(base.target, "finanzas_google_auth").replace(
        host,
        "ep-other-pooler.c-2.sa-east-1.aws.neon.tech",
      ),
      url(base.target, "finanzas_google_auth").replace(
        host,
        base.target.endpointHost,
      ),
      url(base.target, "finanzas_google_auth").replace("/neondb", "/otherdb"),
      url(base.target, "finanzas_google_auth", "?sslmode=disable"),
      url(base.target, "finanzas_google_auth", "?sslmode=no-verify"),
      url(
        base.target,
        "finanzas_google_auth",
        "?options=-c%20search_path%3Dneon_auth",
      ),
      url(base.target, "finanzas_google_auth").replace("postgresql:", "http:"),
      url(base.target, "finanzas_google_auth").replace(":fixture", ""),
      url(base.target, "finanzas_google_auth").replace(
        "neon.tech",
        "neon.tech:6543",
      ),
      `${url(base.target, "finanzas_google_auth")}#x`,
      "not-a-url",
      "",
    ])
      assert.throws(
        () =>
          googleDatabaseConfig(
            { ...base.env, GOOGLE_AUTH_DATABASE_URL: value },
            "auth",
          ),
        noSecrets,
      );
    assert.throws(() =>
      googleDatabaseConfig(
        { ...base.env, GOOGLE_AUTH_DATABASE_URL: undefined },
        "auth",
      ),
    );
  }
  // sslmode=require/verify-full y channel_binding=require siguen permitidos.
  assert.ok(
    googleDatabaseConfig(
      {
        ...productionEnv,
        ...runtimeUrls(prod, "?sslmode=verify-full&channel_binding=require"),
      },
      "finance",
    ),
  );
});

test("un rol incorrecto es rechazado y los roles auth/finance no se intercambian", () => {
  for (const base of [
    { env: productionEnv, target: prod },
    { env: developmentEnv, target: dev },
  ]) {
    for (const role of [
      "neondb_owner",
      "postgres",
      "finanzas_owner",
      "finanzas_google_other",
    ]) {
      for (const kind of ["auth", "finance"]) {
        const key =
          kind === "auth"
            ? "GOOGLE_AUTH_DATABASE_URL"
            : "GOOGLE_FINANCE_DATABASE_URL";
        assert.throws(
          () =>
            googleDatabaseConfig(
              { ...base.env, [key]: url(base.target, role) },
              kind,
            ),
          noSecrets,
        );
      }
    }
    assert.throws(() =>
      googleDatabaseConfig(
        {
          ...base.env,
          GOOGLE_AUTH_DATABASE_URL: url(base.target, "finanzas_google_finance"),
        },
        "auth",
      ),
    );
    assert.throws(() =>
      googleDatabaseConfig(
        {
          ...base.env,
          GOOGLE_FINANCE_DATABASE_URL: url(base.target, "finanzas_google_auth"),
        },
        "finance",
      ),
    );
  }
});

test("una configuración incompleta de Production nunca hace fallback a Development", () => {
  const production = { VERCEL: "1", VERCEL_ENV: "production" };
  for (const env of [
    production,
    // Solo variables de development en un entorno Production.
    { ...production, ...identity(dev), ...runtimeUrls(dev) },
    // Identidad de production sin URLs, o URLs sin identidad.
    { ...production, ...identity(prod) },
    { ...production, ...runtimeUrls(prod) },
    // DATABASE_URL genérico de development no sustituye las URLs de runtime.
    {
      ...production,
      ...identity(prod),
      DATABASE_URL: url(dev, "finanzas_google_auth"),
    },
  ]) {
    assert.equal(resolveNeonEnvironment(env), "production");
    for (const kind of ["auth", "finance"])
      assert.throws(() => googleDatabaseConfig(env, kind), noSecrets);
  }
  // Si solo falta una conexión de Production, esa falla y la otra sigue en production.
  const partial = { ...productionEnv, GOOGLE_FINANCE_DATABASE_URL: undefined };
  assert.throws(() => googleDatabaseConfig(partial, "finance"), noSecrets);
  assert.equal(googleDatabaseConfig(partial, "auth").host, pooled(prod));
});

test("entornos hospedados ambiguos fallan de forma segura (sin degradar a development)", () => {
  for (const env of [
    { VERCEL: "1", ...developmentEnv },
    { VERCEL: "1", VERCEL_ENV: "", ...developmentEnv },
    { VERCEL: "1", VERCEL_ENV: "staging", ...developmentEnv },
    { VERCEL_ENV: "Production", ...developmentEnv },
    { VERCEL_ENV: "production ", ...developmentEnv },
    // production heredado fuera de Vercel (p. ej. un .env descargado) no abre production.
    { VERCEL_ENV: "production", ...identity(prod), ...runtimeUrls(prod) },
    {
      VERCEL: "0",
      VERCEL_ENV: "production",
      ...identity(prod),
      ...runtimeUrls(prod),
    },
  ]) {
    assert.throws(() => resolveNeonEnvironment(env), NeonConfigError);
    assert.throws(() => googleDatabaseConfig(env, "auth"), noSecrets);
  }
});

const healthy = (kind, target) => ({
  branch: target.branchId,
  database: target.database,
  role: `finanzas_google_${kind}`,
  privileged: false,
  managed_access: false,
  owns: false,
});

test("aislamiento y privilegios: la sesión PostgreSQL se valida contra el destino del entorno", () => {
  for (const target of [dev, prod])
    for (const kind of ["auth", "finance"])
      assert.doesNotThrow(() =>
        assertGoogleRuntimeRow(healthy(kind, target), kind, target),
      );
  for (const kind of ["auth", "finance"]) {
    const row = healthy(kind, prod);
    for (const patch of [
      { branch: dev.branchId },
      { branch: null },
      { branch: "br-arbitrary" },
      { database: "otherdb" },
      { database: undefined },
      {
        role:
          kind === "auth" ? "finanzas_google_finance" : "finanzas_google_auth",
      },
      { role: "neondb_owner" },
      { privileged: true },
      { privileged: null },
      { managed_access: true },
      { owns: true },
      { owns: undefined },
    ])
      assert.throws(
        () => assertGoogleRuntimeRow({ ...row, ...patch }, kind, prod),
        /Runtime no autorizado/,
      );
    assert.throws(
      () => assertGoogleRuntimeRow(undefined, kind, prod),
      /Runtime no autorizado/,
    );
    // Una rama de development no es válida en Production y viceversa.
    assert.throws(() => assertGoogleRuntimeRow(healthy(kind, dev), kind, prod));
    assert.throws(() => assertGoogleRuntimeRow(healthy(kind, prod), kind, dev));
  }
});

test("assertGoogleRuntime consulta la sesión y usa el destino resuelto por el entorno", async () => {
  const fake = (row) => ({
    queries: 0,
    async query(sql) {
      this.queries++;
      assert.match(sql, /neon\.branch_id/);
      assert.match(sql, /current_database\(\)/);
      return { rows: [row] };
    },
  });
  const productionClient = fake(healthy("finance", prod));
  await assertGoogleRuntime(productionClient, "finance", productionEnv);
  assert.equal(productionClient.queries, 1);
  await assertGoogleRuntime(fake(healthy("auth", dev)), "auth", developmentEnv);
  // Production no acepta una sesión conectada a la rama de development.
  await assert.rejects(
    assertGoogleRuntime(
      fake(healthy("finance", dev)),
      "finance",
      productionEnv,
    ),
    /Runtime no autorizado/,
  );
  await assert.rejects(
    assertGoogleRuntime(
      fake(healthy("finance", prod)),
      "finance",
      developmentEnv,
    ),
    /Runtime no autorizado/,
  );
  // Entorno ambiguo: falla antes de consultar la base.
  const untouched = fake(healthy("auth", dev));
  await assert.rejects(
    assertGoogleRuntime(untouched, "auth", { VERCEL: "1" }),
    NeonConfigError,
  );
  assert.equal(untouched.queries, 0);
});
