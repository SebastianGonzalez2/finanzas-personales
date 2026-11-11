import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  createCatalogCategory,
  listCatalogCategories,
  listManagedCategories,
  resolveMovementCategory,
  setCategoryArchived,
} from "../../src/server/categories.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { findHistoryEntry } from "../../src/server/history.ts";
import { saveMovement } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-01: catálogo por titular, subcategorías, duplicados y archivo", async (t) => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 3 });
  let schemaReady = false;
  t.after(async () => {
    try {
      if (schemaReady)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  });
  const a = `catalog-a-${randomUUID()}`,
    b = `catalog-b-${randomUUID()}`;
  const run = (work, ownerId = a) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const archive = (id, archived, owner = a) =>
    run(
      (client, ownerId) =>
        setCategoryArchived(client, ownerId, { id, archived }),
      owner,
    );
  const category = (categoryId, owner = a) =>
    run(
      (client, ownerId) =>
        resolveMovementCategory(client, ownerId, "expense", categoryId),
      owner,
    );

  const admin = await pool.connect();
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
    schemaReady = true;
  } finally {
    await admin.query("ROLLBACK");
    admin.release();
  }

  // Creación de categoría y subcategoría del titular a.
  const top = await run((c, id) =>
    createCatalogCategory(c, id, {
      kind: "expense",
      name: "Mascotas",
      parentId: null,
    }),
  );
  assert.equal(top.status, "created");
  const sub = await run((c, id) =>
    createCatalogCategory(c, id, {
      kind: "expense",
      name: "Veterinario",
      parentId: top.id,
    }),
  );
  assert.equal(sub.status, "created");

  // Duplicados por nombre, sin importar mayúsculas.
  assert.equal(
    (
      await run((c, id) =>
        createCatalogCategory(c, id, {
          kind: "expense",
          name: "mascotas",
          parentId: null,
        }),
      )
    ).status,
    "conflict",
  );

  // Reglas de subcategoría: tipo distinto, dos niveles y padre inexistente.
  assert.equal(
    (
      await run((c, id) =>
        createCatalogCategory(c, id, {
          kind: "income",
          name: "Veterinario ingreso",
          parentId: top.id,
        }),
      )
    ).status,
    "invalid-parent",
  );
  assert.equal(
    (
      await run((c, id) =>
        createCatalogCategory(c, id, {
          kind: "expense",
          name: "Tercer nivel",
          parentId: sub.id,
        }),
      )
    ).status,
    "invalid-parent",
  );
  assert.equal(
    (
      await run((c, id) =>
        createCatalogCategory(c, id, {
          kind: "expense",
          name: "Huérfana",
          parentId: randomUUID(),
        }),
      )
    ).status,
    "invalid-parent",
  );

  // Catálogo del titular a: filas propias + sugerencias sin duplicar, sin archivadas.
  const archived = await run(async (c, id) => {
    const row = randomUUID();
    await c.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name,archived_at) VALUES ($1,$2,'expense','Ropa vieja',now())",
      [id, row],
    );
    return row;
  });
  const catalogA = await run((c, id) => listCatalogCategories(c, id));
  const mascotas = catalogA.find(({ name }) => name === "Mascotas");
  const veterinario = catalogA.find(({ name }) => name === "Veterinario");
  assert.ok(mascotas && mascotas.parentId === null);
  assert.ok(veterinario && veterinario.parentId === mascotas?.id);
  assert.ok(!catalogA.some(({ id }) => id === archived));
  const sugerencias = catalogA.filter(({ name }) => name === "Alimentación");
  assert.equal(sugerencias.length, 1);

  // Aislamiento: el titular b no ve filas de a y conserva sus sugerencias.
  const catalogB = await run((c, id) => listCatalogCategories(c, id), b);
  assert.ok(!catalogB.some(({ id }) => id === top.id || id === sub.id));
  assert.ok(!catalogB.some(({ name }) => name === "Mascotas"));
  assert.equal(await archive(top.id, true, b), "not-found");
  assert.equal(await category(sub.id, b), undefined);
  assert.equal(
    (
      await run(
        (c, id) =>
          createCatalogCategory(c, id, {
            kind: "expense",
            name: "Ajena",
            parentId: top.id,
          }),
        b,
      )
    ).status,
    "invalid-parent",
  );

  const food = sugerencias[0];
  const supermarket = catalogA.find(
    ({ parentId, name }) => parentId === food.id && name === "Supermercado",
  );
  assert.ok(supermarket);
  assert.equal(await archive(supermarket.id, true), "saved");
  assert.equal(await archive(food.id, true), "saved");
  assert.equal(await archive(supermarket.id, false), "archived-parent");
  assert.equal(await category(supermarket.id), undefined);
  assert.equal(await category(supermarket.id, b), supermarket.id);
  assert.equal(await archive(food.id, false), "saved");
  assert.equal(await category(supermarket.id), undefined);
  assert.equal(await archive(supermarket.id, false), "saved");
  assert.equal(await category(supermarket.id), supermarket.id);

  const race = await Promise.all(
    ["  Café   de prueba ", "CAFE\u0301 DE PRUEBA"].map((name) =>
      run((c, id) =>
        createCatalogCategory(c, id, { kind: "expense", name, parentId: null }),
      ),
    ),
  );
  assert.deepEqual(race.map(({ status }) => status).sort(), [
    "conflict",
    "created",
  ]);

  const effectiveOn = "2026-02-01";
  await run((c, id) =>
    saveOpeningBalance(c, id, {
      currency: "UYU",
      asOfDate: effectiveOn,
      amount: "1000.0000",
    }),
  );
  const expense = {
    kind: "expense",
    method: "debit",
    currency: "UYU",
    effectiveOn,
    amount: "25.0000",
    concept: "Gasto sintético",
    categoryId: sub.id,
    note: null,
    idempotencyKey: randomUUID(),
  };
  const save = (movement) => run((c, id) => saveMovement(c, id, movement));
  const original = await save(expense);
  assert.equal(original.status, "created");
  const before = await run(listBankBalances);

  let competing;
  await run(async (c, id) => {
    assert.equal(
      await setCategoryArchived(c, id, { id: top.id, archived: true }),
      "saved",
    );
    // The assignment may start now, but must validate after the archive commits.
    competing = save({ ...expense, idempotencyKey: randomUUID() });
  });
  assert.equal((await competing).status, "invalid-category");
  assert.equal((await save(expense)).status, "replayed");
  assert.equal(await archive(top.id, true), "saved");
  assert.ok(
    !(await run(listCatalogCategories)).some(({ id }) => id === sub.id),
  );
  assert.ok(
    (await run(listManagedCategories)).some(
      ({ id, archived }) => id === top.id && archived,
    ),
  );
  const historical = await run((c, id) =>
    findHistoryEntry(c, id, original.id, false),
  );
  assert.equal(historical.categoryId, sub.id);
  assert.equal(historical.category, "Veterinario");
  assert.deepEqual(await run(listBankBalances), before);
  assert.equal(await archive(top.id, false), "saved");
  assert.equal(await category(sub.id), sub.id);

  // RLS and column-level privileges apply independently of the server helpers.
  await run(async (c) => {
    assert.equal(
      (
        await c.query(
          "UPDATE finance.categories SET archived_at = now() WHERE owner_id = $1 AND id = $2",
          [a, top.id],
        )
      ).rowCount,
      0,
    );
  }, b);
  await assert.rejects(
    run((c, id) =>
      c.query(
        "UPDATE finance.categories SET name = 'Otro' WHERE owner_id = $1 AND id = $2",
        [id, top.id],
      ),
    ),
  );
  await assert.rejects(
    run((c, id) =>
      c.query(
        "DELETE FROM finance.categories WHERE owner_id = $1 AND id = $2",
        [id, sub.id],
      ),
    ),
  );
});
