import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { seedFinancialDomain } from "../support/f6-04-dataset.mjs";
import prepareDatabase, {
  financeBrowserFixtures,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("OPS-RESET: purga del dominio completo con rollback, sesiones intactas y protección de reintentos", async () => {
  const clean = await prepareDatabase();
  const pool = new pg.Pool(testDatabaseConfig());
  try {
    const { owners } = await financeBrowserFixtures();
    const { rows: sessions } = await pool.query(
      'SELECT "userId" AS owner, token FROM app_auth.session ORDER BY id',
    );
    const sessionA = sessions.find(({ owner }) => owner === owners.a).token;
    const sessionB = sessions.find(({ owner }) => owner === owners.b).token;
    const tx = (ownerId, work) =>
      withOwnerTransaction(pool, async () => ({ ownerId }), work, {
        exclusive: true,
      });
    const run = async (client, token, revision) =>
      (
        await client.query("SELECT * FROM finance.reset_own_finances($1,$2)", [
          token,
          revision,
        ])
      ).rows[0];
    const reset = (owner, token, revision = null) =>
      tx(owner, (client) => run(client, token, revision));

    for (const ownerId of Object.values(owners)) {
      await tx(ownerId, (client) => seedFinancialDomain(client, ownerId));
      const subscription = randomUUID();
      await pool.query(
        "INSERT INTO finance.card_push_subscriptions(owner_id,id,endpoint,p256dh,auth) VALUES($1,$2,$3,'fixture','fixture')",
        [ownerId, subscription, "https://example.invalid/" + subscription],
      );
      await pool.query(
        `INSERT INTO finance.card_push_attempts(owner_id,subscription_id,card_id,period,currency)
          SELECT owner_id,$2,id,'2026-01-01','UYU' FROM finance.cards WHERE owner_id = $1 LIMIT 1`,
        [ownerId, subscription],
      );
      await pool.query(
        "INSERT INTO finance_meta.account_restores(owner_id,id,backup_sha256) VALUES($1,$2,repeat('a',64))",
        [ownerId, randomUUID()],
      );
      await pool.query(
        "INSERT INTO finance.categories(owner_id,id,kind,name,archived_at) VALUES($1,gen_random_uuid(),'expense','Histórica sintética',now())",
        [ownerId],
      );
    }

    const { rows: catalog } = await pool.query(`
      SELECT format('%I.%I', n.nspname, c.relname) AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname IN ('finance','finance_meta') AND c.relkind = 'r'
        AND a.attname = 'owner_id' AND NOT a.attisdropped ORDER BY 1
    `);
    assert.equal(catalog.length, 62);
    const inspect = async (owner) => {
      const tables = {};
      for (const { name } of catalog) {
        tables[name] = (
          await pool.query(
            `SELECT to_jsonb(t)::text AS row FROM ${name} t WHERE owner_id=$1 ORDER BY 1`,
            [owner],
          )
        ).rows;
      }
      return tables;
    };
    const identity = async () => {
      const rows = {};
      for (const name of [
        'app_auth."user"',
        "app_auth.account",
        "app_auth.session",
        "app_access.allowlist",
        "app_access.audit",
      ]) {
        rows[name] = (
          await pool.query(
            `SELECT to_jsonb(t)::text AS row FROM ${name} t ORDER BY 1`,
          )
        ).rows;
      }
      return rows;
    };
    const originalA = await inspect(owners.a);
    const originalB = await inspect(owners.b);
    const originalIdentity = await identity();
    assert.ok(
      Object.values(originalA).filter((rows) => rows.length).length >= 25,
    );
    assert.equal(originalA["finance.card_push_attempts"].length, 1);
    assert.equal(originalA["finance.card_push_subscriptions"].length, 1);
    assert.equal(originalA["finance_meta.account_restores"].length, 1);
    assert.equal((await reset(owners.a, sessionB)).status, "denied");
    assert.equal((await reset(owners.b, sessionA)).status, "denied");
    assert.equal((await reset(owners.a, randomUUID())).status, "denied");

    const { status, revision } = await reset(owners.a, sessionA);
    assert.equal(status, "ready");
    assert.match(revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(await inspect(owners.a), originalA);
    await assert.rejects(
      tx(owners.a, async (client) => {
        assert.equal((await run(client, sessionA, revision)).status, "reset");
        await client.query("SELECT 1 / 0");
      }),
      /Operación de datos rechazada/,
    );
    assert.deepEqual(await inspect(owners.a), originalA);
    assert.deepEqual(await identity(), originalIdentity);

    assert.equal((await reset(owners.a, sessionA, revision)).status, "reset");
    assert.ok(
      Object.values(await inspect(owners.a)).every((rows) => rows.length === 0),
    );
    assert.deepEqual(await inspect(owners.b), originalB);
    assert.deepEqual(await identity(), originalIdentity);

    await pool.query(
      "INSERT INTO finance.user_preferences(owner_id,display_currency) VALUES($1,'EUR')",
      [owners.a],
    );
    assert.equal((await reset(owners.a, sessionA, revision)).status, "changed");
    assert.equal(
      (await inspect(owners.a))["finance.user_preferences"].length,
      1,
    );
  } finally {
    await pool.end();
    await clean();
  }
});
