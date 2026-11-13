import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { decodeBackup, encodeBackup } from "../../src/server/backup-format.ts";
import { loadPeriodReport } from "../../src/server/period-report.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import prepareDatabase, {
  financeBrowserFixtures,
} from "../support/finance-browser.mjs";

test("F5-07: inventario completo, decimales exactos, rollback, aislamiento y reintento", async () => {
  const clean = await prepareDatabase();
  const pool = new pg.Pool(testDatabaseConfig());
  try {
    const { owners } = await financeBrowserFixtures();
    const { rows: sessions } = await pool.query(
      'SELECT DISTINCT ON ("userId") "userId", token FROM app_auth.session WHERE "userId" = ANY($1::text[]) ORDER BY "userId", token',
      [[owners.a, owners.b]],
    );
    const tokens = new Map(
      sessions.map(({ userId, token }) => [userId, token]),
    );
    const tx = (ownerId, work, exclusive = false) =>
      withOwnerTransaction(pool, async () => ({ ownerId }), work, {
        exclusive,
      });
    const snapshot = (owner) =>
      tx(
        owner,
        async (client) =>
          (
            await client.query(
              "SELECT * FROM finance.account_backup_snapshot($1)",
              [tokens.get(owner)],
            )
          ).rows[0],
      );
    const insertCheckpoint = (owner, amount, date) =>
      tx(owner, (client) =>
        client.query(
          `INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date)
        VALUES ($1,$2,'UYU',$3,$4)`,
          [owner, randomUUID(), amount, date],
        ),
      );
    const runRestore = (owner, payload, revision, id) =>
      tx(
        owner,
        async (client) => {
          const digest = createHash("sha256").update(payload).digest("hex");
          return (
            await client.query(
              "SELECT finance.restore_account($1,$2,$3,$4,$5) AS result",
              [tokens.get(owners.a), payload, revision, id, digest],
            )
          ).rows[0].result;
        },
        true,
      );

    const { rows } = await pool.query(`
      WITH manifest AS (
        SELECT name, position FROM unnest(finance.account_backup_tables()) WITH ORDINALITY AS t(name, position)
      )
      SELECT src.name, dst.name AS parent FROM pg_constraint k
        JOIN pg_class source ON source.oid = k.conrelid
        JOIN pg_class target ON target.oid = k.confrelid
        JOIN manifest src ON src.name = source.relname
        JOIN manifest dst ON dst.name = target.relname
       WHERE k.contype = 'f' AND src.position < dst.position`);
    assert.deepEqual(rows, [], "Las tablas padre se insertan primero");

    await insertCheckpoint(owners.a, "9999999999999999.9999", "2025-01-01");
    await insertCheckpoint(owners.b, "42.0001", "2025-01-01");
    const report = await tx(owners.a, (client, owner) =>
      loadPeriodReport(client, owner, { from: "2025-03-01", to: "2025-03-31" }),
    );
    assert.deepEqual(report.saldos, [
      ["Saldo bancario", "UYU", "9999999999999999.9999", "2025-01-01", ""],
    ]);
    const saved = await snapshot(owners.a);
    const key = Buffer.alloc(32, 1);
    const plain = JSON.parse(
      (await encodeBackup(saved.payload, owners.a, key)).file,
    );
    assert.match(saved.payload, /9999999999999999\.9999/);
    assert.doesNotMatch(saved.payload, /42\.0001|owner_id|session|password/);
    await assert.rejects(
      decodeBackup(plain, owners.b, key),
      /pertenece a otra cuenta/,
    );
    await assert.rejects(
      decodeBackup({ ...plain, signed: plain.signed + " " }, owners.a, key),
      /firma/,
    );
    const { payload } = await decodeBackup(plain, owners.a, key);
    assert.equal(payload, saved.payload);

    const other = await snapshot(owners.b);
    await insertCheckpoint(owners.a, "500", "2025-04-01");
    const current = await snapshot(owners.a);
    const oldSchema = { ...JSON.parse(payload), schema: "0".repeat(64) };
    assert.notEqual(oldSchema.schema, JSON.parse(payload).schema);
    assert.equal(
      await runRestore(
        owners.a,
        JSON.stringify(oldSchema),
        current.revision,
        randomUUID(),
      ),
      "incompatible",
    );
    assert.deepEqual(await snapshot(owners.a), current);
    assert.equal(
      await runRestore(owners.a, payload, saved.revision, randomUUID()),
      "changed",
    );
    await assert.rejects(
      runRestore(owners.b, payload, other.revision, randomUUID()),
      /Operación de datos rechazada/,
    );
    const malformed = payload.replace(
      '"categories": []',
      '"categories": [{"name":"categoría inválida"}]',
    );
    assert.notEqual(malformed, payload);
    assert.equal(
      await runRestore(owners.a, malformed, current.revision, randomUUID()),
      "incompatible",
    );
    assert.deepEqual(
      await snapshot(owners.a),
      current,
      "El error tras borrar revierte la transacción",
    );

    const ids = [randomUUID(), randomUUID()];
    const outcomes = await Promise.all([
      runRestore(owners.a, payload, current.revision, ids[0]),
      runRestore(owners.a, payload, current.revision, ids[1]),
    ]);
    assert.deepEqual(outcomes.toSorted(), ["changed", "restored"]);
    assert.equal((await snapshot(owners.a)).payload, saved.payload);
    assert.deepEqual(await snapshot(owners.b), other);
    assert.equal(
      await runRestore(
        owners.a,
        payload,
        current.revision,
        ids[outcomes.indexOf("restored")],
      ),
      "restored",
    );
    const counts = await pool.query(
      "SELECT count(*)::int AS count FROM finance_meta.account_restores",
    );
    assert.equal(counts.rows[0].count, 1);
  } finally {
    await pool.end();
    await clean();
  }
});
