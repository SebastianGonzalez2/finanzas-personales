import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { normalizeName } from "../../src/domain/catalog.ts";
import {
  listNameCatalog,
  nameCatalogReady,
  saveCatalogCommand,
  searchNameCatalog,
} from "../../src/server/catalog.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-03: CA-054/CA-055, autocompletado, archivo reversible y aislamiento con PostgreSQL", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const a = "f5-03-fixture-a";
  const b = "f5-03-fixture-b";
  const create = (ownerId, command) =>
    as(ownerId, (client, owner) =>
      saveCatalogCommand(client, owner, {
        ...command,
        idempotencyKey: command.idempotencyKey ?? randomUUID(),
      }),
    );
  const search = (ownerId, kind, query) =>
    as(ownerId, (client, owner) =>
      searchNameCatalog(client, owner, kind, query),
    );
  const catalog = () => as(a, listNameCatalog);
  const byName = (kind, name, entries) =>
    entries.find(
      (entry) =>
        entry.kind === kind &&
        normalizeName(name) === normalizeName(entry.name),
    );
  const merchantCommand = (name, idempotencyKey) => ({
    action: "create",
    kind: "merchant",
    name,
    ...(idempotencyKey && { idempotencyKey }),
  });

  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      const applied = await migrateInTransaction(admin);
      await admin.query("COMMIT");
      assert.ok(applied.includes("0023_F5-03_catalogo_nombres.sql"));
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }
    assert.equal(await as(a, nameCatalogReady), true);

    // CA-054: variaciones tipográficas del mismo nombre no crean duplicados.
    const first = await create(a, merchantCommand("Tienda Inglesa"));
    assert.deepEqual(first, { status: "created", id: first.id });
    for (const variant of [
      "tienda inglesa",
      "TIENDA   INGLESA",
      "Tienda Inglesa ",
    ])
      assert.deepEqual(await create(a, merchantCommand(variant)), first);
    assert.equal(byName("merchant", "tienda", await catalog()).id, first.id);

    // El mismo nombre en tipos distintos no se comparte.
    const person = await create(a, {
      action: "create",
      kind: "person",
      name: "Tienda Inglesa",
    });
    assert.equal(person.status, "created");
    assert.notEqual(person.id, first.id);

    // Otra entrada nueva distinta se agrega; con la misma clave y otra data,
    // el envío entra en conflicto (idempotencia por envío).
    const other = await create(a, merchantCommand("Almacén del barrio"));
    assert.deepEqual(other, { status: "created", id: other.id });
    assert.deepEqual(
      await create(a, merchantCommand("Almacén del barrio")),
      other,
    );
    const key = randomUUID();
    assert.deepEqual(await create(a, merchantCommand("Uno", key)), {
      status: "created",
      id: byName("merchant", "uno", await catalog()).id,
    });
    assert.deepEqual(await create(a, merchantCommand("Dos", key)), {
      status: "conflict",
      message: "Este envío ya se usó con otros datos.",
    });

    // El autocompletado sugiere por prefijo normalizado y solo entradas activas.
    for (const query of ["tienda", "TIENDA", "  tienda "])
      assert.deepEqual(
        (await search(a, "merchant", query)).map(({ id }) => id),
        [first.id],
      );
    assert.deepEqual(
      (await search(a, "merchant", "almacén")).map(({ id }) => id),
      [other.id],
    );
    assert.deepEqual(await search(a, "merchant", "peña"), []);

    // CA-055: archivo reversible con verificación de versión.
    assert.deepEqual(
      await as(a, (client, owner) =>
        saveCatalogCommand(client, owner, {
          action: "archive",
          kind: "merchant",
          entryId: first.id,
          version: 99,
          idempotencyKey: randomUUID(),
        }),
      ).then(({ status }) => status),
      "conflict",
    );
    assert.deepEqual(
      await as(a, (client, owner) =>
        saveCatalogCommand(client, owner, {
          action: "archive",
          kind: "merchant",
          entryId: first.id,
          version: 1,
          idempotencyKey: randomUUID(),
        }),
      ),
      { status: "saved", id: first.id },
    );
    assert.equal(
      (await catalog()).find(({ id }) => id === first.id).archived,
      true,
    );
    assert.deepEqual(
      (await search(a, "merchant", "tienda")).map(({ id }) => id),
      [],
    );
    // Un alta sobre un nombre archivado no lo reactiva ni crea otra fila.
    assert.deepEqual(await create(a, merchantCommand("tienda inglesa")), {
      status: "conflict",
      message:
        "Ese nombre está archivado. Restauralo desde el catálogo para volver a usarlo.",
    });

    assert.deepEqual(
      await as(a, (client, owner) =>
        saveCatalogCommand(client, owner, {
          action: "restore",
          kind: "merchant",
          entryId: first.id,
          version: 2,
          idempotencyKey: randomUUID(),
        }),
      ),
      { status: "saved", id: first.id },
    );
    assert.equal(
      (await catalog()).find(({ id }) => id === first.id).archived,
      false,
    );
    assert.deepEqual(await create(a, merchantCommand("tienda inglesa")), first);

    // Aislamiento por titular: B no ve ni puede tocar entradas de A.
    assert.deepEqual(await as(b, listNameCatalog), []);
    assert.deepEqual(await search(b, "merchant", "tienda"), []);
    assert.deepEqual(
      await as(b, (client, owner) =>
        saveCatalogCommand(client, owner, {
          action: "archive",
          kind: "merchant",
          entryId: first.id,
          version: 3,
          idempotencyKey: randomUUID(),
        }),
      ),
      { status: "not-found" },
    );

    // El libro de cambios del titular registra alta, archivo y restauración.
    const { rows } = await as(a, (client) =>
      client.query(
        "SELECT action FROM finance.name_catalog_changes ORDER BY created_at, version",
      ),
    );
    const count = (action) =>
      rows.filter(({ action: row }) => row === action).length;
    assert.ok(count("create") >= 3);
    assert.equal(count("archive"), 1);
    assert.equal(count("restore"), 1);
  } finally {
    await pool.end();
  }
});
