import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseClassificationCommand } from "../../src/domain/classification.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { listBudgets, saveBudget } from "../../src/server/budgets.ts";
import {
  listTags,
  readClassification,
  saveClassification,
  saveTag,
} from "../../src/server/classification.ts";
import { listHistory } from "../../src/server/history.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-02 CA-052/056: asignaciones exactas, un efecto real, presupuestos, etiquetas y aislamiento A/B", async () => {
  const pool = new pg.Pool(testDatabaseConfig());
  const [
    a,
    b,
    parent,
    child,
    salary,
    italy,
    vacation,
    foreignTag,
    foreignCategory,
    opsA,
    opsB,
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
      for (const [id, name, kind, root] of [
        [parent, "Viajes", "expense", null],
        [child, "Transporte", "expense", parent],
        [opsA, "Operación A", "expense", null],
        [opsB, "Operación B", "expense", null],
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
      amount: "55000",
      idempotencyKey: receipt,
      allocations: [
        { categoryId: opsA, amount: "50000" },
        { categoryId: opsB, amount: "5000" },
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
          allocations: [{ categoryId: opsA, amount: "55000" }],
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
    // Gasto del mes por categoría (misma fuente que Estadísticas y Presupuestos).
    const group = (tags = []) =>
      as(
        async (c, owner) =>
          (
            await c.query(
              `SELECT x.category_id AS "categoryId", grouping(x.category_id) = 1 AS total,
                    sum(x.amount)::text AS amount
               FROM finance.budget_expenses x
              WHERE x.owner_id = $1 AND x.effective_on >= '2026-02-01'
                AND x.effective_on < '2026-03-01'
                AND (cardinality($2::uuid[]) = 0 OR EXISTS (
                  SELECT 1 FROM finance.current_event_tags t
                   WHERE (t.owner_id, t.event_id) = ($1, x.event_id) AND t.tag_id = ANY($2)))
              GROUP BY ROLLUP (x.category_id)`,
              [owner, tags],
            )
          ).rows,
      );
    const global = (rows) =>
      rows
        .filter(({ total }) => total)
        .map(({ amount }) => ["expense", amount]);
    assert.deepEqual(global(await group()), [["expense", "55500.0000"]]);
    assert.deepEqual(global(await group([italy, vacation])), [
      ["expense", "500.0000"],
    ]);
    assert.equal(
      (await group()).find(({ categoryId }) => categoryId === opsB).amount,
      "5000.0000",
    );
    assert.equal(
      (await group()).find(({ categoryId }) => categoryId === opsA).amount,
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
    const updated = await budgetRows();
    assert.equal(
      updated.find(({ categoryId }) => categoryId === parent).progress.consumed,
      "500.0000",
    );
    assert.equal(
      updated.find(({ categoryId }) => categoryId === child).progress.consumed,
      "80.0000",
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
    const totals = await as((c, owner) =>
      listMovementTotals(c, owner, "2026-02-01"),
    );
    assert.equal(
      totals.find(({ kind }) => kind === "expense").amount,
      "55501.0000",
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
