import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseClassificationCommand } from "../../src/domain/classification.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { listBudgets, saveBudget } from "../../src/server/budgets.ts";
import { categoryTotals } from "../../src/server/category-totals.ts";
import {
  listTags,
  readClassification,
  saveClassification,
  saveTag,
} from "../../src/server/classification.ts";
import {
  listPositions,
  saveCreditOperation,
} from "../../src/server/credit-operations.ts";
import { listHistory } from "../../src/server/history.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { getPurchaseRefunds } from "../../src/server/refunds.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-02: asignaciones exactas, un efecto real, presupuestos, etiquetas y aislamiento A/B", async () => {
  const pool = new pg.Pool(testDatabaseConfig());
  const [
    a,
    b,
    parent,
    child,
    bonus,
    salary,
    italy,
    vacation,
    foreignTag,
    foreignCategory,
    cardId,
  ] = Array.from({ length: 11 }, () => randomUUID());
  const as = (work, ownerId = a) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const today = "2026-02-04";
  const save = (fields) => {
    const input = parseMovement(
      {
        idempotencyKey: randomUUID(),
        kind: "expense",
        method: "debit",
        amount: "500.0000",
        currency: "UYU",
        effectiveOn: today,
        concept: "Compra sintética",
        ...fields,
      },
      today,
    );
    assert.ok(!("error" in input), input.error);
    return as((c, owner) => saveMovement(c, owner, input));
  };
  const edit = (fields, actor = a) => {
    const input = parseClassificationCommand({
      idempotencyKey: randomUUID(),
      ...fields,
    });
    assert.ok(!("error" in input), input.error);
    return as((c, owner) => saveClassification(c, owner, input), actor);
  };
  let installed = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
      installed = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }
    await as(async (c, owner) => {
      await saveOpeningBalance(c, owner, {
        currency: "UYU",
        amount: "100.0000",
        asOfDate: "2026-02-01",
      });
      for (const [id, name, kind, root] of [
        [parent, "Viajes", "expense", null],
        [child, "Transporte", "expense", parent],
        [bonus, "Bonificación", "income", null],
        [salary, "Sueldo", "income", null],
      ])
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind,parent_id) VALUES($1,$2,$3,$4,$5)",
          [owner, id, name, kind, root],
        );
      for (const [id, name] of [
        [italy, "Italia"],
        [vacation, "Vacaciones"],
      ])
        assert.deepEqual(
          await saveTag(c, owner, { action: "create", id, name }),
          { id },
        );
      for (const categoryId of [parent, child]) {
        const result = await saveBudget(
          c,
          owner,
          {
            action: "save",
            idempotencyKey: randomUUID(),
            categoryId,
            currency: "UYU",
            amount: "700.0000",
          },
          today,
        );
        assert.equal(result.status, "created");
      }
      await c.query(
        "INSERT INTO finance.cards(owner_id,id,kind,name) VALUES($1,$2,'credit','Tarjeta sintética')",
        [owner, cardId],
      );
      await c.query(
        "INSERT INTO finance.card_currencies(owner_id,card_id,kind,currency) VALUES($1,$2,'credit','UYU')",
        [owner, cardId],
      );
    });
    await as(async (c, owner) => {
      await saveTag(c, owner, {
        action: "create",
        id: foreignTag,
        name: "Privada",
      });
      await c.query(
        "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES($1,$2,'expense','Privada')",
        [owner, foreignCategory],
      );
    }, b);

    const receipt = randomUUID();
    const income = {
      kind: "income",
      method: "deposit",
      amount: "55000",
      idempotencyKey: receipt,
      allocations: [
        { categoryId: salary, amount: "50000" },
        { categoryId: bonus, amount: "5000" },
      ],
    };
    const retries = await Promise.all([save(income), save(income)]);
    assert.deepEqual(retries.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    const incomeId = retries[0].id;
    assert.equal(
      (
        await save({
          ...income,
          allocations: [{ categoryId: salary, amount: "55000" }],
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (await save({ tagIds: [foreignTag] })).status,
      "invalid-classification",
    );
    assert.equal(
      (
        await save({
          allocations: [{ categoryId: foreignCategory, amount: "500" }],
        })
      ).status,
      "invalid-classification",
    );
    assert.equal(
      (await save({ allocations: [{ categoryId: salary, amount: "500" }] }))
        .status,
      "invalid-classification",
    );
    const spend = await save({
      tagIds: [vacation, italy, italy],
      allocations: [
        { categoryId: child, amount: "349,9999" },
        { categoryId: null, amount: "150.0001" },
      ],
    });
    assert.equal(spend.status, "created");
    const eventId = spend.id;
    const opening = await as((c, owner) => listBankBalances(c, owner));
    assert.equal(opening[0].calculatedAmount, "54600.0000");
    const group = (tags = []) =>
      as((c, owner) => categoryTotals(c, owner, "2026-02-01", tags));
    const global = (rows) =>
      rows
        .filter(({ total }) => total)
        .map(({ kind, amount }) => [kind, amount]);
    assert.deepEqual(global(await group()), [
      ["expense", "500.0000"],
      ["income", "55000.0000"],
    ]);
    assert.deepEqual(global(await group([italy, vacation])), [
      ["expense", "500.0000"],
    ]);
    assert.equal(
      (await group()).find(({ categoryId }) => categoryId === bonus).amount,
      "5000.0000",
    );
    assert.equal(
      (await group()).find(({ categoryId }) => categoryId === salary).amount,
      "50000.0000",
    );
    const budgetRows = () => as((c, owner) => listBudgets(c, owner, "2026-02"));
    assert.deepEqual(
      (await budgetRows()).map(({ progress }) => progress.consumed),
      ["349.9999", "349.9999"],
    );
    const history = (filters, actor = a) =>
      as(
        (c, owner) => listHistory(c, owner, parseHistoryParams(filters)),
        actor,
      );
    assert.deepEqual(
      (await history({ category: child, tags: [italy, vacation] })).entries.map(
        ({ id }) => id,
      ),
      [eventId],
    );
    assert.deepEqual(
      (await history({ category: "none" })).entries.map(({ id }) => id),
      [eventId],
    );
    assert.deepEqual(
      (await history({ tags: [italy, vacation] }, b)).entries,
      [],
    );
    assert.equal(
      (await edit({ eventId, version: 1, tagIds: [] }, b)).status,
      404,
    );
    assert.equal(
      (await edit({ eventId, version: 1, tagIds: [foreignTag] })).status,
      400,
    );
    assert.equal(
      (
        await edit({
          eventId,
          version: 1,
          allocations: [{ categoryId: parent, amount: "499.9999" }],
        })
      ).status,
      400,
    );
    const revision = {
      eventId,
      version: 1,
      idempotencyKey: randomUUID(),
      allocations: [
        { categoryId: parent, amount: "420" },
        { categoryId: child, amount: "80" },
      ],
    };
    assert.deepEqual(await Promise.all([edit(revision), edit(revision)]), [
      { id: eventId },
      { id: eventId },
    ]);
    assert.equal(
      (await edit({ ...revision, idempotencyKey: randomUUID() })).status,
      409,
    );
    assert.deepEqual(
      await as((c, owner) => listBankBalances(c, owner)),
      opening,
    );
    const updated = await budgetRows();
    assert.equal(
      updated.find(({ categoryId }) => categoryId === parent).progress.consumed,
      "500.0000",
    );
    assert.equal(
      updated.find(({ categoryId }) => categoryId === child).progress.consumed,
      "80.0000",
    );
    const refund = await as((c, owner) =>
      getPurchaseRefunds(c, owner, eventId),
    );
    assert.deepEqual(
      refund.parts.map(({ categoryId, amount }) => [categoryId, amount]),
      [
        [child, "80.0000"],
        [parent, "420.0000"],
      ],
    );
    assert.deepEqual(
      await as((c, owner) =>
        saveTag(c, owner, { action: "archive", id: italy, version: 1 }),
      ),
      { id: italy },
    );
    assert.equal(
      (await as((c, owner) => listTags(c, owner))).find(
        ({ id }) => id === italy,
      ).archived,
      true,
    );
    assert.deepEqual(global(await group([italy])), [["expense", "500.0000"]]);
    assert.equal(
      (await save({ tagIds: [italy] })).status,
      "invalid-classification",
    );

    const replacement = await as((c, owner) =>
      reviseMovement(c, owner, {
        action: "edit",
        eventId,
        idempotencyKey: randomUUID(),
        classificationVersion: 2,
        movement: {
          kind: "expense",
          method: "debit",
          amount: "501.0000",
          currency: "UYU",
          effectiveOn: today,
          concept: "Compra corregida",
          note: null,
          categoryId: null,
          idempotencyKey: randomUUID(),
          allocations: [{ categoryId: child, amount: "501.0000" }],
        },
      }),
    );
    assert.equal(replacement.status, "revised");
    const snapshot = await as((c, owner) =>
      readClassification(c, owner, replacement.id),
    );
    assert.deepEqual(snapshot.tagIds, [italy, vacation].sort());
    assert.equal(snapshot.allocations[0].amount, "501.0000");
    assert.deepEqual(global(await group([italy])), [["expense", "501.0000"]]);
    const credit = await as((c, owner) =>
      saveCreditOperation(c, owner, {
        action: "purchase",
        cardId,
        amount: "12.0000",
        currency: "UYU",
        effectiveOn: today,
        concept: "Compra crédito",
        categoryId: null,
        note: null,
        covered: false,
        idempotencyKey: randomUUID(),
        allocations: [
          { categoryId: child, amount: "2.0000" },
          { categoryId: parent, amount: "10.0000" },
        ],
      }),
    );
    assert.equal(credit.status, "created");
    assert.equal(
      (await as((c, owner) => listPositions(c, owner, cardId))).get("UYU").debt,
      "12.0000",
    );
    const totals = await as((c, owner) =>
      listMovementTotals(c, owner, "2026-02-01"),
    );
    assert.equal(
      totals.find(({ kind }) => kind === "expense").amount,
      "513.0000",
    );

    const effects = await as(
      async (c, owner) =>
        (
          await c.query(
            "SELECT count(*)::int AS count FROM finance.bank_effects WHERE owner_id=$1 AND event_id=$2",
            [owner, incomeId],
          )
        ).rows[0].count,
    );
    assert.equal(effects, 1);
    await assert.rejects(
      as((c, owner) =>
        c.query(
          `INSERT INTO finance.classification_changes(owner_id,event_id,version,idempotency_key,command_hash,allocated_total)
       VALUES ($1,$2,2,$3,repeat('a',64),55000)`,
          [owner, incomeId, randomUUID()],
        ),
      ),
      /Operación de datos rechazada/,
    );
    assert.equal(
      (await as((c, owner) => readClassification(c, owner, incomeId))).version,
      1,
    );
    await assert.rejects(
      as(async (c, owner) => {
        await c.query(
          `INSERT INTO finance.classification_changes(owner_id,event_id,version,idempotency_key,command_hash)
         VALUES ($1,$2,2,$3,repeat('b',64))`,
          [owner, incomeId, randomUUID()],
        );
        await c.query(
          "INSERT INTO finance.event_tags(owner_id,event_id,version,tag_id) VALUES($1,$2,2,$3)",
          [owner, incomeId, foreignTag],
        );
      }),
      /Operación de datos rechazada/,
    );
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance,finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
