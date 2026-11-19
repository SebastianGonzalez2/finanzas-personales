import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import {
  listBankBalances,
  listBankCheckpoints,
  saveBalanceAdjustment,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  findHistoryEntry,
  historyRevisions,
  listHistory,
} from "../../src/server/history.ts";
import {
  listMovementCategories,
  listMovementTotals,
  reviseMovement,
  saveBankTransfer,
  saveMovement,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const expense = (fields = {}) => ({
  kind: "expense",
  currency: "UYU",
  amount: "2000.0000",
  effectiveOn: "2025-02-04",
  method: "debit",
  concept: "Alquiler",
  note: null,
  categoryId: null,
  idempotencyKey: randomUUID(),
  ...fields,
});

test("F1-07: historial, revisiones completas y aislamiento", async (t) => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 3 });
  const as = (owner, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const init = (owner, currency, amount) =>
    as(owner, (c, id) =>
      saveOpeningBalance(c, id, { currency, amount, asOfDate: "2024-01-01" }),
    );
  const history = (owner, filters = {}) =>
    as(owner, (c, id) => listHistory(c, id, parseHistoryParams(filters)));
  const save = (owner, input) =>
    as(owner, (c, id) => saveMovement(c, id, input));
  const revise = (owner, input) =>
    as(owner, (c, id) => reviseMovement(c, id, input));
  const detail = (owner, eventId, checkpoint = false) =>
    as(owner, (c, id) => findHistoryEntry(c, id, eventId, checkpoint));
  const amounts = async (owner) =>
    (await as(owner, listBankBalances)).map(
      (b) => b.calculatedAmount ?? b.amount,
    );
  const adjust = (owner, currency, amount, asOfDate) =>
    as(owner, (c, id) =>
      saveBalanceAdjustment(c, id, {
        currency,
        amount,
        asOfDate,
        note: "Arqueo",
        idempotencyKey: randomUUID(),
      }),
    );
  const edit = (eventId, movement) => ({
    action: "edit",
    eventId,
    idempotencyKey: movement.idempotencyKey,
    movement,
  });
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
      "CA-017: combina filtros y pagina un mismo día sin repetir ni leer filas ajenas",
      async () => {
        const a = "f1-07-history-a";
        const b = "f1-07-history-b";
        await init(a, "UYU", "5000.0000");
        await init(b, "UYU", "100.0000");
        const categories = await as(a, listMovementCategories);
        const categoryId = categories.find(
          (category) => category.name === "Vivienda",
        ).id;
        const matches = [];
        for (let index = 0; index < 22; index++) {
          const { id } = await save(
            a,
            expense({
              categoryId,
              concept: index % 2 ? "ALQUILER %" : "Casa",
              note: "Alquiler % de prueba",
              amount: "4.3210",
              effectiveOn: "2025-10-20",
            }),
          );
          matches.push(id);
        }
        await save(
          a,
          expense({
            concept: "Alquiler % anterior",
            amount: "4.3210",
            categoryId,
            effectiveOn: "2024-10-20",
          }),
        );
        await save(
          a,
          expense({
            concept: "Alquiler sin porcentaje",
            amount: "4.3210",
            categoryId,
            effectiveOn: "2025-10-20",
          }),
        );
        const foreign = await save(
          b,
          expense({
            concept: "Alquiler % ajeno",
            amount: "4.3210",
            categoryId,
            effectiveOn: "2025-10-20",
          }),
        );
        const checkpoint = await adjust(a, "UYU", "4800.0000", "2025-11-01");
        assert.equal((await detail(a, checkpoint.id, true)).note, "Arqueo");
        assert.equal(await detail(b, checkpoint.id, true), undefined);
        assert.equal(await detail(a, foreign.id), undefined);
        const filters = {
          q: "alquiler %",
          from: "2025-10-01",
          to: "2025-10-31",
          currency: "UYU",
          kind: "expense",
          category: categoryId,
          method: "debit",
          min: "4,321",
          max: "4.3210",
        };
        const first = await history(a, filters);
        assert.equal(first.entries.length, 20);
        assert.equal(first.hasNextPage, true);
        const last = first.entries.at(-1);
        const second = await history(a, {
          ...filters,
          before: `${last.effectiveOn}.${last.id}.${last.kind}`,
        });
        assert.equal(second.hasNextPage, false);
        assert.deepEqual(
          [...first.entries, ...second.entries].map(({ id }) => id),
          matches.sort().reverse(),
        );
        assert.equal(
          (await history(a, { kind: "checkpoint", q: "arqueo" })).entries[0].id,
          checkpoint.id,
        );
        assert.equal((await history(a, { q: "anterior" })).entries.length, 1);
        assert.deepEqual(await amounts(a), ["4800.0000"]);
      },
    );

    await t.test(
      "edita fecha, moneda y metadatos conservando el ancla y la traza",
      async () => {
        const a = "f1-07-edit-a";
        const b = "f1-07-edit-b";
        await init(a, "UYU", "32000.0000");
        await init(a, "USD", "100.0000");
        const original = await save(a, expense());
        const anchor = await adjust(a, "UYU", "30000.0000", "2025-03-01");
        const input = edit(
          original.id,
          expense({
            currency: "USD",
            amount: "50.0001",
            effectiveOn: "2025-03-05",
            concept: "Renta",
            method: "transfer",
            note: "Corrección",
          }),
        );
        assert.deepEqual(await revise(b, input), { status: "not-found" });
        const results = await Promise.all([revise(a, input), revise(a, input)]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "replayed",
          "revised",
        ]);
        const [{ id }] = results;
        assert.equal(results[1].id, id);
        assert.deepEqual(
          await revise(a, {
            ...input,
            movement: { ...input.movement, concept: "Otro" },
          }),
          { status: "conflict" },
        );
        assert.deepEqual(await amounts(a), ["30000.0000", "49.9999"]);
        const [checkpoint] = await as(a, listBankCheckpoints);
        assert.equal(checkpoint.id, anchor.id);
        assert.equal(checkpoint.amount, "30000.0000");
        assert.equal(checkpoint.difference, "-2000.0000");
        assert.deepEqual(
          await as(a, (c, owner) => listMovementTotals(c, owner, "2025-02-01")),
          [],
        );
        assert.deepEqual(
          await as(a, (c, owner) => listMovementTotals(c, owner, "2025-03-01")),
          [{ kind: "expense", currency: "USD", amount: "50.0001" }],
        );
        assert.equal((await detail(a, original.id)).status, "corrected");
        assert.equal((await detail(a, id)).note, "Corrección");
        assert.equal(
          (await as(a, (c, owner) => historyRevisions(c, owner, id)))[0]
            .related,
          original.id,
        );
        assert.equal(
          (
            await as(a, (c, owner) => historyRevisions(c, owner, original.id))
          )[0].related,
          id,
        );
        const undo = {
          action: "void",
          eventId: id,
          idempotencyKey: randomUUID(),
        };
        assert.equal((await revise(a, undo)).status, "revised");
        assert.equal((await revise(a, undo)).status, "replayed");
        assert.equal((await detail(a, id)).status, "voided");
        assert.deepEqual(await amounts(a), ["30000.0000", "100.0000"]);
      },
    );

    await t.test(
      "edita ambos lados de un cambio, rechaza faltantes y conserva checkpoints",
      async () => {
        const owner = "f1-07-transfer";
        await init(owner, "UYU", "10000.0000");
        await init(owner, "USD", "0.0000");
        await init(owner, "EUR", "0.0000");
        const transfer = {
          kind: "bank_transfer",
          sourceCurrency: "UYU",
          sourceAmount: "4000.0000",
          destinationCurrency: "USD",
          destinationAmount: "100.0000",
          effectiveOn: "2025-05-01",
          idempotencyKey: randomUUID(),
        };
        const { id } = await as(owner, (c, o) =>
          saveBankTransfer(c, o, transfer),
        );
        await assert.rejects(
          as(owner, (client, ownerId) =>
            client.query(
              "UPDATE finance.financial_events SET status = 'corrected' WHERE owner_id = $1 AND id = $2",
              [ownerId, id],
            ),
          ),
          { message: "Operación de datos rechazada" },
        );
        await adjust(owner, "UYU", "6000.0000", "2025-06-01");
        await save(
          owner,
          expense({
            amount: "75.0000",
            currency: "USD",
            effectiveOn: "2025-06-02",
          }),
        );
        const replacement = {
          ...transfer,
          sourceAmount: "4200.0000",
          destinationAmount: "80.0000",
          idempotencyKey: randomUUID(),
        };
        const invalid = edit(id, {
          ...replacement,
          destinationCurrency: "EUR",
        });
        assert.deepEqual(await revise(owner, invalid), {
          status: "insufficient-funds",
          currency: "USD",
          shortfall: "75.0000",
        });
        assert.deepEqual(await amounts(owner), [
          "6000.0000",
          "25.0000",
          "0.0000",
        ]);
        assert.equal((await detail(owner, id)).status, "confirmed");
        const edited = await revise(owner, edit(id, replacement));
        assert.equal(edited.status, "revised");
        assert.equal((await detail(owner, id)).status, "corrected");
        assert.deepEqual(await amounts(owner), [
          "6000.0000",
          "5.0000",
          "0.0000",
        ]);
        assert.equal(
          (await as(owner, listBankCheckpoints))[0].difference,
          "200.0000",
        );
        assert.deepEqual(
          await as(owner, (c, o) => listMovementTotals(c, o, "2025-05-01")),
          [],
        );
        assert.equal(
          (await history(owner, { currency: "USD", min: "80", max: "80" }))
            .entries[0].id,
          edited.id,
        );
        assert.equal(
          (await history(owner, { currency: "UYU", min: "80", max: "80" }))
            .entries.length,
          0,
        );
      },
    );
    await t.test(
      "mover la fecha al día del ancla conserva la posición original y cruzarla aplica el débito",
      async () => {
        const owner = "f1-07-same-day";
        await init(owner, "UYU", "10000.0000");
        const original = await save(owner, expense());
        await adjust(owner, "UYU", "8000.0000", "2025-03-01");
        const sameDay = await revise(
          owner,
          edit(
            original.id,
            expense({ effectiveOn: "2025-03-01", amount: "1500.0000" }),
          ),
        );
        assert.equal(sameDay.status, "revised");
        assert.deepEqual(await amounts(owner), ["8000.0000"]);
        assert.equal(
          (await as(owner, listBankCheckpoints))[0].difference,
          "-500.0000",
        );
        // SIMP-02: la edición ya no depende de los fondos disponibles.
        await assert.rejects(
          as(owner, async (client, id) => {
            assert.equal(
              (
                await reviseMovement(
                  client,
                  id,
                  edit(
                    sameDay.id,
                    expense({ effectiveOn: "2025-03-02", amount: "8100.0000" }),
                  ),
                )
              ).status,
              "revised",
            );
            throw new Error("rollback sintético");
          }),
          /Operación de datos rechazada/,
        );
        const after = await revise(
          owner,
          edit(
            sameDay.id,
            expense({ effectiveOn: "2025-03-02", amount: "1500.0000" }),
          ),
        );
        assert.equal(after.status, "revised");
        assert.deepEqual(await amounts(owner), ["6500.0000"]);
        assert.equal(
          (await as(owner, listBankCheckpoints))[0].amount,
          "8000.0000",
        );
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
