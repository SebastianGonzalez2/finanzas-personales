import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import prepareDatabase, {
  financeBrowserFixtures,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-08: rollback, exclusión mutua, revocación y purga limitada al titular", async () => {
  const clean = await prepareDatabase();
  const pool = new pg.Pool(testDatabaseConfig());
  try {
    const { owners } = await financeBrowserFixtures();
    const sessions = async (owner) =>
      (
        await pool.query(
          'SELECT token FROM app_auth.session WHERE "userId"=$1 ORDER BY token',
          [owner],
        )
      ).rows.map(({ token }) => token);
    const [sessionA, secondA] = await sessions(owners.a);
    const [sessionB] = await sessions(owners.b);

    const tx = (ownerId, work, exclusive = false) =>
      withOwnerTransaction(pool, async () => ({ ownerId }), work, {
        exclusive,
      });
    const deletion = async (client, session) =>
      (
        await client.query("SELECT finance.delete_own_account($1) AS status", [
          session,
        ])
      ).rows[0].status;
    const remove = (owner, session) =>
      tx(owner, (client) => deletion(client, session), true);
    const cronActive = async (client) =>
      (await client.query("SELECT finance.cron_owner_is_active() AS active"))
        .rows[0].active;
    const fixtureTables = [
      [
        "finance.user_preferences",
        "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
      ],
      [
        "finance.balance_checkpoints",
        `INSERT INTO finance.balance_checkpoints
        (owner_id, id, currency, confirmed_amount, as_of_date)
        VALUES ($1, gen_random_uuid(), 'UYU', '42.0001', '2025-01-01')`,
      ],
      [
        "finance.cards",
        `INSERT INTO finance.cards (owner_id, id, kind, name)
        VALUES ($1, $2, 'credit', 'Tarjeta de prueba')`,
      ],
      [
        "finance.card_currencies",
        `INSERT INTO finance.card_currencies
        (owner_id, card_id, kind, currency, debt) VALUES ($1, $2, 'credit', 'UYU', '15.0001')`,
      ],
      [
        "finance.financial_events",
        `INSERT INTO finance.financial_events
        (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash)
        VALUES ($1, $2, 'bank_benefit', 'Beneficio de prueba', '2025-01-01', gen_random_uuid(), repeat('a', 64))`,
      ],
      [
        "finance.bank_benefits",
        `INSERT INTO finance.bank_benefits
        (owner_id, event_id, destination, currency, amount)
        VALUES ($1, $2, 'bank', 'UYU', '5.0001')`,
      ],
      [
        "finance.card_push_subscriptions",
        `INSERT INTO finance.card_push_subscriptions
        (owner_id, id, endpoint, p256dh, auth) VALUES ($1, $2, 'https://push.example.invalid/' || $1, 'p', 'a')`,
      ],
      [
        "finance.card_push_attempts",
        `INSERT INTO finance.card_push_attempts
        (owner_id, subscription_id, card_id, period, currency) VALUES ($1, $2, $2, '2025-01-01', 'UYU')`,
      ],
      [
        "finance_meta.account_restores",
        `INSERT INTO finance_meta.account_restores
        (owner_id, id, backup_sha256) VALUES ($1, gen_random_uuid(), repeat('a', 64))`,
      ],
    ];
    // Use the same UUID for A and B to exercise composite foreign keys.
    const sharedId = randomUUID();
    for (const owner of Object.values(owners)) {
      for (const [, sql] of fixtureTables) {
        await pool.query(sql, sql.includes("$2") ? [owner, sharedId] : [owner]);
      }
    }
    await pool.query(`INSERT INTO finance.fx_reference_rates
      (base_currency, quote_currency, observed_on, source, rate)
      VALUES ('USD', 'UYU', '2025-01-01', 'frankfurter', 42)`);
    const snapshot = async (owner) =>
      Promise.all(
        fixtureTables.map(
          async ([relation]) =>
            (
              await pool.query(`SELECT * FROM ${relation} WHERE owner_id=$1`, [
                owner,
              ])
            ).rows,
        ),
      );
    const originalA = await snapshot(owners.a);
    const originalB = await snapshot(owners.b);
    assert.equal(await remove(owners.a, sessionB), "denied");
    assert.equal(await remove(owners.b, sessionA), "denied");

    await pool.query(
      `UPDATE app_auth.session SET "createdAt"=now()-interval '11 minutes' WHERE token=$1`,
      [sessionA],
    );
    assert.equal(await remove(owners.a, sessionA), "stale");
    assert.deepEqual(await snapshot(owners.a), originalA);

    // Simulate an error at the final identity delete after financial rows
    // and sessions have already been removed inside the transaction.
    await pool.query(`
      CREATE TABLE app_auth.delete_fixture (owner_id text REFERENCES app_auth."user"(id));
    `);
    await pool.query("INSERT INTO app_auth.delete_fixture VALUES ($1)", [
      owners.a,
    ]);
    await assert.rejects(
      remove(owners.a, secondA),
      /Operación de datos rechazada/,
    );
    assert.deepEqual(await sessions(owners.a), [sessionA, secondA]);
    assert.deepEqual(await snapshot(owners.a), originalA);
    assert.equal(await tx(owners.a, cronActive), true);
    await pool.query("DROP TABLE app_auth.delete_fixture");

    // A queued cron holds an already enumerated owner, and another deletion
    // attempt holds an already read token. Both revalidate after the commit.
    const started = Promise.withResolvers();
    const commit = Promise.withResolvers();
    const first = tx(
      owners.a,
      async (client) => {
        try {
          assert.equal(await deletion(client, secondA), "deleted");
        } finally {
          started.resolve();
        }
        await commit.promise;
      },
      true,
    );
    await started.promise;
    const retry = remove(owners.a, secondA);
    const queuedCron = tx(owners.a, cronActive);
    commit.resolve();
    await first;
    assert.equal(await retry, "denied");
    assert.equal(await queuedCron, false);

    assert.deepEqual(await sessions(owners.a), []);
    assert.deepEqual(await sessions(owners.b), [sessionB]);
    assert.ok((await snapshot(owners.a)).every((rows) => rows.length === 0));
    assert.deepEqual(await snapshot(owners.b), originalB);
    assert.equal(await tx(owners.b, cronActive), true);
    const {
      rows: [result],
    } = await pool.query(
      `SELECT
      (SELECT count(*)::int FROM app_auth."user" WHERE id=$1) AS users,
      (SELECT count(*)::int FROM app_auth.account WHERE "userId"=$1) AS accounts,
      (SELECT enabled FROM app_access.allowlist WHERE user_id=$1) AS enabled,
      (SELECT count(*)::int FROM finance.fx_reference_rates) AS public_rates,
      app_access.authorize_session($2) AS rejected,
      app_access.authorize_session($3) AS authorized`,
      [owners.a, secondA, sessionB],
    );
    assert.deepEqual(result, {
      users: 0,
      accounts: 0,
      enabled: false,
      public_rates: 1,
      rejected: null,
      authorized: owners.b,
    });
  } finally {
    await pool.end();
    await clean();
  }
});
