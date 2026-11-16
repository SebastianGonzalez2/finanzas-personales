import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { decodeBackup, encodeBackup } from "../../src/server/backup-format.ts";
import { seedFinancialDomain } from "../support/f6-04-dataset.mjs";
import prepareDatabase, {
  financeBrowserFixtures,
} from "../support/finance-browser.mjs";
import { testDatabaseConfig } from "../support/test-database.mjs";

// Disaster recovery rehearsal. Everything here runs against the disposable
// local PostgreSQL guarded by testDatabaseConfig(); data is synthetic.
test("F6-04 CA-062/063: recuperación controlada del dominio financiero completo", async () => {
  const clean = await prepareDatabase();
  const pool = new pg.Pool(testDatabaseConfig());
  try {
    const { owners } = await financeBrowserFixtures();
    const { rows: sessions } = await pool.query(
      'SELECT DISTINCT ON ("userId") "userId", token FROM app_auth.session WHERE "userId" = ANY($1::text[]) ORDER BY "userId", token',
      [[owners.a, owners.b]],
    );
    const tokens = new Map(sessions.map((row) => [row.userId, row.token]));
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
    const restore = (owner, payload, revision, id = randomUUID()) =>
      tx(
        owner,
        async (client) =>
          (
            await client.query(
              "SELECT finance.restore_account($1,$2,$3,$4,$5) AS result",
              [
                tokens.get(owner),
                payload,
                revision,
                id,
                createHash("sha256").update(payload).digest("hex"),
              ],
            )
          ).rows[0].result,
        true,
      );

    const {
      rows: [{ tables }],
    } = await pool.query("SELECT finance.account_backup_tables() AS tables");
    // Independent of the backup function: a raw per-table dump as the owner.
    const dump = async (owner) => {
      const result = {};
      for (const table of tables) {
        const { rows } = await pool.query(
          `SELECT to_jsonb(t) - 'owner_id' AS row FROM finance.${table} t
            WHERE owner_id = $1 ORDER BY (to_jsonb(t) - 'owner_id')::text COLLATE "C"`,
          [owner],
        );
        result[table] = rows.map(({ row }) => row);
      }
      return result;
    };
    const identity = async () =>
      (
        await pool.query(`SELECT
          (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]') FROM app_auth."user" u) AS users,
          (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]') FROM app_auth.account a) AS accounts,
          (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.token), '[]') FROM app_auth.session s) AS sessions,
          (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.email), '[]') FROM app_access.allowlist l) AS allowlist`)
      ).rows[0];
    const effectTotals = async () =>
      (
        await pool.query(
          `SELECT currency, count(*)::int AS rows, sum(amount_signed)::text AS total
             FROM finance.bank_effects WHERE owner_id = $1 GROUP BY currency ORDER BY currency`,
          [owners.a],
        )
      ).rows;
    const receipts = async () =>
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM finance_meta.account_restores",
        )
      ).rows[0].count;

    await tx(owners.a, (client, owner) => seedFinancialDomain(client, owner));
    await tx(owners.b, (client, owner) =>
      seedFinancialDomain(client, owner, { rich: false }),
    );

    // The rehearsal is only meaningful when most of the inventory has rows.
    const original = await dump(owners.a);
    const empty = tables.filter((table) => original[table].length === 0);
    // Tables not exercised by the synthetic domain are listed explicitly, so
    // a new inventory table cannot silently skip the rehearsal.
    assert.deepEqual(empty, [
      "balance_adjustments",
      "mixed_purchase_categories",
      "refund_installments",
      "contribution_plans",
      "contribution_periods",
      "contribution_changes",
      "fund_event_allocations",
      "fund_payment_allocations",
      "budget_notices",
      "recurring_share_participants",
      "name_catalog_changes",
      "bulk_classification_changes",
      "statistics_favorites",
    ]);
    const effectsBefore = await effectTotals();
    assert.ok(effectsBefore.length > 0);
    const originalB = await dump(owners.b);
    const authBefore = await identity();
    const saved = await snapshot(owners.a);
    const password = "contraseña-sintética-f604";
    const key = Buffer.alloc(32, 7);
    const { file } = await encodeBackup(saved.payload, owners.a, key, password);
    assert.doesNotMatch(file, /Almuerzo|9999999999999|Tarjeta sintética/);

    // Disaster: A loses part of its rows and gains post-backup movements.
    await pool.query("BEGIN");
    for (const table of [...tables].reverse())
      await pool.query(`DELETE FROM finance.${table} WHERE owner_id = $1`, [
        owners.a,
      ]);
    await pool.query(
      `INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date)
       VALUES ($1,gen_random_uuid(),'UYU','1.0000','2026-03-01')`,
      [owners.a],
    );
    await pool.query("COMMIT");
    const damaged = await snapshot(owners.a);
    assert.notEqual(damaged.payload, saved.payload);
    assert.notDeepEqual(await dump(owners.a), original);

    // Wrong password and tampered files fail before reaching the database.
    const envelope = JSON.parse(file);
    await assert.rejects(
      decodeBackup(envelope, owners.a, key, "contraseña-incorrecta"),
      /Contraseña incorrecta/,
    );
    await assert.rejects(
      decodeBackup(
        { ...envelope, ciphertext: envelope.ciphertext.replace(/^./, "A") },
        owners.a,
        key,
        password,
      ),
      /Contraseña incorrecta o copia dañada/,
    );
    assert.deepEqual(await snapshot(owners.a), damaged);
    assert.equal(await receipts(), 0);

    const decoded = await decodeBackup(envelope, owners.a, key, password);
    assert.equal(decoded.payload, saved.payload);

    // A failure in the middle of the replay (non-constraint error in a late
    // table) must abort the whole transaction, including the first deletes.
    await pool.query(`
      CREATE FUNCTION finance.f6_04_fail() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'fallo simulado F6-04'; END $$;
      CREATE TRIGGER f6_04_fail BEFORE INSERT ON finance.bank_benefits
        FOR EACH ROW EXECUTE FUNCTION finance.f6_04_fail()`);
    await assert.rejects(
      restore(owners.a, decoded.payload, damaged.revision),
      /Operación de datos rechazada/,
    );
    await pool.query(
      "DROP TRIGGER f6_04_fail ON finance.bank_benefits; DROP FUNCTION finance.f6_04_fail()",
    );
    assert.deepEqual(await snapshot(owners.a), damaged);
    assert.equal(await receipts(), 0, "Sin recibo tras un fallo");

    // A payload that breaks a foreign key (children without their events) is
    // rejected as incompatible, and nothing is left half replaced.
    const orphan = JSON.parse(decoded.payload);
    orphan.tables.financial_events = [];
    assert.equal(
      await restore(owners.a, JSON.stringify(orphan), damaged.revision),
      "incompatible",
    );
    // A missing table or a non-array table is incompatible, never ignored.
    const missing = JSON.parse(decoded.payload);
    delete missing.tables.loans;
    assert.equal(
      await restore(owners.a, JSON.stringify(missing), damaged.revision),
      "incompatible",
    );
    assert.deepEqual(await snapshot(owners.a), damaged);
    assert.equal(await receipts(), 0);

    // Another account cannot restore A's rows with its own session.
    await assert.rejects(
      tx(
        owners.b,
        (client) =>
          client.query("SELECT finance.restore_account($1,$2,$3,$4,$5)", [
            tokens.get(owners.a),
            decoded.payload,
            "0".repeat(64),
            randomUUID(),
            "0".repeat(64),
          ]),
        true,
      ),
      /Operación de datos rechazada/,
    );
    assert.deepEqual(await dump(owners.b), originalB);

    // Successful recovery and idempotent retry.
    const operation = randomUUID();
    assert.equal(
      await restore(owners.a, decoded.payload, damaged.revision, operation),
      "restored",
    );
    assert.equal(
      await restore(owners.a, decoded.payload, damaged.revision, operation),
      "restored",
    );
    assert.equal(await receipts(), 1);
    const recovered = await dump(owners.a);
    for (const table of tables)
      assert.deepEqual(recovered[table], original[table], `Tabla ${table}`);
    assert.equal((await snapshot(owners.a)).payload, saved.payload);
    assert.deepEqual(await dump(owners.b), originalB);
    assert.deepEqual(await identity(), authBefore);
    // Derived consistency: replay creates no fictitious bank effects.
    assert.deepEqual(await effectTotals(), effectsBefore);
  } finally {
    await pool.end();
    await clean();
  }
});

test("F6-04: el inventario cubre el esquema vigente y rechaza la deriva sin perder datos", async () => {
  const clean = await prepareDatabase();
  const pool = new pg.Pool(testDatabaseConfig());
  try {
    const { owners } = await financeBrowserFixtures();
    const {
      rows: [{ token }],
    } = await pool.query(
      'SELECT token FROM app_auth.session WHERE "userId" = $1 LIMIT 1',
      [owners.a],
    );
    const {
      rows: [{ tables }],
    } = await pool.query("SELECT finance.account_backup_tables() AS tables");
    const ownerTables = (
      await pool.query(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'finance' AND c.relkind IN ('r', 'p') AND EXISTS (
           SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
             AND a.attname = 'owner_id' AND NOT a.attisdropped)
         ORDER BY c.relname`)
    ).rows;
    // Only device endpoints and their attempts live outside portable copies.
    const outside = ["card_push_attempts", "card_push_subscriptions"];
    assert.deepEqual(
      ownerTables.map(({ relname }) => relname),
      [...tables, ...outside].sort(),
      "Cada tabla con titular está en la copia o excluida a propósito",
    );
    assert.equal(new Set(tables).size, tables.length, "Sin duplicados");
    assert.ok(
      ownerTables.every((row) => row.relrowsecurity && row.relforcerowsecurity),
      "RLS obligatoria en todas las tablas con titular",
    );
    // No credential-like columns travel in a copy (idempotency keys are not secrets).
    const { rows: sensitive } = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'finance' AND table_name = ANY($1)
          AND column_name ~* '(password|secret|token|session|credential|cookie|api_key|private)'`,
      [tables],
    );
    assert.deepEqual(sensitive, []);
    const {
      rows: [layout],
    } = await pool.query(`SELECT
      (SELECT layout FROM finance_meta.account_backup_layout) = finance.account_backup_layout() AS current`);
    assert.equal(
      layout.current,
      true,
      "El diseño registrado coincide con el vivo",
    );

    const snapshot = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('finance.owner_id', $1, true)", [
          owners.a,
        ]);
        return await client.query(
          "SELECT * FROM finance.account_backup_snapshot($1)",
          [token],
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    };
    await snapshot();
    // A later migration that adds a column or table without updating the
    // inventory and layout must make copies fail loudly, never omit data.
    await pool.query("ALTER TABLE finance.tags ADD COLUMN f6_04_drift text");
    await assert.rejects(snapshot(), /Esquema financiero no compatible/);
    await pool.query("ALTER TABLE finance.tags DROP COLUMN f6_04_drift");
    await pool.query("CREATE TABLE finance.f6_04_new (owner_id text)");
    await assert.rejects(snapshot(), /Esquema financiero no compatible/);
    await pool.query("DROP TABLE finance.f6_04_new");
    await snapshot();
  } finally {
    await pool.end();
    await clean();
  }
});
