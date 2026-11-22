import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseBulkClassification } from "../../src/domain/history-bulk.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { lockOwnerWrites } from "../../src/server/owner-lock.ts";
import {
  readClassification,
  saveClassification,
  saveTag,
} from "../../src/server/classification.ts";
import { saveBulkClassification } from "../../src/server/history-bulk.ts";
import { listHistory } from "../../src/server/history.ts";
import { saveMovement } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-04: clasificación masiva atómica, versionada y aislada (CA-057)", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 3 });
  const [a, b, food, travel, income, tag, archived, cardId] = Array.from(
    { length: 8 },
    () => randomUUID(),
  );
  const as = (owner, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const date = "2026-02-04";
  const classify = (
    owner,
    entries,
    operation,
    idempotencyKey = randomUUID(),
  ) => {
    const command = parseBulkClassification({
      entries,
      ...operation,
      idempotencyKey,
    });
    assert.ok(!("error" in command));
    return as(owner, (client, id) =>
      saveBulkClassification(client, id, command),
    );
  };
  const movements = (owner, n) =>
    as(owner, async (client, id) => {
      const entries = [];
      for (let index = 0; index < n; index++) {
        const kind = "expense";
        const saved = await saveMovement(client, id, {
          kind,
          currency: "UYU",
          amount: "100.0001",
          effectiveOn: date,
          method: "debit",
          concept: `Gasto sintético ${index}`,
          note: null,
          categoryId: null,
          idempotencyKey: randomUUID(),
        });
        assert.equal(saved.status, "created");
        entries.push({ id: saved.id, kind, version: 0 });
      }
      return entries;
    });
  const financialState = async (owner) =>
    as(owner, async (client) => {
      const {
        rows: [state],
      } = await client.query(
        `SELECT
          (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM finance.financial_events e) AS events,
          (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM finance.bank_effects b) AS bank,
          (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM finance.balance_checkpoints c) AS checkpoints,
          (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.card_id, d.currency) FROM finance.card_currencies d) AS debt,
          (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.command_id, r.fund_id) FROM finance.reserve_effects r) AS reserves`,
      );
      return state;
    });
  let installed = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query(`
        CREATE FUNCTION finance.reject_test_bulk_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.change_type = 'classification_bulk'
            AND NEW.event_id::text = current_setting('finance.test_fail_bulk_audit', true)
          THEN
            RAISE EXCEPTION 'F5-04 synthetic audit failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER reject_test_bulk_audit BEFORE INSERT ON finance.audit_changes
          FOR EACH ROW EXECUTE FUNCTION finance.reject_test_bulk_audit();
      `);
      await admin.query(
        "INSERT INTO finance.cards (owner_id, id, kind, name) VALUES ($1, $2, 'credit', 'Tarjeta sintética')",
        [a, cardId],
      );
      await admin.query(
        "INSERT INTO finance.card_currencies (owner_id, card_id, kind, currency, debt) VALUES ($1, $2, 'credit', 'UYU', 42.0001)",
        [a, cardId],
      );
      await admin.query("COMMIT");
      installed = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }
    await as(a, async (client, owner) => {
      await client.query(
        `INSERT INTO finance.categories (owner_id, id, kind, name, archived_at)
         VALUES ($1, $2, 'expense', 'Alimentación', null), ($1, $3, 'expense', 'Viajes', null),
           ($1, $4, 'income', 'Sueldo', null), ($1, $5, 'expense', 'Archivada', now())`,
        [owner, food, travel, income, archived],
      );
      assert.deepEqual(
        await saveTag(client, owner, {
          action: "create",
          id: tag,
          name: "Prueba",
        }),
        { id: tag },
      );
    });
    const expenses = await movements(a, 12);
    const [foreign] = await movements(b, 1);
    const lot = expenses.slice(0, 10);
    const [split, untouched] = expenses.slice(10);
    const before = await financialState(a);
    assert.equal(before.debt[0].debt, 42.0001);
    const splitAmounts = [
      { categoryId: food, amount: "50.0000" },
      { categoryId: travel, amount: "50.0001" },
    ];
    const edit = (client, owner) =>
      saveClassification(client, owner, {
        eventId: split.id,
        idempotencyKey: randomUUID(),
        version: 0,
        allocations: splitAmounts,
      });
    assert.deepEqual(await as(a, edit), { id: split.id });
    assert.equal(
      (
        await classify(a, [untouched, { ...split, version: 1 }], {
          categoryId: food,
        })
      ).status,
      409,
    );
    assert.equal(
      (await classify(a, [untouched, foreign], { categoryId: food })).status,
      403,
    );
    assert.equal((await classify(b, lot, { categoryId: food })).status, 409);
    assert.equal((await classify(a, lot, { categoryId: income })).status, 409);
    assert.equal(
      (await classify(a, lot, { categoryId: archived })).status,
      409,
    );
    assert.equal(
      (
        await as(a, (client, owner) =>
          readClassification(client, owner, untouched.id),
        )
      ).version,
      0,
    );

    const key = randomUUID();
    const command = parseBulkClassification({
      entries: lot,
      categoryId: food,
      idempotencyKey: key,
    });
    await assert.rejects(
      as(a, async (client, owner) => {
        await client.query(
          "SELECT set_config('finance.test_fail_bulk_audit', $1, true)",
          [command.entries.at(-1).id],
        );
        return saveBulkClassification(client, owner, command);
      }),
      /Operación de datos rechazada/,
    );
    assert.deepEqual(
      await as(a, async (client) => {
        const {
          rows: [counts],
        } = await client.query(`
        SELECT (SELECT count(*)::int FROM finance.classification_changes WHERE version = 1) AS versions,
               (SELECT count(*)::int FROM finance.bulk_classification_changes) AS receipts,
               (SELECT count(*)::int FROM finance.audit_changes WHERE change_type = 'classification_bulk') AS audit
      `);
        return counts;
      }),
      { versions: 1, receipts: 0, audit: 0 },
    );
    assert.deepEqual(
      await Promise.all([
        classify(a, lot, { categoryId: food }, key),
        classify(a, [...lot].reverse(), { categoryId: food }, key),
      ]),
      [{ updated: 10 }, { updated: 10 }],
    );
    assert.equal(
      (await classify(a, lot, { categoryId: travel }, key)).status,
      409,
    );
    assert.equal((await classify(a, lot, { categoryId: travel })).status, 409);
    const history = await as(a, (client, owner) =>
      listHistory(
        client,
        owner,
        parseHistoryParams({ category: food, q: "Gasto sintético" }),
      ),
    );
    assert.deepEqual(
      new Set(history.entries.map(({ id }) => id)),
      new Set([...lot, split].map(({ id }) => id)),
    );
    assert.ok(
      history.entries.every(
        ({ classificationVersion }) => classificationVersion === 1,
      ),
    );

    // Hold the shared owner lock while a single edit commits before the batch.
    let beginRace;
    const locked = new Promise((resolve) => {
      beginRace = resolve;
    });
    let continueEdit;
    const editMayCommit = new Promise((resolve) => {
      continueEdit = resolve;
    });
    const first = as(a, async (client, owner) => {
      await lockOwnerWrites(client, owner);
      beginRace();
      await editMayCommit;
      return saveClassification(client, owner, {
        eventId: untouched.id,
        idempotencyKey: randomUUID(),
        version: 0,
        allocations: [{ categoryId: travel, amount: "100.0001" }],
      });
    });
    await locked;
    const second = classify(a, [untouched, { ...lot[0], version: 1 }], {
      categoryId: travel,
    });
    continueEdit();
    assert.deepEqual(await first, { id: untouched.id });
    assert.equal((await second).status, 409);
    assert.equal(
      (
        await as(a, (client, owner) =>
          readClassification(client, owner, lot[0].id),
        )
      ).version,
      1,
    );

    const tagCommand = [
      { ...lot[0], version: 1 },
      { ...split, version: 1 },
    ];
    assert.deepEqual(await classify(a, tagCommand, { tagId: tag }), {
      updated: 2,
    });
    const result = await as(a, (client, owner) =>
      readClassification(client, owner, split.id),
    );
    assert.deepEqual(
      result.allocations.map(({ categoryId, amount }) => ({
        categoryId,
        amount,
      })),
      splitAmounts,
    );
    assert.deepEqual(result.tagIds, [tag]);
    assert.deepEqual(
      await classify(
        a,
        tagCommand.map((entry) => ({ ...entry, version: 2 })),
        { tagId: tag },
      ),
      { updated: 0 },
    );
    const auditCount = (owner) =>
      as(
        owner,
        async (client) =>
          (
            await client.query(
              "SELECT count(*)::int AS count FROM finance.audit_changes WHERE change_type = 'classification_bulk'",
            )
          ).rows[0].count,
      );
    assert.equal(await auditCount(a), 12);
    assert.equal(await auditCount(b), 0);
    assert.deepEqual(await financialState(a), before);
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance,finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
