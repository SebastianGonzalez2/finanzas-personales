import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { readMigrations } from "../../src/db/migrations.mts";
import { neonTargets } from "../../src/server/neon-targets.ts";
import {
  ProductionConfigError,
  assertProductionOwnerSession,
  productionDatabaseConfig,
  productionOwnerRole,
  productionTarget,
} from "../../src/server/neon-production-config.mts";
import {
  ProductionMigrationError,
  migrateProductionInTransaction,
  productionManifest,
  readProductionManifest,
} from "../../src/db/production-migrations.mts";
import {
  GoogleAuthProductionError,
  applyGoogleAuthProduction,
  assertGoogleAuthAppliedProduction,
  googleAuthProductionMigration,
} from "../../src/db/google-auth-production.mts";
import {
  GoogleRuntimeProductionError,
  assertProductionRuntimeRoleRow,
  productionRuntimeConnectionUrl,
  productionRuntimeFileLines,
  productionRuntimeRoles,
  provisionGoogleRuntimeProduction,
} from "../../src/server/google-runtime-production.mts";

import {
  assertFinanceRlsCoverage,
  financeRlsCoverageSql,
} from "../../src/server/finance-rls-coverage.mts";

const prod = neonTargets.production;
const dev = neonTargets.development;
const pooledHost = prod.endpointHost.replace(".", "-pooler.");
const owner = productionOwnerRole;
// Contraseña fixture: el detector de secretos F6-02 solo acepta credenciales
// sintéticas de su lista cerrada en el texto versionado.
const ownerUrl = (target, extra = "") =>
  `postgresql://${owner}:fixture@${target.endpointHost}/${target.database}${extra}`;
const productionEnv = {
  NEON_PROJECT_ID: prod.projectId,
  NEON_BRANCH_ID: prod.branchId,
  DATABASE_URL: ownerUrl(prod).replace(prod.endpointHost, pooledHost),
  DATABASE_URL_UNPOOLED: ownerUrl(
    prod,
    "?sslmode=verify-full&channel_binding=require",
  ),
};
const noSecrets = (error) =>
  error instanceof Error &&
  !error.message.includes("fixture") &&
  !error.message.includes("postgresql://") &&
  !error.message.includes(prod.branchId) &&
  !error.message.includes(dev.branchId) &&
  !error.message.includes(prod.endpointHost);

test("destino production fijado en código: proyecto, rama, endpoint y base del ticket", () => {
  assert.equal(productionTarget.projectId, "dry-voice-45959315");
  assert.equal(productionTarget.branchId, "br-wild-mode-b64fgovd");
  assert.equal(
    productionTarget.endpointHost,
    "ep-morning-sunset-b6i4kxdg.c-2.sa-east-1.aws.neon.tech",
  );
  assert.equal(productionTarget.database, "neondb");
  assert.equal(productionTarget.branchName, "production");
  assert.ok(Object.isFrozen(productionTarget));
  assert.notEqual(productionTarget.branchId, dev.branchId);
  assert.notEqual(productionTarget.endpointHost, dev.endpointHost);
  assert.equal(productionOwnerRole, "neondb_owner");
});

test("conexión directa de production: TLS verificado, channel binding y host exacto", () => {
  const config = productionDatabaseConfig(
    productionEnv,
    productionTarget,
    "direct",
  );
  assert.equal(config.host, prod.endpointHost);
  assert.equal(config.port, 5432);
  assert.equal(config.database, prod.database);
  assert.equal(config.user, owner);
  assert.equal(config.password, "fixture");
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.enableChannelBinding, true);
  assert.equal(config.connectionString, undefined);
  const pooled = productionDatabaseConfig(productionEnv, productionTarget);
  assert.equal(pooled.host, pooledHost);
  assert.equal(pooled.ssl.rejectUnauthorized, true);
  assert.equal(pooled.enableChannelBinding, true);
});

test("las variables de entorno no pueden seleccionar otro destino en production", () => {
  const cases = [
    // Sin confirmación de identidad.
    {},
    { NEON_PROJECT_ID: prod.projectId },
    { NEON_BRANCH_ID: prod.branchId },
    // Identidad de development u otra rama.
    { ...productionEnv, NEON_BRANCH_ID: dev.branchId },
    { ...productionEnv, NEON_PROJECT_ID: "other-project" },
    // URL de development u otro host/base.
    {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: ownerUrl(dev, "?sslmode=verify-full"),
    },
    {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: ownerUrl(prod).replace(/\/neondb$/, "/otherdb"),
    },
    {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: ownerUrl(prod).replace(
        prod.endpointHost,
        "ep-arbitrary.c-2.sa-east-1.aws.neon.tech",
      ),
    },
    // Host pooled en modo directo y viceversa.
    {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: ownerUrl(prod).replace(
        prod.endpointHost,
        pooledHost,
      ),
    },
    // Una URL pooled válida no sustituye la URL directa ausente.
    {
      ...productionEnv,
      DATABASE_URL: ownerUrl(prod),
      DATABASE_URL_UNPOOLED: undefined,
    },
    // Debilitar TLS o parámetros arbitrarios.
    {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: ownerUrl(prod, "?sslmode=disable"),
    },
    {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: ownerUrl(
        prod,
        "?options=-c%20search_path%3Dneon_auth",
      ),
    },
    // Production incompleto: nunca hace fallback a development.
    { ...productionEnv, DATABASE_URL_UNPOOLED: undefined },
  ];
  for (const env of cases)
    assert.throws(
      () => productionDatabaseConfig(env, productionTarget, "direct"),
      (error) => {
        assert.ok(error instanceof ProductionConfigError);
        assert.ok(noSecrets(error));
        return true;
      },
    );
  // Un entorno con identidad y URL de development tampoco abre production.
  assert.throws(() =>
    productionDatabaseConfig(
      {
        NEON_PROJECT_ID: dev.projectId,
        NEON_BRANCH_ID: dev.branchId,
        DATABASE_URL_UNPOOLED: ownerUrl(dev),
      },
      productionTarget,
      "direct",
    ),
  );
});

const sessionClient = (rows) => {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      return { rows };
    },
  };
};
const ownerSessionRow = {
  database: prod.database,
  branch: prod.branchId,
  session_user: owner,
  current_user: owner,
};

test("sesión del titular: base, rama y rol propietario exactos", async () => {
  const client = sessionClient([ownerSessionRow]);
  const row = await assertProductionOwnerSession(client);
  assert.deepEqual(row, ownerSessionRow);
  assert.match(client.queries[0], /current_database\(\)/);
  assert.match(client.queries[0], /neon\.branch_id/);
  assert.match(client.queries[0], /session_user/);
});

test("sesión distinta a production o al rol propietario es rechazada sin valores", async () => {
  for (const row of [
    undefined,
    { ...ownerSessionRow, database: "otherdb" },
    { ...ownerSessionRow, branch: dev.branchId },
    { ...ownerSessionRow, branch: null },
    { ...ownerSessionRow, branch: "" },
    { ...ownerSessionRow, session_user: "postgres" },
    { ...ownerSessionRow, current_user: "finanzas_app" },
    {
      ...ownerSessionRow,
      session_user: "finanzas_app",
      current_user: "finanzas_app",
    },
  ]) {
    const client = sessionClient(row ? [row] : []);
    await assert.rejects(assertProductionOwnerSession(client), (error) => {
      assert.ok(error instanceof ProductionConfigError);
      assert.match(error.message, /Sesión no autorizada/);
      assert.ok(noSecrets(error));
      return true;
    });
  }
});

test("manifiesto: 41 migraciones ordenadas con SHA-256 individuales verificados", async () => {
  const manifest = await readProductionManifest();
  assert.equal(manifest.entries.length, 41);
  const versions = manifest.entries.map(({ version }) => version);
  assert.deepEqual(
    [...versions].sort(),
    versions,
    "las entradas deben estar en orden lexicográfico de versión",
  );
  assert.equal(versions[0], "0001_F0-05_initial.sql");
  assert.equal(versions[37], "0038_CA-027_purchase_original_amount.sql");
  assert.equal(versions[38], "0039_FIX-FX_installment_monthly_reference.sql");
  assert.equal(versions[39], "0040_OPS-RESET_financial_reset.sql");
  assert.equal(versions[40], "0041_SIMP-02_expense_installments.sql");
  for (const entry of manifest.entries) {
    assert.match(
      entry.version,
      /^\d{4}_(?:F\d-\d{2}|CA-\d{3}|FIX-FX|OPS-RESET|SIMP-\d{2})_[a-z_]+\.sql$/,
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    // El hash del manifiesto es el del contenido exacto del archivo versionado.
    const sql = await readFile(
      fileURLToPath(
        new URL(`../../src/db/migrations/${entry.version}`, import.meta.url),
      ),
      "utf8",
    );
    assert.equal(entry.sha256, createHash("sha256").update(sql).digest("hex"));
  }
  // El plan no incluye el SQL: solo versiones y hashes.
  for (const entry of manifest.entries) assert.equal(entry.sql, undefined);
});

test("el hash del manifiesto es determinista y sensible a contenido y orden", async () => {
  const manifest = await readProductionManifest();
  assert.equal((await readProductionManifest()).sha256, manifest.sha256);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  // Canonicalización documentada: "version:sha256" por línea en orden.
  const canonical = manifest.entries
    .map(({ version, sha256 }) => `${version}:${sha256}`)
    .join("\n");
  assert.equal(
    createHash("sha256").update(canonical).digest("hex"),
    manifest.sha256,
  );
  const tampered = [...manifest.entries];
  tampered[10] = { ...tampered[10], sha256: "a".repeat(64) };
  assert.notEqual(productionManifest(tampered).sha256, manifest.sha256);
  assert.notEqual(
    productionManifest([...manifest.entries].reverse()).sha256,
    manifest.sha256,
    "reordenar el manifiesto cambia su hash",
  );
  assert.notEqual(
    productionManifest(manifest.entries.slice(0, 37)).sha256,
    manifest.sha256,
    "quitar una migración cambia su hash",
  );
});

const migrationFake = ({ present = false, ledger = [] } = {}) => {
  const calls = { all: [], lock: 0, exists: 0, ddl: [], inserts: [] };
  return {
    calls,
    async query(sql, params) {
      calls.all.push(sql);
      // Anclas estrictas: el SQL de las migraciones (que también contiene
      // advisory locks o inserts internos) no debe clasificarse como query del
      // migrador.
      if (/^SELECT pg_advisory_xact_lock/.test(sql)) {
        calls.lock++;
        return { rows: [] };
      }
      if (
        /^SELECT to_regclass\('finance_meta\.schema_migrations'\)/.test(sql)
      ) {
        calls.exists++;
        return { rows: [{ present }] };
      }
      if (
        /^SELECT version, sha256 FROM finance_meta\.schema_migrations ORDER BY version/.test(
          sql,
        )
      )
        return { rows: ledger };
      if (/^INSERT INTO finance_meta\.schema_migrations/.test(sql)) {
        calls.inserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      calls.ddl.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };
};

test("flujo completo: advisory lock, 41 DDL en orden y ledger con checksums", async () => {
  const manifest = await readProductionManifest();
  const migrations = await readMigrations();
  const client = migrationFake({ present: false });
  const result = await migrateProductionInTransaction(client, manifest.sha256);
  assert.equal(client.calls.lock, 1);
  // El advisory lock y la lectura del ledger preceden a cualquier DDL.
  assert.match(client.calls.all[0], /pg_advisory_xact_lock/);
  assert.match(client.calls.all[1], /to_regclass/);
  assert.deepEqual(
    result.completed,
    manifest.entries.map(({ version }) => version),
  );
  assert.equal(result.alreadyApplied, 0);
  assert.equal(client.calls.ddl.length, 41);
  assert.equal(client.calls.inserts.length, 41);
  client.calls.ddl.forEach((sql, index) => {
    // Cada DDL es exactamente el SQL de la migración en la misma posición del plan.
    assert.equal(sql, migrations[index].sql);
  });
  client.calls.inserts.forEach(([version, sha256], index) => {
    assert.equal(version, manifest.entries[index].version);
    assert.equal(sha256, manifest.entries[index].sha256);
  });
});

test("sin autorización del manifiesto no se toca la base", async () => {
  for (const authorized of [undefined, "", "not-a-hash", "f".repeat(64)]) {
    const client = migrationFake({ present: false });
    await assert.rejects(
      migrateProductionInTransaction(client, authorized),
      (error) => {
        assert.ok(error instanceof ProductionMigrationError);
        assert.ok(
          /Falta autorización del manifiesto|La autorización no coincide/.test(
            error.message,
          ),
        );
        return true;
      },
    );
    assert.deepEqual(client.calls.all, []);
  }
});

test("historial divergente (checksum o versión desconocida) rechaza antes de DDL", async () => {
  const manifest = await readProductionManifest();
  const divergent = [
    { version: manifest.entries[0].version, sha256: "0".repeat(64) },
  ];
  const client = migrationFake({ present: true, ledger: divergent });
  await assert.rejects(
    migrateProductionInTransaction(client, manifest.sha256),
    /Historial de migraciones divergente/,
  );
  assert.equal(client.calls.lock, 1);
  assert.equal(client.calls.ddl.length, 0);
  assert.equal(client.calls.inserts.length, 0);

  const unknown = [
    { version: "9999_CA-999_unknown.sql", sha256: "0".repeat(64) },
  ];
  const client2 = migrationFake({ present: true, ledger: unknown });
  await assert.rejects(
    migrateProductionInTransaction(client2, manifest.sha256),
    /Historial de migraciones divergente/,
  );
  assert.equal(client2.calls.ddl.length, 0);
});

test("idempotencia: historial idéntico al manifiesto no re-aplica nada", async () => {
  const manifest = await readProductionManifest();
  const client = migrationFake({ present: true, ledger: manifest.entries });
  const result = await migrateProductionInTransaction(client, manifest.sha256);
  assert.deepEqual(result.completed, []);
  assert.equal(result.alreadyApplied, 41);
  assert.equal(client.calls.ddl.length, 0);
  assert.equal(client.calls.inserts.length, 0);
  assert.equal(client.calls.lock, 1);
});

test("historial parcial compatible: aplica solo el resto, en orden", async () => {
  const manifest = await readProductionManifest();
  const prefix = manifest.entries.slice(0, 10);
  const client = migrationFake({ present: true, ledger: prefix });
  const result = await migrateProductionInTransaction(client, manifest.sha256);
  assert.deepEqual(
    result.completed,
    manifest.entries.slice(10).map(({ version }) => version),
  );
  assert.equal(result.alreadyApplied, 10);
  assert.equal(
    client.calls.ddl.length,
    manifest.entries.length - prefix.length,
  );
  assert.equal(
    client.calls.inserts.length,
    manifest.entries.length - prefix.length,
  );
  client.calls.inserts.forEach(([version], index) => {
    assert.equal(version, manifest.entries[10 + index].version);
  });
});

test("migración Google Auth: propuesta única con SHA-256 estable", async () => {
  const migration = await googleAuthProductionMigration();
  assert.equal(migration.version, "0003_F0-04_google_only.sql");
  assert.match(migration.sha256, /^[a-f0-9]{64}$/);
  const sql = await readFile(
    fileURLToPath(
      new URL(
        "../../src/db/proposals/0003_F0-04_google_only.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.equal(
    migration.sha256,
    createHash("sha256").update(sql).digest("hex"),
  );
  assert.equal(
    (await googleAuthProductionMigration()).sha256,
    migration.sha256,
  );
});

const manifestLedger = async () =>
  (await readProductionManifest()).entries.map(({ version, sha256 }) => ({
    version,
    sha256,
  }));

const googleFake = ({
  financePresent = true,
  financeLedger,
  appRole = true,
  authPresent = false,
  authLedger = [],
} = {}) => {
  const calls = {
    all: [],
    finance: 0,
    appRole: 0,
    lock: 0,
    authExists: 0,
    authSelects: 0,
    ddl: [],
    inserts: [],
  };
  return {
    calls,
    async query(sql, params) {
      calls.all.push(sql);
      if (/^SELECT pg_advisory_xact_lock/.test(sql)) {
        calls.lock++;
        return { rows: [] };
      }
      if (/^SELECT to_regclass\('finance_meta\.schema_migrations'\)/.test(sql))
        return { rows: [{ present: financePresent }] };
      if (
        /^SELECT version, sha256 FROM finance_meta\.schema_migrations/.test(sql)
      ) {
        calls.finance++;
        return { rows: financeLedger ?? (await manifestLedger()) };
      }
      if (
        /^SELECT 1 AS present FROM pg_roles WHERE rolname='finanzas_app'/.test(
          sql,
        )
      ) {
        calls.appRole++;
        return {
          rows: appRole ? [{ present: 1 }] : [],
          rowCount: appRole ? 1 : 0,
        };
      }
      if (/^SELECT to_regclass\('app_auth_meta\.migrations'\)/.test(sql)) {
        calls.authExists++;
        return { rows: [{ present: authPresent }] };
      }
      if (/^SELECT version,sha256 FROM app_auth_meta\.migrations$/.test(sql)) {
        calls.authSelects++;
        return { rows: authLedger };
      }
      if (/^INSERT INTO app_auth_meta\.migrations/.test(sql)) {
        calls.inserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      calls.ddl.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };
};

test("Google Auth production: aplica el SQL exacto una vez y registra su hash", async () => {
  const migration = await googleAuthProductionMigration();
  const client = googleFake();
  const applied = await applyGoogleAuthProduction(
    client,
    migration,
    migration.sha256,
  );
  assert.equal(applied, true);
  assert.equal(client.calls.finance, 1);
  assert.equal(client.calls.appRole, 1);
  assert.equal(client.calls.lock, 1);
  assert.equal(client.calls.ddl.length, 1);
  assert.equal(client.calls.ddl[0], migration.sql);
  assert.deepEqual(client.calls.inserts, [
    [migration.version, migration.sha256],
  ]);
});

test("Google Auth production: rechaza autorización incorrecta sin tocar la base", async () => {
  const migration = await googleAuthProductionMigration();
  for (const approved of [undefined, "", "f".repeat(64)]) {
    const client = googleFake();
    await assert.rejects(
      applyGoogleAuthProduction(client, migration, approved),
      /requiere el SHA-256 exacto/,
    );
    assert.deepEqual(client.calls.all, []);
  }
});

test("Google Auth production: base financiera incompleta o divergente bloquea el DDL", async () => {
  const migration = await googleAuthProductionMigration();
  const incomplete = (await manifestLedger()).slice(0, 37);
  const client = googleFake({ financeLedger: incomplete });
  await assert.rejects(
    applyGoogleAuthProduction(client, migration, migration.sha256),
    (error) => {
      assert.ok(error instanceof GoogleAuthProductionError);
      assert.match(error.message, /financieras incompletas/);
      return true;
    },
  );
  assert.equal(client.calls.appRole, 0);
  assert.equal(client.calls.ddl.length, 0);

  const divergent = await manifestLedger();
  divergent[5] = { ...divergent[5], sha256: "0".repeat(64) };
  const client2 = googleFake({ financeLedger: divergent });
  await assert.rejects(
    applyGoogleAuthProduction(client2, migration, migration.sha256),
    /financieras divergente/,
  );
  assert.equal(client2.calls.ddl.length, 0);

  const client3 = googleFake({ financePresent: false });
  await assert.rejects(
    applyGoogleAuthProduction(client3, migration, migration.sha256),
    /no está inicializada/,
  );
  assert.equal(client3.calls.ddl.length, 0);
});

test("Google Auth production: exige el rol finanzas_app", async () => {
  const migration = await googleAuthProductionMigration();
  const client = googleFake({ appRole: false });
  await assert.rejects(
    applyGoogleAuthProduction(client, migration, migration.sha256),
    (error) => {
      assert.ok(error instanceof GoogleAuthProductionError);
      assert.match(error.message, /finanzas_app/);
      return true;
    },
  );
  assert.equal(client.calls.lock, 0);
  assert.equal(client.calls.ddl.length, 0);
});

test("Google Auth production: rechaza ejecución duplicada e historial divergente", async () => {
  const migration = await googleAuthProductionMigration();
  const client = googleFake({
    authPresent: true,
    authLedger: [{ version: migration.version, sha256: migration.sha256 }],
  });
  await assert.rejects(
    applyGoogleAuthProduction(client, migration, migration.sha256),
    (error) => {
      assert.ok(error instanceof GoogleAuthProductionError);
      assert.match(error.message, /ya está aplicada/);
      return true;
    },
  );
  assert.equal(client.calls.ddl.length, 0);
  assert.equal(client.calls.inserts.length, 0);

  const client2 = googleFake({
    authPresent: true,
    authLedger: [{ version: migration.version, sha256: "0".repeat(64) }],
  });
  await assert.rejects(
    applyGoogleAuthProduction(client2, migration, migration.sha256),
    /Historial Google divergente/,
  );
  assert.equal(client2.calls.ddl.length, 0);

  const client3 = googleFake({
    authPresent: true,
    authLedger: [
      { version: migration.version, sha256: migration.sha256 },
      { version: "other.sql", sha256: "0".repeat(64) },
    ],
  });
  await assert.rejects(
    applyGoogleAuthProduction(client3, migration, migration.sha256),
    /Historial Google divergente/,
  );
});

test("estado Google aplicado: exige el registro exacto antes del runtime", async () => {
  const migration = await googleAuthProductionMigration();
  const ok = googleFake({
    authPresent: true,
    authLedger: [{ version: migration.version, sha256: migration.sha256 }],
  });
  assert.deepEqual(await assertGoogleAuthAppliedProduction(ok), migration);
  const missing = googleFake({ authPresent: false });
  await assert.rejects(
    assertGoogleAuthAppliedProduction(missing),
    /no está aplicada/,
  );
  const divergent = googleFake({
    authPresent: true,
    authLedger: [{ version: migration.version, sha256: "0".repeat(64) }],
  });
  await assert.rejects(
    assertGoogleAuthAppliedProduction(divergent),
    /Historial Google divergente/,
  );
});

const googleMigration = await googleAuthProductionMigration();
const runtimeFake = ({ authPresent = true, authLedger, roles = {} } = {}) => {
  const calls = { roles: [], format: 0, statements: [] };
  return {
    calls,
    async query(sql, params) {
      if (/^SELECT to_regclass\('app_auth_meta\.migrations'\)/.test(sql))
        return { rows: [{ present: authPresent }] };
      if (/^SELECT version,sha256 FROM app_auth_meta\.migrations$/.test(sql))
        return {
          rows: authLedger ?? [
            {
              version: googleMigration.version,
              sha256: googleMigration.sha256,
            },
          ],
        };
      if (/rolsuper OR rolbypassrls/.test(sql)) {
        calls.roles.push(params?.[0]);
        const key = params?.[0];
        const row =
          key in roles ? roles[key] : { privileged: false, can_login: true };
        return { rows: [row] };
      }
      if (/^SELECT format\('ALTER ROLE/.test(sql)) {
        calls.format++;
        return {
          rows: [
            { statement: `ALTER ROLE ${params[0]} PASSWORD '<generada>'` },
          ],
        };
      }
      if (/^ALTER ROLE/.test(sql)) {
        calls.statements.push(sql);
        return { rows: [] };
      }
      throw new Error("Consulta inesperada en el fake de runtime");
    },
  };
};

test("runtime production: verifica roles sin privilegios y genera dos conexiones distintas", async () => {
  const client = runtimeFake();
  const generated = await provisionGoogleRuntimeProduction(client);
  assert.deepEqual(client.calls.roles, [...productionRuntimeRoles]);
  assert.equal(client.calls.format, 2);
  assert.equal(client.calls.statements.length, 2);
  assert.match(client.calls.statements[0], /ALTER ROLE finanzas_google_auth /);
  assert.match(
    client.calls.statements[1],
    /ALTER ROLE finanzas_google_finance /,
  );
  assert.match(
    generated.authUrl,
    /^postgresql:\/\/finanzas_google_auth:[A-Za-z0-9_-]{43}@ep-morning-sunset-b6i4kxdg-pooler\.c-2\.sa-east-1\.aws\.neon\.tech\/neondb\?sslmode=verify-full&channel_binding=require$/,
  );
  assert.match(
    generated.financeUrl,
    /^postgresql:\/\/finanzas_google_finance:[A-Za-z0-9_-]{43}@ep-morning-sunset-b6i4kxdg-pooler\.c-2\.sa-east-1\.aws\.neon\.tech\/neondb\?sslmode=verify-full&channel_binding=require$/,
  );
  assert.notEqual(generated.authUrl, generated.financeUrl);
  assert.match(generated.secret, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(generated.secret.length, 0);
});

test("runtime production: exige la migración Google aplicada y roles sin privilegios", async () => {
  const missingLedger = runtimeFake({ authPresent: false });
  await assert.rejects(
    provisionGoogleRuntimeProduction(missingLedger),
    /no está aplicada/,
  );
  assert.deepEqual(missingLedger.calls.roles, []);

  const divergent = runtimeFake({
    authLedger: [{ version: googleMigration.version, sha256: "0".repeat(64) }],
  });
  await assert.rejects(
    provisionGoogleRuntimeProduction(divergent),
    /Historial Google divergente/,
  );

  const privileged = runtimeFake({
    roles: { finanzas_google_auth: { privileged: true, can_login: true } },
  });
  await assert.rejects(
    provisionGoogleRuntimeProduction(privileged),
    (error) => {
      assert.ok(error instanceof GoogleRuntimeProductionError);
      assert.match(error.message, /finanzas_google_auth/);
      assert.match(error.message, /privilegios/);
      return true;
    },
  );
  assert.deepEqual(privileged.calls.statements, []);

  const absent = runtimeFake({
    roles: { finanzas_google_finance: undefined },
  });
  await assert.rejects(provisionGoogleRuntimeProduction(absent), (error) => {
    assert.ok(error instanceof GoogleRuntimeProductionError);
    assert.match(error.message, /finanzas_google_finance/);
    return true;
  });

  const noLogin = runtimeFake({
    roles: { finanzas_google_auth: { privileged: false, can_login: false } },
  });
  await assert.rejects(
    provisionGoogleRuntimeProduction(noLogin),
    GoogleRuntimeProductionError,
  );
});

test("fila de rol runtime: sin privilegios y con LOGIN", () => {
  assertProductionRuntimeRoleRow(
    { privileged: false, can_login: true },
    "finanzas_google_auth",
  );
  for (const row of [
    undefined,
    { privileged: true, can_login: true },
    { privileged: false, can_login: false },
    { privileged: null, can_login: true },
    {},
  ])
    assert.throws(
      () => assertProductionRuntimeRoleRow(row, "finanzas_google_finance"),
      GoogleRuntimeProductionError,
    );
});

test("conexión runtime: host pooled de production, TLS verificado y channel binding", () => {
  const url = productionRuntimeConnectionUrl("finanzas_google_auth", "fixture");
  assert.equal(
    url,
    `postgresql://finanzas_google_auth:fixture@${pooledHost}/neondb?sslmode=verify-full&channel_binding=require`,
  );
});

test("archivo privado runtime: valores de production, sin owner ni credenciales del titular", () => {
  const authUrl = productionRuntimeConnectionUrl(
    "finanzas_google_auth",
    "fixture",
  );
  const financeUrl = productionRuntimeConnectionUrl(
    "finanzas_google_finance",
    "fixture",
  );
  const lines = productionRuntimeFileLines({
    authUrl,
    financeUrl,
    secret: "fixture-secret-value-0123456789abcdefghijklmno",
  });
  assert.ok(lines.endsWith("\n"));
  assert.match(lines, /^NEON_PROJECT_ID="dry-voice-45959315"$/m);
  assert.match(lines, /^NEON_BRANCH_ID="br-wild-mode-b64fgovd"$/m);
  assert.match(lines, /^DATABASE_URL=""$/m);
  assert.match(lines, /^DATABASE_URL_UNPOOLED=""$/m);
  assert.match(
    lines,
    /^GOOGLE_AUTH_DATABASE_URL="postgresql:\/\/finanzas_google_auth:/m,
  );
  assert.match(
    lines,
    /^GOOGLE_FINANCE_DATABASE_URL="postgresql:\/\/finanzas_google_finance:/m,
  );
  assert.match(lines, /^GOOGLE_AUTH_SECRET=/m);
  assert.match(lines, /^GOOGLE_AUTH_READY="false"$/m);
  assert.match(lines, /^GOOGLE_AUTH_ORIGIN=""$/m);
  assert.match(lines, /^GOOGLE_CLIENT_ID=""$/m);
  assert.match(lines, /^GOOGLE_CLIENT_SECRET=""$/m);
  assert.ok(!lines.includes(owner));
  assert.ok(!lines.includes(prod.endpointHost));
  assert.ok(!lines.includes("password"));
});

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = (script, args) => {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, [script, ...args], {
        cwd: root,
        encoding: "utf8",
      }),
      stderr: "",
    };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? String(error),
    };
  }
};

test("CLI plan de production: JSON sin conexión, 41 migraciones y hash de manifiesto", async () => {
  const result = run("scripts/migrate-production.mjs", []);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, "plan-only-no-connection");
  assert.equal(plan.environment, "production");
  assert.equal(plan.target.branchId, prod.branchId);
  assert.equal(plan.target.endpointHost, prod.endpointHost);
  assert.equal(plan.migrationsCount, 41);
  assert.equal(plan.migrations.length, 41);
  assert.ok(!result.stdout.includes("CREATE ROLE"));
  assert.match(plan.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.manifestSha256, (await readProductionManifest()).sha256);
  assert.match(
    plan.applyCommand,
    /^npm run db:migrate:production -- --apply [a-f0-9]{64}$/,
  );
});

test("CLI apply con autorización inválida falla con código 2 y sin conexión", () => {
  const result = run("scripts/migrate-production.mjs", [
    "--apply",
    "f".repeat(64),
  ]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Autorización rechazada/);
  const usage = run("scripts/migrate-production.mjs", ["--bogus"]);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Uso:/);
});

test("CLI plan de Google Auth production expone el hash exacto y exige autorización", async () => {
  const plan = run("scripts/prepare-google-auth-production.mjs", []);
  assert.equal(plan.status, 0);
  const info = JSON.parse(plan.stdout);
  assert.equal(info.environment, "production");
  assert.equal(info.branch, prod.branchId);
  assert.equal(info.path, "src/db/proposals/0003_F0-04_google_only.sql");
  assert.equal(info.sha256, (await googleAuthProductionMigration()).sha256);
  const rejected = run("scripts/prepare-google-auth-production.mjs", [
    "--apply",
  ]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /autorización expresa/);
});

test("CLI plan de runtime production no imprime secretos ni ejecuta cambios", () => {
  const plan = run("scripts/provision-google-runtime-production.mjs", []);
  assert.equal(plan.status, 0);
  const info = JSON.parse(plan.stdout);
  assert.equal(info.mode, "plan");
  assert.equal(info.environment, "production");
  assert.equal(info.branch, prod.branchId);
  assert.deepEqual(info.roles, [...productionRuntimeRoles]);
  assert.equal(info.file, ".env.production.google.local");
  assert.equal(info.authReady, false);
  assert.ok(!plan.stdout.includes("postgresql://"));
  assert.ok(plan.stdout.includes("--approved-runtime-credentials"));
});

test("verificación production: el comando npm usa la condición react-server", async () => {
  const { scripts } = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  const command = scripts["auth:google:verify:production"];
  assert.match(command, /^node --conditions=react-server /);
  assert.match(command, /--env-file=\.env\.production\.google\.local /);
  assert.match(command, /scripts\/verify-google-runtime-production\.mjs$/);
});

test("verificación production: arranca con las condiciones del comando npm y falla cerrada sin conexión", () => {
  // Sin la condición react-server la importación de `server-only` aborta antes
  // de llegar a la comprobación. Con ella, sin GOOGLE_AUTH_READY=false el script
  // falla controlado en la primera etapa, sin conectar ni imprimir secretos.
  const env = { ...process.env };
  delete env.GOOGLE_AUTH_READY;
  let result;
  try {
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "scripts/verify-google-runtime-production.mjs",
      ],
      { cwd: root, encoding: "utf8", env, stdio: "pipe" },
    );
  } catch (error) {
    result = error;
  }
  assert.equal(result?.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), {
    verified: false,
    stage: "closed-flag",
    code: "ERR_ASSERTION",
  });
});

test("cobertura RLS: consulta de solo lectura sobre tablas finance con owner_id", () => {
  assert.match(financeRlsCoverageSql, /^SELECT/);
  assert.match(financeRlsCoverageSql, /n\.nspname='finance'/);
  assert.match(financeRlsCoverageSql, /a\.attname='owner_id'/);
  assert.match(financeRlsCoverageSql, /relrowsecurity/);
  assert.match(financeRlsCoverageSql, /relforcerowsecurity/);
  assert.doesNotMatch(
    financeRlsCoverageSql,
    /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|SET)\b/i,
  );
});

test("cobertura RLS: acepta cualquier total mientras todas las tablas estén protegidas", () => {
  assert.equal(
    assertFinanceRlsCoverage({ owner_tables: 61, protected_tables: 61 }),
    61,
  );
  assert.equal(
    assertFinanceRlsCoverage({ owner_tables: 6, protected_tables: 6 }),
    6,
  );
  assert.equal(
    assertFinanceRlsCoverage({ owner_tables: 62, protected_tables: 62 }),
    62,
  );
});

test("cobertura RLS: rechaza tablas sin proteger, ausencia de tablas y filas inválidas", () => {
  for (const row of [
    { owner_tables: 61, protected_tables: 60 },
    { owner_tables: 61, protected_tables: 0 },
    { owner_tables: 6, protected_tables: 61 },
    { owner_tables: 0, protected_tables: 0 },
    { owner_tables: null, protected_tables: null },
    { owner_tables: "61", protected_tables: "61" },
    { owner_tables: 61 },
    {},
    undefined,
    null,
  ])
    assert.throws(
      () => assertFinanceRlsCoverage(row),
      (error) => error.code === "ERR_ASSERTION",
    );
});

test("verificación development: usa la cobertura RLS dinámica y no un total fijo", async () => {
  for (const file of [
    "scripts/verify-google-runtime.mjs",
    "scripts/verify-google-runtime-production.mjs",
  ]) {
    const source = await readFile(
      new URL(`../../${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /assertFinanceRlsCoverage\(coverage\)/);
    assert.match(source, /financeRlsCoverageSql/);
    assert.doesNotMatch(source, /protected_finance|financialRlsTables: \d/);
  }
  const { scripts } = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.match(scripts["auth:google:verify"], /--conditions=react-server/);
});
