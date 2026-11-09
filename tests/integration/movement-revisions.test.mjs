import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { readMigrations } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listMovementTotals,
  listRecentMovements,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F1-04: motor monetario sobre PostgreSQL con datos previos y conexiones concurrentes", async (t) => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (owner, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const date = "2026-02-01";
  const opening = { currency: "UYU", amount: "10000.0000", asOfDate: date };
  const expense = {
    kind: "expense",
    currency: "UYU",
    amount: "5000.0000",
    effectiveOn: date,
    method: "debit",
    concept: "Compra sintética",
    note: "Nota",
    categoryId: null,
  };
  const legacyOwner = "f1-04-legacy";
  const originalId = randomUUID();
  const legacyKey = randomUUID();
  const legacyHash = createHash("sha256")
    .update(
      JSON.stringify([
        "ordinary-movement-v1",
        "expense",
        "UYU",
        "5000.0000",
        date,
        "debit",
        "Compra sintética",
        "Nota",
        null,
      ]),
    )
    .digest("hex");
  let initialized = false;

  const save = (owner, fields = {}) =>
    as(owner, (client, id) =>
      saveMovement(client, id, {
        ...expense,
        idempotencyKey: randomUUID(),
        ...fields,
      }),
    );
  const revise = (owner, command) =>
    as(owner, (client, id) => reviseMovement(client, id, command));
  const init = (owner, values = opening) =>
    as(owner, (client, id) => saveOpeningBalance(client, id, values));
  const balances = (owner) => as(owner, listBankBalances);
  const totals = (owner) =>
    as(owner, (client, id) => listMovementTotals(client, id, date));
  const recent = (owner) =>
    as(owner, (client, id) => listRecentMovements(client, id, "expense"));
  const undo = (eventId) => ({
    action: "void",
    eventId,
    idempotencyKey: randomUUID(),
  });

  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      const migrations = await readMigrations();
      for (const { sql, version, sha256 } of migrations.slice(0, 2)) {
        await admin.query(sql);
        await admin.query(
          "INSERT INTO finance_meta.schema_migrations(version, sha256) VALUES ($1,$2)",
          [version, sha256],
        );
      }
      await admin.query(
        `INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date,created_at)
         VALUES ($1,$2,'UYU',10000,$3,clock_timestamp())`,
        [legacyOwner, randomUUID(), date],
      );
      await admin.query(
        `INSERT INTO finance.financial_events(owner_id,id,kind,concept,effective_on,idempotency_key,command_hash,created_at)
         VALUES ($1,$2,'expense','Compra sintética',$3,$4,$5,clock_timestamp())`,
        [legacyOwner, originalId, date, legacyKey, legacyHash],
      );
      await admin.query(
        "INSERT INTO finance.ordinary_movements(owner_id,event_id,method,note) VALUES ($1,$2,'debit','Nota')",
        [legacyOwner, originalId],
      );
      await admin.query(
        `INSERT INTO finance.bank_effects(owner_id,id,event_id,currency,amount_signed,effective_on)
         VALUES ($1,$2,$2,'UYU',-5000,$3)`,
        [legacyOwner, originalId, date],
      );
      await admin.query(
        "INSERT INTO finance.audit_changes(owner_id,id,event_id,change_type) VALUES ($1,$2,$2,'created')",
        [legacyOwner, originalId],
      );
      // This suite also verifies the F1-04 fallback before F1-05 is applied.
      const { sql, version, sha256 } = migrations[2];
      await admin.query(sql);
      await admin.query(
        "INSERT INTO finance_meta.schema_migrations(version, sha256) VALUES ($1, $2)",
        [version, sha256],
      );
      await admin.query("COMMIT");
      initialized = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }

    await t.test(
      "CA-013/016: corrige 5000 a 500 una sola vez y conserva el original",
      async () => {
        assert.deepEqual(
          await save(legacyOwner, { idempotencyKey: legacyKey }),
          {
            status: "replayed",
            id: originalId,
          },
        );
        const command = {
          ...undo(originalId),
          action: "correct",
          amount: "500.0000",
        };
        const results = await Promise.all([
          revise(legacyOwner, command),
          revise(legacyOwner, command),
        ]);
        const replacement = results[0].id;
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "replayed",
          "revised",
        ]);
        assert.equal(results[1].id, replacement);
        assert.deepEqual(
          await revise(legacyOwner, { ...command, amount: "1.0000" }),
          { status: "conflict" },
        );
        assert.deepEqual(await revise("other-owner", command), {
          status: "not-found",
        });
        assert.deepEqual(await revise(legacyOwner, undo(originalId)), {
          status: "inactive",
        });
        assert.deepEqual(await balances(legacyOwner), [
          { ...opening, amount: "10000", calculatedAmount: "9500.0000" },
        ]);
        assert.deepEqual(await totals(legacyOwner), [
          { kind: "expense", currency: "UYU", amount: "500.0000" },
        ]);
        assert.deepEqual(await recent(legacyOwner), [
          {
            id: replacement,
            kind: "expense",
            currency: "UYU",
            amount: "500.0000",
            effectiveOn: date,
            method: "debit",
            concept: expense.concept,
            note: expense.note,
            category: null,
          },
        ]);

        await as(legacyOwner, async (client) => {
          assert.deepEqual(
            (
              await client.query(
                `SELECT f.status, e.amount_signed::text AS amount
            FROM finance.financial_events f JOIN finance.bank_effects e
              ON (f.owner_id,f.id) = (e.owner_id,e.event_id) ORDER BY f.status`,
              )
            ).rows,
            [
              { status: "confirmed", amount: "-500.0000" },
              { status: "corrected", amount: "-5000" },
            ],
          );
          assert.deepEqual(
            (
              await client.query(
                "SELECT event_id, replacement_event_id FROM finance.audit_changes WHERE change_type='corrected'",
              )
            ).rows,
            [{ event_id: originalId, replacement_event_id: replacement }],
          );
        });
      },
    );

    await t.test(
      "CA-014/016: deshace con reintento y conserva una sola anulación",
      async () => {
        const owner = "f1-04-void";
        await init(owner);
        const { id } = await save(owner, { amount: "0.0001" });
        const command = undo(id);
        const results = await Promise.all([
          revise(owner, command),
          revise(owner, command),
        ]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "replayed",
          "revised",
        ]);
        assert.ok(results.every((result) => result.id === id));
        assert.deepEqual(await revise(owner, undo(id)), { status: "inactive" });
        await as(owner, async (client) => {
          assert.equal(
            (
              await client.query(
                "SELECT 1 FROM finance.audit_changes WHERE change_type='voided' AND event_id=$1",
                [id],
              )
            ).rowCount,
            1,
          );
          assert.equal(
            (
              await client.query(
                "SELECT status FROM finance.financial_events WHERE id=$1",
                [id],
              )
            ).rows[0].status,
            "voided",
          );
          assert.equal(
            (
              await client.query(
                "SELECT amount_signed::text AS amount FROM finance.bank_effects WHERE event_id=$1",
                [id],
              )
            ).rows[0].amount,
            "-0.0001",
          );
        });
        assert.deepEqual(await balances(owner), [opening]);
        assert.deepEqual(await totals(owner), []);
        const otherId = (await save(owner)).id;
        const key = randomUUID();
        assert.equal(
          (await revise(owner, { ...undo(otherId), idempotencyKey: key }))
            .status,
          "revised",
        );
        assert.deepEqual(
          await save(owner, { currency: "EUR", idempotencyKey: key }),
          { status: "conflict" },
        );
      },
    );

    await t.test(
      "impide cambios sin fondos o tras un saldo confirmado",
      async () => {
        const owner = "f1-04-checkpoint";
        await init(owner, { ...opening, amount: "0.0000" });
        const income = await save(owner, { kind: "income", method: "deposit" });
        const debit = await save(owner, { amount: "4999.9999" });
        assert.equal(debit.status, "created");
        assert.deepEqual(await revise(owner, undo(income.id)), {
          status: "insufficient-funds",
          currency: "UYU",
          shortfall: "4999.9999",
        });
        await as(owner, (client, id) =>
          client.query(
            `INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date,created_at)
         VALUES ($1,$2,'UYU',12345.6789,$3,clock_timestamp())`,
            [id, randomUUID(), date],
          ),
        );
        assert.deepEqual(await revise(owner, undo(debit.id)), {
          status: "checkpoint",
        });
        assert.deepEqual(
          await revise(owner, {
            ...undo(debit.id),
            action: "correct",
            amount: "2.0000",
          }),
          { status: "checkpoint" },
        );
        assert.deepEqual(await balances(owner), [
          { ...opening, amount: "12345.6789" },
        ]);
        assert.equal((await recent(owner))[0].amount, "4999.9999");
      },
    );

    await t.test(
      "una falla posterior revierte reemplazo, auditoría y estado; RLS exige auditoría",
      async () => {
        const owner = "f1-04-rollback";
        await init(owner);
        const { id } = await save(owner);
        const command = { ...undo(id), action: "correct", amount: "500.0001" };
        await assert.rejects(
          as(owner, async (client) => {
            assert.equal(
              (await reviseMovement(client, owner, command)).status,
              "revised",
            );
            await client.query("SELECT 1 / 0");
          }),
          { message: "Operación de datos rechazada" },
        );
        assert.deepEqual(await totals(owner), [
          { kind: "expense", currency: "UYU", amount: "5000.0000" },
        ]);
        await as(owner, async (client) => {
          assert.equal(
            (await client.query("SELECT id FROM finance.financial_events"))
              .rowCount,
            1,
          );
          assert.equal(
            (
              await client.query(
                "SELECT id FROM finance.audit_changes WHERE change_type='corrected'",
              )
            ).rowCount,
            0,
          );
          await client.query("SAVEPOINT unaudited");
          await assert.rejects(
            client.query(
              "UPDATE finance.financial_events SET status='voided' WHERE id=$1",
              [id],
            ),
            { code: "42501" },
          );
          await client.query("ROLLBACK TO SAVEPOINT unaudited");
        });
        assert.equal((await revise(owner, command)).status, "revised");
        assert.deepEqual(await balances(owner), [
          { ...opening, calculatedAmount: "9499.9999" },
        ]);
      },
    );
  } finally {
    try {
      if (initialized)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
