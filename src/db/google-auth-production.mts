import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type pg from "pg";
import { readMigrations } from "./migrations.mts";
import { productionManifest } from "./production-migrations.mts";

// Herramienta EXCLUSIVA de Neon production para el SQL de Google Auth
// (0003_F0-04_google_only.sql). La propuesta SQL es la misma, única y
// versionada del repositorio; el mecanismo es production-only y rechaza
// ejecuciones duplicadas o historiales divergentes.
export class GoogleAuthProductionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthProductionError";
  }
}

const version = "0003_F0-04_google_only.sql";

export async function googleAuthProductionMigration() {
  const sql = await readFile(
    new URL(`./proposals/${version}`, import.meta.url),
    "utf8",
  );
  return {
    version,
    sql,
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}

// La base financiera de production debe estar completa e idéntica al
// repositorio antes de tocar el esquema de autenticación. Un ledger ausente,
// incompleto o con checksum distinto falla antes del DDL de Google.
export async function assertProductionFinanceMigrationsComplete(
  client: pg.Client,
) {
  const migrations = await readMigrations();
  const manifest = productionManifest(migrations);
  const exists = await client.query(
    "SELECT to_regclass('finance_meta.schema_migrations') IS NOT NULL AS present",
  );
  if (!exists.rows[0].present) {
    throw new GoogleAuthProductionError(
      "La base financiera no está inicializada en production",
    );
  }
  const rows = (
    await client.query<{ version: string; sha256: string }>(
      "SELECT version, sha256 FROM finance_meta.schema_migrations ORDER BY version",
    )
  ).rows;
  if (rows.length !== migrations.length) {
    throw new GoogleAuthProductionError(
      "Migraciones financieras incompletas en production",
    );
  }
  for (const row of rows) {
    if (
      !migrations.some(
        (migration) =>
          migration.version === row.version && migration.sha256 === row.sha256,
      )
    ) {
      throw new GoogleAuthProductionError(
        "Historial de migraciones financieras divergente",
      );
    }
  }
  return manifest.sha256;
}

// El llamador debe tener BEGIN abierta en este mismo client y hacer
// COMMIT/ROLLBACK después. Verifica destino (sesión) por separado con
// assertProductionOwnerSession; aquí exige autorización del hash exacto del
// SQL, comprueba finanzas y finanzas_app, toma el advisory lock, rechaza
// duplicadas/divergentes y registra el hash en app_auth_meta.migrations.
export async function applyGoogleAuthProduction(
  client: pg.Client,
  migration: { version: string; sql: string; sha256: string },
  approvedSha256: string,
) {
  if (approvedSha256 !== migration.sha256) {
    throw new GoogleAuthProductionError(
      "Autorización rechazada: requiere el SHA-256 exacto del SQL vigente",
    );
  }
  await assertProductionFinanceMigrationsComplete(client);
  const finanzasApp = await client.query(
    "SELECT 1 AS present FROM pg_roles WHERE rolname='finanzas_app'",
  );
  if (finanzasApp.rowCount !== 1) {
    throw new GoogleAuthProductionError(
      "El rol finanzas_app no existe en production",
    );
  }
  await client.query("SELECT pg_advisory_xact_lock(704049)");
  const exists = (
    await client.query(
      "SELECT to_regclass('app_auth_meta.migrations') IS NOT NULL AS present",
    )
  ).rows[0].present;
  if (exists) {
    const rows = (
      await client.query("SELECT version,sha256 FROM app_auth_meta.migrations")
    ).rows;
    if (
      rows.length === 1 &&
      rows[0].version === migration.version &&
      rows[0].sha256 === migration.sha256
    ) {
      throw new GoogleAuthProductionError(
        "La migración Google ya está aplicada en production; no se re-ejecuta",
      );
    }
    throw new GoogleAuthProductionError("Historial Google divergente");
  }
  await client.query(migration.sql);
  await client.query(
    "INSERT INTO app_auth_meta.migrations(version,sha256) VALUES($1,$2)",
    [migration.version, migration.sha256],
  );
  return true;
}

// Precondición de las herramientas posteriores (runtime): la migración Google
// debe estar registrada en production con el hash exacto del SQL vigente.
export async function assertGoogleAuthAppliedProduction(client: pg.Client) {
  const migration = await googleAuthProductionMigration();
  const exists = (
    await client.query(
      "SELECT to_regclass('app_auth_meta.migrations') IS NOT NULL AS present",
    )
  ).rows[0].present;
  if (!exists) {
    throw new GoogleAuthProductionError(
      "La migración Google no está aplicada en production",
    );
  }
  const rows = (
    await client.query("SELECT version,sha256 FROM app_auth_meta.migrations")
  ).rows;
  if (
    rows.length !== 1 ||
    rows[0].version !== migration.version ||
    rows[0].sha256 !== migration.sha256
  ) {
    throw new GoogleAuthProductionError("Historial Google divergente");
  }
  return migration;
}
