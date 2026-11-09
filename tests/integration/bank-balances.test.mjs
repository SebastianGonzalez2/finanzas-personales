import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F1-02: anclas exactas por titular y moneda con reintento, concurrencia y rollback", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const a = `f1-02-a-${randomUUID()}`;
  const b = `f1-02-b-${randomUUID()}`;
  const uyu = { currency: "UYU", amount: "10000.0000", asOfDate: "2026-01-31" };
  const usd = { currency: "USD", amount: "100.0000", asOfDate: "2026-02-01" };
  const eur = { currency: "EUR", amount: "0.0000", asOfDate: "2026-02-28" };
  const save = (owner, balance) =>
    as(owner, (client, ownerId) =>
      saveOpeningBalance(client, ownerId, balance),
    );

  let ownsSchema = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      assert.deepEqual(await migrateInTransaction(admin), [
        "0001_F0-05_initial.sql",
        "0002_F1-03_ordinary_movements.sql",
        "0003_F1-04_movement_revisions.sql",
        "0004_F1-05_balance_reconciliation.sql",
        "0005_F1-06_bank_transfers.sql",
      ]);
      await admin.query("COMMIT");
      ownsSchema = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }

    assert.deepEqual(await as(a, listBankBalances), []);
    assert.deepEqual((await Promise.all([save(a, uyu), save(a, uyu)])).sort(), [
      "created",
      "replayed",
    ]);
    const anotherUsd = { ...usd, amount: "101.0000" };
    const usdResults = await Promise.all([save(a, usd), save(a, anotherUsd)]);
    assert.deepEqual([...usdResults].sort(), ["conflict", "created"]);
    const savedUsd = usdResults[0] === "created" ? usd : anotherUsd;
    assert.equal(await save(a, { ...uyu, asOfDate: "2026-02-01" }), "conflict");
    assert.deepEqual(await as(a, listBankBalances), [uyu, savedUsd]);

    const otherUyu = { ...uyu, amount: "-123.4567" };
    assert.deepEqual(await as(b, listBankBalances), []);
    assert.equal(await save(b, otherUyu), "created");
    assert.deepEqual(await as(b, listBankBalances), [otherUyu]);
    assert.deepEqual(await as(b, (client) => listBankBalances(client, a)), []);
    await assert.rejects(as(b, (client) => saveOpeningBalance(client, a, eur)));

    await assert.rejects(
      as(a, async (client, ownerId) => {
        assert.equal(await saveOpeningBalance(client, ownerId, eur), "created");
        throw new Error("fixture de rollback");
      }),
      { message: "Operación de datos rechazada" },
    );
    assert.deepEqual(await as(a, listBankBalances), [uyu, savedUsd]);
    assert.equal(await save(a, eur), "created");
    assert.deepEqual(await as(a, listBankBalances), [uyu, savedUsd, eur]);
    await as(a, async (client) => {
      const {
        rows: [counts],
      } = await client.query(`
        SELECT (SELECT count(*)::int FROM finance.financial_events) AS events,
               (SELECT count(*)::int FROM finance.bank_effects) AS effects,
               (SELECT count(*)::int FROM finance.balance_checkpoints) AS checkpoints,
               (SELECT count(*)::int FROM finance.audit_changes) AS audits,
               (SELECT count(*)::int FROM finance.audit_changes a
                 JOIN finance.balance_checkpoints b USING (owner_id, id)
                WHERE a.change_type = 'checkpoint_confirmed' AND a.event_id IS NULL) AS linked
      `);
      assert.deepEqual(counts, {
        events: 0,
        effects: 0,
        checkpoints: 3,
        audits: 3,
        linked: 3,
      });
    });
  } finally {
    try {
      if (ownsSchema)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
