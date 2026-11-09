import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  migrateInTransaction,
  readMigrations,
} from "../../src/db/migrations.mts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import { schemaContract } from "../support/schema-contract.mjs";
import {
  setOwnerContext,
  withOwnerTransaction,
} from "../../src/db/owner-context.mts";
import { randomUUID } from "node:crypto";

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
      "0002_F1-03_ordinary_movements.sql",
      "0003_F1-04_movement_revisions.sql",
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

test("F1-04: aplica solo el SQL autorizado y conserva el historial previo", async () => {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    const [initial, movement, revisions] = await readMigrations();
    await assert.rejects(migrateInTransaction(client, movement.sha256), {
      message: "La migración pendiente no coincide con el SQL autorizado",
    });
    await client.query(initial.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [initial.version, initial.sha256],
    );
    await setOwnerContext(client, "legacy-fixture");
    const id = randomUUID();
    await client.query(
      `INSERT INTO finance.financial_events
        (owner_id,id,kind,concept,effective_on,idempotency_key,command_hash)
        VALUES ('legacy-fixture',$1,'expense','Registro anterior','2026-01-01',$1,repeat('a',64))`,
      [id],
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, initial.sha256));
    await assert.rejects(migrateInTransaction(client, revisions.sha256));
    await client.query(movement.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [movement.version, movement.sha256],
    );
    assert.deepEqual(await migrateInTransaction(client, revisions.sha256), [
      revisions.version,
    ]);
    await setOwnerContext(client, "legacy-fixture");
    assert.equal(
      (await client.query("SELECT id FROM finance.financial_events")).rows[0]
        .id,
      id,
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.ordinary_movements")).rowCount,
      0,
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

// Committed schema and synthetic rows exist only in the disposable localhost
// service. This suite is never imported by the Neon development harness.
test(
  "F0-05: concurrencia de migraciones y contexto transaccional real",
  { timeout: 30000 },
  async (t) => {
    const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
    const migrate = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const applied = await migrateInTransaction(client);
        await client.query("COMMIT");
        return applied;
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    };
    try {
      await t.test(
        "dos migradores aplican una sola vez y conservan el ledger",
        async () => {
          const results = await Promise.all([migrate(), migrate()]);
          assert.deepEqual(results.map((rows) => rows.length).sort(), [0, 3]);
          assert.equal(
            (await pool.query("SELECT * FROM finance_meta.schema_migrations"))
              .rowCount,
            3,
          );
        },
      );
      await t.test(
        "checksum cambiado e historial desconocido abortan sin aplicar DDL",
        async () => {
          const client = await pool.connect();
          try {
            for (const sql of [
              "UPDATE finance_meta.schema_migrations SET sha256 = repeat('0',64)",
              "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ('unknown.sql',repeat('a',64))",
            ]) {
              await client.query("BEGIN");
              await client.query(sql);
              await assert.rejects(migrateInTransaction(client), {
                message: "Historial de migraciones divergente",
              });

              await client.query("ROLLBACK");
            }
            await client.query("BEGIN");
            assert.deepEqual(await migrateInTransaction(client), []);
            await client.query("ROLLBACK");
          } finally {
            await client.query("ROLLBACK");
            client.release();
          }
        },
      );
      await t.test(
        "dos conexiones con misma clave producen un solo evento confirmado",
        async () => {
          const clients = await Promise.all([pool.connect(), pool.connect()]);
          const ownerId = `f0-05-concurrent-${randomUUID()}`;
          const key = randomUUID();
          const insert =
            "INSERT INTO finance.financial_events(owner_id,id,kind,concept,effective_on,idempotency_key,command_hash) VALUES ($1,$2,'expense','fixture concurrente','2026-01-31',$3,$4)";
          try {
            for (const client of clients) {
              await client.query("BEGIN");
              await setOwnerContext(client, ownerId);
            }
            await clients[0].query(insert, [
              ownerId,
              randomUUID(),
              key,
              "a".repeat(64),
            ]);
            const duplicate = assert.rejects(
              clients[1].query(insert, [
                ownerId,
                randomUUID(),
                key,
                "a".repeat(64),
              ]),
              { code: "23505" },
            );
            await clients[0].query("COMMIT");
            await duplicate;
            await clients[1].query("ROLLBACK");
            await clients[0].query("BEGIN");
            await setOwnerContext(clients[0], ownerId);
            assert.equal(
              (await clients[0].query("SELECT * FROM finance.financial_events"))
                .rowCount,
              1,
            );
          } finally {
            for (const client of clients) {
              await client.query("ROLLBACK");
              client.release();
            }
          }
        },
      );
      // One connection forces reuse across owners, successful commits and failures.
      await pool.end();
    } catch (error) {
      await pool.end();
      throw error;
    }

    const reused = new pg.Pool({ ...testDatabaseConfig(), max: 1 });
    const owner = `f0-05-context-${randomUUID()}`;
    const resolve = async () => ({ ownerId: owner });
    const contextReset = async () => {
      const { rows } = await reused.query(
        "SELECT current_user = session_user AS role_reset, nullif(current_setting('finance.owner_id',true),'') IS NULL AS owner_reset",
      );
      assert.deepEqual(rows[0], { role_reset: true, owner_reset: true });
    };
    try {
      await t.test(
        "rechaza identidad ausente o inválida sin ejecutar trabajo",
        async () => {
          for (const resolveOwner of [
            async () => null,
            async () => {
              throw new Error("private identity detail");
            },
            async () => ({ ownerId: " " }),
          ]) {
            await assert.rejects(
              withOwnerTransaction(reused, resolveOwner, async () =>
                assert.fail("No debe ejecutarse"),
              ),
            );
          }
          await contextReset();
        },
      );
      await t.test(
        "COMMIT real, rol limitado y cambio de titular sin filtrar contexto",
        async () => {
          for (const ownerId of [owner, `${owner}-b`]) {
            const result = await withOwnerTransaction(
              reused,
              async () => ({ ownerId }),
              async (client, resolvedOwner) => {
                assert.equal(resolvedOwner, ownerId);
                const { rows } = await client.query(
                  "SELECT current_user AS role, current_setting('finance.owner_id') AS owner",
                );
                assert.deepEqual(rows[0], {
                  role: "finanzas_app",
                  owner: ownerId,
                });
                return "confirmed";
              },
            );
            assert.equal(result, "confirmed");
            await contextReset();
          }
        },
      );
      await t.test(
        "ROLLBACK ante error de trabajo, sin datos parciales ni detalles sensibles",
        async () => {
          await assert.rejects(
            withOwnerTransaction(reused, resolve, async (client) => {
              await client.query(
                "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
                [owner],
              );
              throw new Error("private financial detail");
            }),
            { message: "Operación de datos rechazada" },
          );
          await contextReset();
          await withOwnerTransaction(reused, resolve, async (client) =>
            assert.equal(
              (await client.query("SELECT * FROM finance.user_preferences"))
                .rowCount,
              0,
            ),
          );
        },
      );
      await t.test(
        "error SQL capturado no puede devolver éxito después de ROLLBACK implícito",
        async () => {
          await assert.rejects(
            withOwnerTransaction(reused, resolve, async (client) => {
              await client.query(
                "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
                [owner],
              );
              await assert.rejects(client.query("SELECT 1 / 0"), {
                code: "22012",
              });
              return "incorrect success";
            }),
            { message: "Operación de datos rechazada" },
          );
          await contextReset();
          await withOwnerTransaction(reused, resolve, async (client) =>
            assert.equal(
              (await client.query("SELECT * FROM finance.user_preferences"))
                .rowCount,
              0,
            ),
          );
        },
      );
    } finally {
      await reused.end();
    }
  },
);
