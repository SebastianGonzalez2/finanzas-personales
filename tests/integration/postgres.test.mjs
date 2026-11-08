import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("PostgreSQL real: NUMERIC exacto, rollback y unicidad por titular", async () => {
  const client = new pg.Client(testDatabaseConfig());
  // Never print connection errors: provider diagnostics may include connection data.
  try {
    await client.connect();
  } catch {
    throw new Error("No se pudo conectar al PostgreSQL desechable de pruebas");
  }
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE f0_probe (
      owner_id text NOT NULL, request_id text NOT NULL,
      amount numeric(20,4) NOT NULL,
      PRIMARY KEY (owner_id, request_id)
    ) ON COMMIT DROP`);
    await client.query("INSERT INTO f0_probe VALUES ($1,$2,$3),($4,$5,$6)", [
      "synthetic-a",
      "request-1",
      "0.1",
      "synthetic-b",
      "request-1",
      "0.2",
    ]);
    assert.equal(
      (await client.query("SELECT SUM(amount)::text AS total FROM f0_probe"))
        .rows[0].total,
      "0.3000",
    );
    assert.equal(
      (
        await client.query(
          "SELECT amount::text FROM f0_probe WHERE owner_id=$1",
          ["synthetic-a"],
        )
      ).rows.length,
      1,
    );
    await client.query("SAVEPOINT before_duplicate");
    await assert.rejects(
      client.query("INSERT INTO f0_probe VALUES ($1,$2,$3)", [
        "synthetic-a",
        "request-1",
        "7.00",
      ]),
      { code: "23505" },
    );
    await client.query("ROLLBACK TO SAVEPOINT before_duplicate");
    assert.equal(
      (await client.query("SELECT COUNT(*)::int AS count FROM f0_probe"))
        .rows[0].count,
      2,
    );
    await client.query("ROLLBACK");
    assert.equal(
      (await client.query("SELECT to_regclass('pg_temp.f0_probe') AS name"))
        .rows[0].name,
      null,
    );
  } finally {
    await client.end();
  }
});
