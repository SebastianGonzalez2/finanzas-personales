import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

export async function readMigrations() {
  const directory = new URL("./migrations/", import.meta.url);
  const names = (await readdir(directory)).sort();
  if (names.some((name) => !/^\d{4}_F0-05_[a-z_]+\.sql$/.test(name)))
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
export async function migrateInTransaction(client: pg.Client) {
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
  const completed: string[] = [];
  for (const migration of migrations) {
    if (applied.some((row) => row.version === migration.version)) continue;
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [migration.version, migration.sha256],
    );
    completed.push(migration.version);
  }
  return completed;
}
