import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

export async function readMigrations() {
  const directory = new URL("./migrations/", import.meta.url);
  const names = (await readdir(directory)).sort();
  if (
    names.some(
      (name) =>
        !/^\d{4}_(?:F\d-\d{2}|CA-\d{3}|FIX-FX|OPS-RESET)_[a-z_]+\.sql$/.test(
          name,
        ),
    )
  )
    throw new Error("Nombre de migración inesperado");
  return Promise.all(
    names.map(async (version) => {
      const sql = await readFile(new URL(version, directory), "utf8");
      return {
        version,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

// Caller must hold a transaction on this same client. Never accepts arbitrary SQL.
export async function migrateInTransaction(
  client: pg.Client,
  authorizedSha256?: string,
) {
  await client.query("SELECT pg_advisory_xact_lock(705005)");
  const migrations = await readMigrations();
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
  // A checksum or unknown history mismatch fails before any DDL.
  for (const row of applied) {
    if (
      !migrations.some(
        (migration) =>
          migration.version === row.version && migration.sha256 === row.sha256,
      )
    )
      throw new Error("Historial de migraciones divergente");
  }
  const pending = migrations.filter(
    (migration) => !applied.some((row) => row.version === migration.version),
  );
  if (
    authorizedSha256 !== undefined &&
    pending.length > 0 &&
    (pending.length !== 1 || pending[0].sha256 !== authorizedSha256)
  )
    throw new Error("La migración pendiente no coincide con el SQL autorizado");

  const completed: string[] = [];
  for (const migration of pending) {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [migration.version, migration.sha256],
    );
    completed.push(migration.version);
  }
  return completed;
}
