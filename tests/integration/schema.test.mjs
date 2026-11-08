import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import { schemaContract } from "../support/schema-contract.mjs";

test("F0-05: esquema real reproducible, aislamiento y precisión sin fixtures persistentes", async () => {
  const client = new pg.Client(testDatabaseConfig());
  try {
    await client.connect();
  } catch {
    throw new Error("PostgreSQL desechable no disponible");
  }
  try {
    await client.query("BEGIN");
    // Simulate only the managed schema boundary in disposable CI. No auth rows.
    await client.query(
      'CREATE SCHEMA neon_auth; REVOKE ALL ON SCHEMA neon_auth FROM PUBLIC; CREATE TABLE neon_auth."user" (id text)',
    );
    assert.deepEqual(await migrateInTransaction(client), [
      "0001_F0-05_initial.sql",
    ]);
    assert.deepEqual(await migrateInTransaction(client), []);
    assert.ok((await schemaContract(client)).checks >= 40);
    await client.query("ROLLBACK");
    assert.equal(
      (await client.query("SELECT to_regnamespace('finance') AS name")).rows[0]
        .name,
      null,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
