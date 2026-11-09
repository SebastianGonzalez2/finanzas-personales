import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  migrateInTransaction,
  readMigrations,
} from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  listBankBalances,
  listBankCheckpoints,
  saveBalanceAdjustment,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F1-05: confirmaciones y conciliación en PostgreSQL", async (t) => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (owner, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const a = "f1-05-a";
  const b = "f1-05-b";
  const legacy = "f1-05-legacy";
  const jan = "2026-01-01";
  const feb = "2026-02-01";
  const mar = "2026-03-01";
  const apr = "2026-04-01";
  const may = "2026-05-01";
  const jun = "2026-06-01";
  const opening = { currency: "UYU", amount: "32000.0000", asOfDate: jan };
  const init = (owner, fields = {}) =>
    as(owner, (client, id) =>
      saveOpeningBalance(client, id, { ...opening, ...fields }),
    );
  const command = (amount, asOfDate, fields = {}) => ({
    currency: "UYU",
    amount,
    asOfDate,
    note: null,
    idempotencyKey: randomUUID(),
    ...fields,
  });
  const confirm = (owner, input) =>
    as(owner, (client, id) => saveBalanceAdjustment(client, id, input));
  const record = (owner, amount, effectiveOn, fields = {}) =>
    as(owner, (client, id) =>
      saveMovement(client, id, {
        currency: "UYU",
        kind: "expense",
        method: "debit",
        amount,
        effectiveOn,
        concept: "Compra de prueba",
        note: null,
        categoryId: null,
        idempotencyKey: randomUUID(),
        ...fields,
      }),
    );
  const revise = (owner, input) =>
    as(owner, (client, id) => reviseMovement(client, id, input));
  const correction = (eventId, amount) => ({
    action: "correct",
    eventId,
    amount,
    idempotencyKey: randomUUID(),
  });
  const history = (owner = a) => as(owner, listBankCheckpoints);
  const totals = (owner, month) =>
    as(owner, (client, id) => listMovementTotals(client, id, month));
  let initialized = false;

  try {
    const migrations = await readMigrations();
    const migration = migrations.at(-1);
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      for (const { sql, version, sha256 } of migrations.slice(0, -1)) {
        await admin.query(sql);
        await admin.query(
          "INSERT INTO finance_meta.schema_migrations(version, sha256) VALUES ($1, $2)",
          [version, sha256],
        );
      }
      await admin.query("COMMIT");
      initialized = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }

    await init(legacy);
    assert.deepEqual(await confirm(legacy, command("30000.0000", feb)), {
      status: "unavailable",
    });
    const { id: legacyEvent } = await record(legacy, "2000.0000", feb);
    const legacyCorrection = await revise(
      legacy,
      correction(legacyEvent, "1500.0000"),
    );
    assert.equal(legacyCorrection.status, "revised");

    // Simulate an existing anchor recorded on the day between the original
    // event and its old F1-04 replacement. This also checks the view upgrade.
    await pool.query(
      `INSERT INTO finance.balance_checkpoints(owner_id, id, currency, confirmed_amount, as_of_date, created_at)
       SELECT $1, $2, 'UYU', 30000, $5, original.created_at + (replacement.created_at - original.created_at) / 2
         FROM finance.financial_events original JOIN finance.financial_events replacement ON replacement.owner_id = original.owner_id
        WHERE original.owner_id = $1 AND original.id = $3 AND replacement.id = $4`,
      [legacy, randomUUID(), legacyEvent, legacyCorrection.id, feb],
    );
    const upgrader = await pool.connect();
    try {
      await upgrader.query("BEGIN");
      assert.deepEqual(await migrateInTransaction(upgrader, migration.sha256), [
        migration.version,
      ]);
      await upgrader.query("COMMIT");
    } finally {
      await upgrader.query("ROLLBACK");
      upgrader.release();
    }

    await t.test(
      "la migración conserva registros y el orden original de las revisiones F1-04",
      async () => {
        assert.deepEqual(await as(legacy, listBankBalances), [
          { currency: "UYU", amount: "30000", asOfDate: feb },
        ]);
        assert.equal((await history(legacy))[0].difference, "-500.0000");
        assert.equal((await totals(legacy, feb))[0].amount, "1500.0000");
      },
    );

    await t.test(
      "CA-011: 9000 calculados → 8700 confirmados, sin gasto de 300; reintento concurrente",
      async () => {
        await init(b, { amount: "9000.0000" });
        const input = command("8700.0000", jan, { note: "Estado de cuenta" });
        const results = await Promise.all([
          confirm(b, input),
          confirm(b, input),
        ]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "created",
          "replayed",
        ]);
        assert.equal(results[0].id, results[1].id);
        assert.deepEqual(await confirm(b, { ...input, note: "Otro texto" }), {
          status: "conflict",
        });
        const [entry, initial] = await history(b);
        assert.equal(entry.id, results[0].id);
        assert.equal(entry.note, "Estado de cuenta");
        assert.equal(entry.originalProjection, "9000.0000");
        assert.equal(entry.originalDifference, "-300.0000");
        assert.equal(entry.difference, "-300.0000");
        assert.equal(initial.projection, null);
        assert.equal((await as(b, listBankBalances))[0].amount, "8700.0000");
        assert.deepEqual(await totals(b, jan), []);
        await as(b, async (client) => {
          assert.equal(
            (await client.query("SELECT 1 FROM finance.financial_events"))
              .rowCount,
            0,
          );
          assert.equal(
            (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
            0,
          );
          assert.equal(
            (
              await client.query(
                "SELECT 1 FROM finance.audit_changes WHERE id = $1 AND change_type = 'checkpoint_confirmed'",
                [entry.id],
              )
            ).rowCount,
            1,
          );
        });
      },
    );

    await t.test(
      "CA-015: febrero 2000 → 1500, marzo y mayo intactos, diferencia solo en marzo",
      async () => {
        await init(a);
        await init(a, { currency: "USD", amount: "100.0000" });
        const { id } = await record(a, "2000.0000", feb);
        const first = await confirm(a, command("30000.0000", mar));
        await record(a, "1000.0000", apr);
        const second = await confirm(a, command("29000.0000", may));
        await record(a, "40.0000", jun);
        assert.equal((await totals(a, feb))[0].amount, "2000.0000");
        const before = await as(a, listBankBalances);
        const revision = correction(id, "1500.0000");
        const revised = await revise(a, revision);
        assert.equal(revised.status, "revised");
        assert.deepEqual(await revise(a, revision), {
          status: "replayed",
          id: revised.id,
        });
        assert.deepEqual(await revise(b, correction(id, "1.0000")), {
          status: "not-found",
        });
        assert.deepEqual(await totals(a, feb), [
          { kind: "expense", currency: "UYU", amount: "1500.0000" },
        ]);
        assert.deepEqual(await as(a, listBankBalances), before);
        assert.deepEqual(before, [
          {
            currency: "UYU",
            amount: "29000.0000",
            asOfDate: may,
            calculatedAmount: "28960.0000",
          },
          { currency: "USD", amount: "100.0000", asOfDate: jan },
        ]);
        const after = await history();
        assert.deepEqual(
          after.find((item) => item.id === first.id),
          {
            id: first.id,
            currency: "UYU",
            amount: "30000.0000",
            asOfDate: mar,
            note: null,
            originalProjection: "30000.0000",
            originalDifference: "0.0000",
            projection: "30500.0000",
            difference: "-500.0000",
            projectionChanged: true,
          },
        );
        assert.equal(
          after.find((item) => item.id === second.id).difference,
          "0.0000",
        );
        assert.equal(
          after.find((item) => item.id === second.id).projectionChanged,
          false,
        );
        assert.equal((await history(b)).length, 2);
        assert.deepEqual(
          await as(b, (client) => listBankCheckpoints(client, a)),
          [],
        );
        await as(a, async (client) => {
          const audit = await client.query(
            "SELECT replacement_event_id FROM finance.audit_changes WHERE event_id = $1 AND change_type = 'corrected'",
            [id],
          );
          assert.equal(audit.rows[0].replacement_event_id, revised.id);
          assert.equal(
            (await client.query("SELECT 1 FROM finance.financial_events"))
              .rowCount,
            4,
          );
        });
      },
    );

    await t.test(
      "mismo día: varias revisiones y anulación conservan la posición; corrección posterior verifica fondos",
      async () => {
        const owner = "f1-05-same-day";
        await init(owner, { amount: "1000.0000" });
        const { id } = await record(owner, "100.0000", feb);
        const confirmed = await confirm(owner, command("900.0000", feb));
        const { id: later } = await record(owner, "50.0000", feb);
        const first = await revise(owner, correction(id, "200.0000"));
        const second = await revise(owner, correction(first.id, "300.0000"));
        assert.equal(second.status, "revised");
        assert.equal(
          (await as(owner, listBankBalances))[0].calculatedAmount,
          "850.0000",
        );
        assert.equal(
          (await history(owner)).find(({ id }) => id === confirmed.id)
            .difference,
          "200.0000",
        );
        assert.deepEqual(await revise(owner, correction(later, "901.0000")), {
          status: "insufficient-funds",
          shortfall: "1.0000",
          currency: "UYU",
        });
        assert.equal(
          (
            await revise(owner, {
              action: "void",
              eventId: second.id,
              idempotencyKey: randomUUID(),
            })
          ).status,
          "revised",
        );
        assert.equal((await history(owner))[0].difference, "-100.0000");
        assert.equal(
          (await as(owner, listBankBalances))[0].calculatedAmount,
          "850.0000",
        );
      },
    );

    await t.test(
      "ajuste intermedio, titular/moneda, fechas previas al inicial y rollback",
      async () => {
        assert.deepEqual(
          await confirm(a, command("0.0000", feb, { currency: "EUR" })),
          { status: "unconfigured" },
        );
        assert.deepEqual(await confirm(a, command("0.0000", "2025-12-31")), {
          status: "before-opening",
        });
        const previous = await as(a, listBankBalances);
        const pending = command("29999.9999", apr);
        await assert.rejects(
          as(a, async (client, id) => {
            assert.equal(
              (await saveBalanceAdjustment(client, id, pending)).status,
              "created",
            );
            throw new Error("rollback sintético");
          }),
          /Operación de datos rechazada/,
        );
        assert.equal(
          (await history()).some((entry) => entry.asOfDate === apr),
          false,
        );
        assert.equal((await confirm(a, pending)).status, "created");
        assert.deepEqual(await as(a, listBankBalances), previous);
        assert.equal((await history())[0].difference, "-999.9999");
        assert.deepEqual(
          await as(b, (client) =>
            saveBalanceAdjustment(client, a, command("1.0000", apr)),
          ),
          { status: "unconfigured" },
        );
        await assert.rejects(
          as(b, (client) =>
            client.query(
              `INSERT INTO finance.balance_adjustments (owner_id, checkpoint_id, idempotency_key, original_projection)
           VALUES ($1, $2, $3, 0)`,
              [a, randomUUID(), randomUUID()],
            ),
          ),
          /Operación de datos rechazada/,
        );
        await assert.rejects(
          as(a, (client) =>
            client.query(
              "UPDATE finance.balance_adjustments SET note = 'modificada'",
            ),
          ),
          /Operación de datos rechazada/,
        );
        await assert.rejects(
          as(a, (client) =>
            client.query("DELETE FROM finance.balance_checkpoints"),
          ),
          /Operación de datos rechazada/,
        );
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
