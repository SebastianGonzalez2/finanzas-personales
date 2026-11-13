import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { testDatabaseConfig } from "../support/test-database.mjs";
import {
  ProductionMigrationError,
  migrateProductionInTransaction,
  readProductionManifest,
} from "../../src/db/production-migrations.mts";
import {
  ProductionConfigError,
  assertProductionOwnerSession,
} from "../../src/server/neon-production-config.mts";

// PostgreSQL real desechable y aislado (nunca Neon ni production). Ejercita el
// flujo completo del migrador de production: 38 DDL reales con ledger de
// checksums, idempotencia, rechazo de autorización inválida y de historial
// divergente. La guarda de identidad de producción debe fallar en esta base:
// la sesión local no es la del titular ni está en la rama de Neon.
test(
  "OPS production: flujo financiero real, idempotencia y rechazos con PostgreSQL desechable",
  { timeout: 120000 },
  async () => {
    const manifest = await readProductionManifest();
    assert.equal(manifest.entries.length, 38);
    const client = new pg.Client(testDatabaseConfig());
    // Nunca imprimir errores de conexión: pueden incluir datos de conexión.
    try {
      await client.connect();
    } catch {
      throw new Error(
        "No se pudo conectar al PostgreSQL desechable de pruebas",
      );
    }
    try {
      await assert.rejects(
        assertProductionOwnerSession(client),
        ProductionConfigError,
      );

      // Primera ejecución autorizada: completa el historial (o lo confirma si
      // la base desechable ya lo tenía).
      await client.query("BEGIN");
      const first = await migrateProductionInTransaction(
        client,
        manifest.sha256,
      );
      assert.equal(first.completed.length + first.alreadyApplied, 38);
      assert.equal(first.manifestSha256, manifest.sha256);
      await client.query("COMMIT");
      const ledger = await client.query(
        "SELECT version, sha256 FROM finance_meta.schema_migrations ORDER BY version",
      );
      assert.deepEqual(
        ledger.rows.map(({ version, sha256 }) => ({ version, sha256 })),
        manifest.entries,
      );

      // Idempotencia real: re-ejecutar no re-aplica nada.
      await client.query("BEGIN");
      const second = await migrateProductionInTransaction(
        client,
        manifest.sha256,
      );
      assert.deepEqual(second.completed, []);
      assert.equal(second.alreadyApplied, 38);
      await client.query("COMMIT");

      // Autorización inválida: rechaza sin ejecutar DDL ni alterar el ledger.
      await client.query("BEGIN");
      const before = await client.query(
        "SELECT count(*)::int AS count FROM finance_meta.schema_migrations",
      );
      await assert.rejects(
        migrateProductionInTransaction(client, "f".repeat(64)),
        (error) => {
          assert.ok(error instanceof ProductionMigrationError);
          assert.match(error.message, /La autorización no coincide/);
          return true;
        },
      );
      const after = await client.query(
        "SELECT count(*)::int AS count FROM finance_meta.schema_migrations",
      );
      assert.equal(after.rows[0].count, before.rows[0].count);
      await client.query("ROLLBACK");

      // Historial divergente: un checksum alterado rechaza antes de cualquier DDL.
      await client.query("BEGIN");
      const firstVersion = (
        await client.query(
          "SELECT version FROM finance_meta.schema_migrations ORDER BY version LIMIT 1",
        )
      ).rows[0].version;
      await client.query(
        "UPDATE finance_meta.schema_migrations SET sha256=$1 WHERE version=$2",
        ["0".repeat(64), firstVersion],
      );
      await assert.rejects(
        migrateProductionInTransaction(client, manifest.sha256),
        /Historial de migraciones divergente/,
      );
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }

    // La base desechable queda como la encontramos, como en el resto de la
    // suite que COMMITea esquema: sin finanzas ni roles residuales.
    const cleaner = new pg.Client(testDatabaseConfig());
    try {
      await cleaner.connect();
      await cleaner.query(
        "DROP SCHEMA IF EXISTS finance, finance_meta CASCADE; DROP ROLE IF EXISTS finanzas_app",
      );
    } finally {
      await cleaner.end();
    }
  },
);
