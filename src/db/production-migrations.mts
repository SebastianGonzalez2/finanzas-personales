import { createHash } from "node:crypto";
import type pg from "pg";
import { readMigrations } from "./migrations.mts";

// Herramienta EXCLUSIVA de Neon production. Espeja el migrador de development
// (migrations.mts) con autorización por manifiesto completo: ninguna migración
// se aplica sin el SHA-256 del manifiesto entero, ordenado y revisado. No
// modifica el migrador de development ni comparte su autorización por migración.
export class ProductionMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionMigrationError";
  }
}

export type ProductionManifestEntry = { version: string; sha256: string };

// Canonicalización estable: una línea "version:sha256" por migración en orden
// lexicográfico de versión. Los nombres de migración y los hashes están
// restringidos (regex del directorio / hex 64), así que la serialización no es
// ambigua y cualquier cambio de contenido u orden cambia el hash del manifiesto.
export function productionManifest(
  migrations: ReadonlyArray<ProductionManifestEntry>,
) {
  const canonical = migrations
    .map(({ version, sha256 }) => `${version}:${sha256}`)
    .join("\n");
  return {
    entries: migrations.map(({ version, sha256 }) => ({ version, sha256 })),
    canonical,
    sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}

export async function readProductionManifest() {
  return productionManifest(await readMigrations());
}

// El llamador debe tener BEGIN abierta en este mismo client y hacer
// COMMIT/ROLLBACK después. Aplica todas las migraciones pendientes autorizadas
// por el manifiesto, o ninguna. Reutiliza el ledger y el advisory lock del
// esquema financiero; idempotente si el historial ya coincide con el disco.
export async function migrateProductionInTransaction(
  client: pg.Client,
  authorizedManifestSha256: string,
) {
  if (
    typeof authorizedManifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(authorizedManifestSha256)
  ) {
    throw new ProductionMigrationError("Falta autorización del manifiesto");
  }
  const migrations = await readMigrations();
  const manifest = productionManifest(migrations);
  if (authorizedManifestSha256 !== manifest.sha256) {
    throw new ProductionMigrationError(
      "La autorización no coincide con el manifiesto actual",
    );
  }
  await client.query("SELECT pg_advisory_xact_lock(705005)");
  const exists = await client.query(
    "SELECT to_regclass('finance_meta.schema_migrations') IS NOT NULL AS present",
  );
  const applied = exists.rows[0].present
    ? (
        await client.query<{ version: string; sha256: string }>(
          "SELECT version, sha256 FROM finance_meta.schema_migrations ORDER BY version",
        )
      ).rows
    : [];
  // Un checksum o versión desconocida en el ledger falla antes de cualquier DDL.
  for (const row of applied) {
    if (
      !migrations.some(
        (migration) =>
          migration.version === row.version && migration.sha256 === row.sha256,
      )
    ) {
      throw new ProductionMigrationError("Historial de migraciones divergente");
    }
  }
  const pending = migrations.filter(
    (migration) => !applied.some((row) => row.version === migration.version),
  );
  const completed: string[] = [];
  for (const migration of pending) {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [migration.version, migration.sha256],
    );
    completed.push(migration.version);
  }
  return {
    manifestSha256: manifest.sha256,
    entries: manifest.entries,
    completed,
    alreadyApplied: applied.length,
  };
}
