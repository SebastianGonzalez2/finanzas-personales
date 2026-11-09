import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  listBankBalances,
  listBankCheckpoints,
  saveBalanceAdjustment,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listMovementTotals,
  listRecentBankTransfers,
  reviseMovement,
  saveBankTransfer,
  saveMovement,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F1-06: cambios de moneda atómicos y auditados en PostgreSQL", async (t) => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const opening = "2026-01-01";
  const effectiveOn = "2026-02-01";
  const command = (fields = {}) => ({
    kind: "bank_transfer",
    sourceCurrency: "UYU",
    sourceAmount: "4000.0000",
    destinationCurrency: "USD",
    destinationAmount: "100.0000",
    effectiveOn,
    idempotencyKey: randomUUID(),
    ...fields,
  });
  const init = (owner, currency, amount = "0.0000") =>
    as(owner, (client, id) =>
      saveOpeningBalance(client, id, { currency, amount, asOfDate: opening }),
    );
  const initializePair = async (owner) => {
    await init(owner, "UYU", "10000.0000");
    await init(owner, "USD");
  };
  const save = (owner, input) =>
    as(owner, (client, id) => saveBankTransfer(client, id, input));
  const revise = (owner, input) =>
    as(owner, (client, id) => reviseMovement(client, id, input));
  const voidCommand = (eventId) => ({
    action: "void",
    eventId,
    idempotencyKey: randomUUID(),
  });
  const balances = async (owner) =>
    (await as(owner, listBankBalances)).map(
      (row) => row.calculatedAmount ?? row.amount,
    );

  let initialized = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
      initialized = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }

    await t.test(
      "CA-012, reintento concurrente, aislamiento y anulación exacta",
      async () => {
        const a = "f1-06-ca-012";
        const b = "f1-06-otro-titular";
        await initializePair(a);
        const input = command();
        const results = await Promise.all([save(a, input), save(a, input)]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "created",
          "replayed",
        ]);
        const [{ id }] = results;
        assert.equal(results[1].id, id);
        assert.deepEqual(
          await save(a, { ...input, destinationAmount: "99.0000" }),
          { status: "conflict" },
        );
        assert.deepEqual(await balances(a), ["6000.0000", "100.0000"]);
        assert.deepEqual(
          await as(a, (client, owner) =>
            listMovementTotals(client, owner, effectiveOn),
          ),
          [],
        );
        assert.deepEqual(await as(a, listRecentBankTransfers), [
          {
            id,
            effectiveOn,
            sourceCurrency: "UYU",
            sourceAmount: "4000.0000",
            destinationCurrency: "USD",
            destinationAmount: "100.0000",
          },
        ]);
        assert.deepEqual(await as(b, listRecentBankTransfers), []);
        assert.deepEqual(await revise(b, voidCommand(id)), {
          status: "not-found",
        });
        const undo = voidCommand(id);
        await assert.rejects(
          as(a, (client, owner) =>
            client.query(
              "UPDATE finance.financial_events SET status = 'voided' WHERE owner_id = $1 AND id = $2",
              [owner, id],
            ),
          ),
          { message: "Operación de datos rechazada" },
        );
        assert.deepEqual(await revise(a, undo), { status: "revised", id });
        assert.deepEqual(await revise(a, undo), { status: "replayed", id });
        assert.deepEqual(await revise(a, voidCommand(id)), {
          status: "inactive",
        });
        assert.deepEqual(await balances(a), ["10000.0000", "0.0000"]);
        assert.deepEqual(await as(a, listRecentBankTransfers), []);
        assert.deepEqual(
          (
            await as(a, (client, owner) =>
              client.query(
                "SELECT change_type FROM finance.audit_changes WHERE owner_id = $1 AND event_id = $2 ORDER BY change_type",
                [owner, id],
              ),
            )
          ).rows,
          [{ change_type: "created" }, { change_type: "voided" }],
        );
      },
    );

    await t.test(
      "dos cambios concurrentes no pueden consumir el mismo saldo",
      async () => {
        const a = "f1-06-concurrente";
        await initializePair(a);
        await init(a, "EUR");
        const results = await Promise.all([
          save(a, command({ sourceAmount: "8000.0000" })),
          save(
            a,
            command({ sourceAmount: "8000.0000", destinationCurrency: "EUR" }),
          ),
        ]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "created",
          "insufficient-funds",
        ]);
        assert.equal(
          results.find(({ status }) => status === "insufficient-funds")
            .shortfall,
          "6000.0000",
        );
        assert.equal((await balances(a))[0], "2000.0000");
        assert.equal((await as(a, listRecentBankTransfers)).length, 1);
      },
    );

    await t.test(
      "ambas monedas deben estar configuradas y un fallo del crédito revierte todo",
      async () => {
        const a = "f1-06-fallo";
        await init(a, "USD");
        assert.deepEqual(await save(a, command()), {
          status: "unconfigured",
          currency: "UYU",
        });
        await init(a, "UYU", "10000.0000");
        assert.deepEqual(
          await save(a, command({ destinationCurrency: "EUR" })),
          { status: "unconfigured", currency: "EUR" },
        );
        const input = command({ destinationAmount: "100.00001" });
        // Skip the HTTP parser deliberately to force a constraint failure in the second effect.
        await assert.rejects(save(a, input), {
          message: "Operación de datos rechazada",
        });
        assert.deepEqual(await balances(a), ["10000.0000", "0.0000"]);
        assert.deepEqual(await as(a, listRecentBankTransfers), []);
        assert.equal(
          (await save(a, { ...input, destinationAmount: "100.0000" })).status,
          "created",
        );
      },
    );

    await t.test(
      "una anulación con fondos ya utilizados conserva ambos efectos",
      async () => {
        const a = "f1-06-dependencia";
        await initializePair(a);
        const { id } = await save(a, command());
        await as(a, (client, owner) =>
          saveMovement(client, owner, {
            kind: "expense",
            currency: "USD",
            amount: "60.0001",
            effectiveOn,
            method: "debit",
            concept: "Gasto sintético",
            note: null,
            categoryId: null,
            idempotencyKey: randomUUID(),
          }),
        );
        assert.deepEqual(await revise(a, voidCommand(id)), {
          status: "insufficient-funds",
          currency: "USD",
          shortfall: "60.0001",
        });
        assert.deepEqual(await balances(a), ["6000.0000", "39.9999"]);
        assert.equal((await as(a, listRecentBankTransfers)).length, 1);
      },
    );

    await t.test(
      "cada moneda concilia su lado con su propia confirmación",
      async () => {
        const a = "f1-06-ancla";
        await initializePair(a);
        await as(a, (client, owner) =>
          saveBalanceAdjustment(client, owner, {
            currency: "UYU",
            amount: "6000.0000",
            asOfDate: "2026-03-01",
            note: null,
            idempotencyKey: randomUUID(),
          }),
        );
        const transfer = await save(
          a,
          command({ sourceAmount: "4000.1234", destinationAmount: "100.0001" }),
        );
        assert.equal(transfer.status, "created");
        assert.deepEqual(await balances(a), ["6000.0000", "100.0001"]);
        const [anchor] = await as(a, listBankCheckpoints);
        assert.equal(anchor.amount, "6000.0000");
        assert.equal(anchor.projection, "5999.8766");
        assert.equal(anchor.difference, "0.1234");
        assert.equal(
          (await revise(a, voidCommand(transfer.id))).status,
          "revised",
        );
        assert.deepEqual(await balances(a), ["6000.0000", "0.0000"]);
        const [after] = await as(a, listBankCheckpoints);
        assert.equal(after.id, anchor.id);
        assert.equal(after.amount, anchor.amount);
        assert.equal(after.difference, "-4000.0000");
      },
    );
  } finally {
    if (initialized)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
