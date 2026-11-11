import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  createCatalogCategory,
  listCatalogCategories,
} from "../../src/server/categories.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-01: catálogo por titular, subcategorías, duplicados y archivo", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 3 });
  const a = `catalog-a-${randomUUID()}`,
    b = `catalog-b-${randomUUID()}`;
  const run = (work, ownerId = a) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);

  const admin = await pool.connect();
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
  } finally {
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

  await pool.end();
});
