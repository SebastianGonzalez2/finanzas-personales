import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { normalizeName } from "../../src/domain/catalog.ts";
import {
  findEventMerchant,
  listNameCatalog,
  nameCatalogReady,
  previewMerchantMerge,
  saveCatalogCommand,
  searchNameCatalog,
} from "../../src/server/catalog.ts";
import { listHistory } from "../../src/server/history.ts";
import {
  listMerchantTotals,
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
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

  let installed = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      const applied = await migrateInTransaction(admin);
      await admin.query("COMMIT");
      installed = applied.includes("0029_F5-03_catalogo_nombres.sql");
      assert.ok(installed);
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
    assert.equal(
      byName("merchant", "tienda inglesa", await catalog()).id,
      first.id,
    );

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

    const date = "2026-01-01";
    const spend = (merchantName, amount, idempotencyKey = randomUUID()) =>
      as(a, (client, owner) =>
        saveMovement(client, owner, {
          kind: "expense",
          currency: "UYU",
          amount,
          effectiveOn: date,
          method: "debit",
          concept: "Compra sintética",
          note: null,
          categoryId: null,
          merchantName,
          idempotencyKey,
        }),
      );
    const concurrent = await Promise.all([
      spend("Tda. Ing.", "10.0001"),
      create(a, merchantCommand("TDA. ING.")),
    ]);
    assert.equal(concurrent[0].status, "created");
    const source = concurrent[1];
    const targetPurchase = await spend("Tienda Inglesa", "20.0002");
    const pair = { sourceId: source.id, targetId: first.id };
    const preview = (owner = a, selection = pair) =>
      as(owner, (client, id) => previewMerchantMerge(client, id, selection));
    const merge = (plan, idempotencyKey = randomUUID()) => ({
      action: "merge",
      kind: "merchant",
      sourceId: plan.source.id,
      targetId: plan.target.id,
      sourceVersion: plan.source.version,
      targetVersion: plan.target.version,
      movementCount: plan.movementCount,
      idempotencyKey,
    });
    const plan = await preview();
    assert.equal(plan.movementCount, 2);
    assert.equal(await preview(b), null);
    assert.equal((await create(b, merge(plan))).status, "not-found");
    assert.equal((await spend("Tda. Ing.", "2.0000")).status, "created");
    assert.equal((await create(a, merge(plan))).status, "conflict");
    const confirmed = merge(await preview());
    assert.equal(confirmed.movementCount, 3);

    const total = () =>
      as(a, (client, owner) => listMovementTotals(client, owner, date));
    const amounts = await total();
    const outcomes = await Promise.all([
      create(a, confirmed),
      create(a, confirmed),
    ]);
    assert.deepEqual(outcomes.map(({ status }) => status).sort(), [
      "replayed",
      "saved",
    ]);
    assert.deepEqual(await total(), amounts);
    assert.deepEqual(
      await as(a, (client, owner) => listMerchantTotals(client, owner, date)),
      [
        {
          kind: "expense",
          currency: "UYU",
          amount: "32.0003",
          merchantId: first.id,
        },
      ],
    );
    assert.deepEqual(
      (await search(a, "merchant", "tda.")).map(({ id }) => id),
      [first.id],
    );
    assert.equal((await create(a, merchantCommand("Tda. Ing."))).id, first.id);
    assert.equal(
      (
        await create(a, {
          action: "restore",
          kind: "merchant",
          entryId: source.id,
          version: 2,
        })
      ).status,
      "not-found",
    );
    const history = (owner, merchant) =>
      as(owner, (client, id) =>
        listHistory(client, id, parseHistoryParams({ merchant })),
      );
    assert.equal((await history(a, first.id)).entries.length, 3);
    assert.equal((await history(a, source.id)).entries.length, 3);
    assert.deepEqual((await history(b, first.id)).entries, []);
    assert.equal(
      (
        await as(a, (client, owner) =>
          findEventMerchant(client, owner, concurrent[0].id),
        )
      ).id,
      first.id,
    );
    const second = { sourceId: first.id, targetId: other.id };
    assert.equal(
      (await create(a, merge(await preview(a, second)))).id,
      other.id,
    );
    assert.equal((await search(a, "merchant", "tda."))[0].id, other.id);
    const revised = await as(a, (client, owner) =>
      reviseMovement(client, owner, {
        action: "correct",
        eventId: targetPurchase.id,
        amount: "21.0002",
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(revised.status, "revised");
    assert.equal((await history(a, other.id)).entries.length, 4);
    assert.deepEqual(
      await as(a, (client, owner) => listMerchantTotals(client, owner, date)),
      [
        {
          kind: "expense",
          currency: "UYU",
          amount: "33.0003",
          merchantId: other.id,
        },
      ],
    );
    const audit = await as(a, (client) =>
      client.query(
        "SELECT entry_id, merged_source_id FROM finance.name_catalog_changes WHERE action = 'merge' ORDER BY created_at",
      ),
    );
    assert.deepEqual(audit.rows, [
      { entry_id: first.id, merged_source_id: source.id },
      { entry_id: other.id, merged_source_id: first.id },
    ]);
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
