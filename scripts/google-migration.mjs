import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { URL } from "node:url";
export async function googleMigration() {
  const version = "0003_F0-04_google_only.sql";
  const sql = await readFile(
    new URL(`../src/db/proposals/${version}`, import.meta.url),
    "utf8",
  );
  return {
    version,
    sql,
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}
export async function applyGoogleMigration(client, migration) {
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
      rows.length !== 1 ||
      rows[0].version !== migration.version ||
      rows[0].sha256 !== migration.sha256
    )
      throw new Error("Historial Google divergente");
    return false;
  }
  await client.query(migration.sql);
  await client.query(
    "INSERT INTO app_auth_meta.migrations(version,sha256) VALUES($1,$2)",
    [migration.version, migration.sha256],
  );
  return true;
}
