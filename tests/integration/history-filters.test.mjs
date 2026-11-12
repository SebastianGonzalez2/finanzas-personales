import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  historyPeriodFilter,
  historyPeriodRange,
  historyToday,
  parseHistoryParams,
} from "../../src/domain/history.ts";
import { saveOpeningBalance } from "../../src/server/bank-balances.ts";
import {
  listSavedFilters,
  saveSavedFilterCommand,
  savedFiltersReady,
} from "../../src/server/history-filters.ts";
import { listHistory } from "../../src/server/history.ts";
import { saveMovement } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F5-04: filtros guardados idempotentes, aislados y con período vigente", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const a = "f5-04-fixture-a";
  const b = "f5-04-fixture-b";
  const categoryId = randomUUID();

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
    assert.ok(await as(a, savedFiltersReady));

    const today = historyToday();
    const [year, month] = today.split("-").map(Number);
    const previous =
      month === 1
        ? `${year - 1}-12-28`
        : `${year}-${String(month - 1).padStart(2, "0")}-28`;
    await as(a, (client, owner) =>
      saveOpeningBalance(client, owner, {
        currency: "UYU",
        amount: "10000.0000",
        asOfDate: previous,
      }),
    );
    await as(a, (client) =>
      client.query(
        `INSERT INTO finance.categories (owner_id, id, kind, name)
         VALUES ($1, $2, 'expense', 'Ropa')`,
        [a, categoryId],
      ),
    );
    const saveExpense = (owner, effectiveOn, concept) =>
      as(owner, (client, ownerId) =>
        saveMovement(client, ownerId, {
          kind: "expense",
          currency: "UYU",
          amount: "100.0000",
          effectiveOn,
          method: "debit",
          concept,
          note: null,
          categoryId,
          idempotencyKey: randomUUID(),
        }),
      );
    const inMonth = await saveExpense(a, today, "Campera");
    const outOfMonth = await saveExpense(a, previous, "Campera anterior");
    assert.equal(inMonth.status, "created");
    assert.equal(outOfMonth.status, "created");

    const save = (owner, command) =>
      as(owner, (client, ownerId) =>
        saveSavedFilterCommand(client, ownerId, command),
      );
    const list = (owner) =>
      as(owner, (client, ownerId) => listSavedFilters(client, ownerId));

    // Alta con idempotencia por envío.
    const command = {
      action: "create",
      name: "Ropa mes actual",
      criteria: { period: "mes-actual", category: categoryId },
    };
    const firstKey = randomUUID();
    const created = await save(a, { ...command, idempotencyKey: firstKey });
    assert.equal(created.status, "created");
    const replayed = await save(a, { ...command, idempotencyKey: firstKey });
    assert.equal(replayed.status, "replayed");
    assert.equal(replayed.id, created.id);
    const keyReused = await save(a, {
      ...command,
      criteria: { period: "anio-actual" },
      idempotencyKey: firstKey,
    });
    assert.equal(keyReused.status, "conflict");
    const duplicateName = await save(a, {
      ...command,
      name: "ropa MES actual",
      idempotencyKey: randomUUID(),
    });
    assert.equal(duplicateName.status, "conflict");

    let [entry] = await list(a);
    assert.equal(entry.name, "Ropa mes actual");
    assert.equal(entry.version, 1);
    assert.deepEqual(entry.criteria, command.criteria);

    // Aislamiento por titular: B no ve ni puede tocar los filtros de A.
    assert.deepEqual(await list(b), []);
    const stranger = await save(b, {
      action: "rename",
      entryId: created.id,
      version: 1,
      name: "Robado",
      idempotencyKey: randomUUID(),
    });
    assert.equal(stranger.status, "not-found");

    // Renombrar exige la versión vigente; el nombre duplicado se rechaza.
    const stale = await save(a, {
      action: "rename",
      entryId: created.id,
      version: 7,
      name: "Ropa del mes",
      idempotencyKey: randomUUID(),
    });
    assert.equal(stale.status, "conflict");
    const renamed = await save(a, {
      action: "rename",
      entryId: created.id,
      version: entry.version,
      name: "Ropa del mes",
      idempotencyKey: randomUUID(),
    });
    assert.equal(renamed.status, "saved");
    [entry] = await list(a);
    assert.equal(entry.name, "Ropa del mes");
    assert.equal(entry.version, 2);

    const replaced = await save(a, {
      action: "update-criteria",
      entryId: created.id,
      version: entry.version,
      criteria: { period: "mes-anterior", category: categoryId },
      idempotencyKey: randomUUID(),
    });
    assert.equal(replaced.status, "saved");
    [entry] = await list(a);
    assert.equal(entry.version, 3);
    assert.equal(entry.criteria.period, "mes-anterior");

    // Borrado con versión vigente; el libro de comandos se conserva.
    const removed = await save(a, {
      action: "delete",
      entryId: created.id,
      version: entry.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(removed.status, "saved");
    assert.deepEqual(await list(a), []);
    const gone = await save(a, {
      action: "delete",
      entryId: created.id,
      version: entry.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(gone.status, "not-found");

    // CA-058: el filtro «mes actual» consulta el mes vigente en cada
    // consulta; el rango se resuelve al aplicar, no al crear.
    const parsed = parseHistoryParams({
      period: "mes-actual",
      category: categoryId,
    });
    assert.ok(!("error" in parsed));
    const applyPeriod = (base, period, reference) => ({
      ...base,
      filters: {
        ...base.filters,
        ...historyPeriodRange(
          historyPeriodFilter(base.filters.period),
          reference,
        ),
        period,
      },
    });
    const currentResults = await as(a, (client, owner) =>
      listHistory(client, owner, applyPeriod(parsed, "mes-actual", today)),
    );
    assert.deepEqual(
      currentResults.entries.map((row) => row.concept),
      ["Campera"],
    );
    const previousQuery = parseHistoryParams({
      period: "mes-anterior",
      category: categoryId,
    });
    assert.ok(!("error" in previousQuery));
    const previousResults = await as(a, (client, owner) =>
      listHistory(
        client,
        owner,
        applyPeriod(previousQuery, "mes-anterior", today),
      ),
    );
    assert.deepEqual(
      previousResults.entries.map((row) => row.concept),
      ["Campera anterior"],
    );
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance,finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
