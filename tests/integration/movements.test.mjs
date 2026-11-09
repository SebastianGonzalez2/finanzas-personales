import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listMovementCategories,
  listMovementTotals,
  listRecentMovements,
  saveMovement,
} from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F1-03: CA-008 a CA-010, aislamiento, reintentos y anclas con PostgreSQL", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const a = "f1-03-fixture-a";
  const b = "f1-03-fixture-b";
  const opening = {
    currency: "UYU",
    amount: "10000.0000",
    asOfDate: "2026-02-01",
  };
  const usd = {
    currency: "USD",
    amount: "100.0000",
    asOfDate: opening.asOfDate,
  };
  const expense = {
    kind: "expense",
    currency: "UYU",
    amount: "1500.0000",
    effectiveOn: opening.asOfDate,
    method: "debit",
    concept: "Compra",
    note: "Nota de prueba",
    categoryId: null,
    idempotencyKey: randomUUID(),
  };
  const save = (owner, command) =>
    as(owner, (client, ownerId) => saveMovement(client, ownerId, command));
  const balances = () => as(a, listBankBalances);
  const recent = (owner, kind) =>
    as(owner, (client, ownerId) => listRecentMovements(client, ownerId, kind));
  const totals = () =>
    as(a, (client, ownerId) =>
      listMovementTotals(client, ownerId, opening.asOfDate),
    );

  let ownsSchema = false;
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
      ownsSchema = true;
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }

    assert.deepEqual(await save(a, expense), { status: "unconfigured" });
    await as(a, async (client, ownerId) => {
      await saveOpeningBalance(client, ownerId, opening);
      await saveOpeningBalance(client, ownerId, usd);
    });
    await as(b, (client, ownerId) =>
      saveOpeningBalance(client, ownerId, opening),
    );

    const [first, second] = await Promise.all([
      save(a, expense),
      save(a, expense),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [
      "created",
      "replayed",
    ]);
    assert.equal(first.id, second.id);
    assert.deepEqual(await save(a, { ...expense, amount: "1.0000" }), {
      status: "conflict",
    });
    assert.deepEqual(await balances(), [
      { ...opening, calculatedAmount: "8500.0000" },
      usd,
    ]);
    assert.deepEqual(await totals(), [
      { kind: "expense", currency: "UYU", amount: "1500.0000" },
    ]);
    assert.deepEqual(await recent(a, "expense"), [
      {
        id: first.id,
        kind: "expense",
        currency: "UYU",
        amount: "1500.0000",
        effectiveOn: opening.asOfDate,
        method: "debit",
        concept: "Compra",
        note: "Nota de prueba",
        category: null,
      },
    ]);
    assert.deepEqual(await recent(b, "expense"), []);
    assert.deepEqual(await as(b, listBankBalances), [opening]);

    const categories = await as(a, listMovementCategories);
    const salary = categories.find(({ name }) => name === "Sueldo");
    const income = {
      ...expense,
      kind: "income",
      method: "deposit",
      concept: "",
      note: null,
      amount: "5000.0000",
      categoryId: salary.id,
      idempotencyKey: randomUUID(),
    };
    assert.equal((await save(a, income)).status, "created");
    assert.deepEqual(await balances(), [
      { ...opening, calculatedAmount: "13500.0000" },
      usd,
    ]);
    const competing = Array.from({ length: 2 }, () => ({
      ...expense,
      amount: "6000.0000",
      idempotencyKey: randomUUID(),
    }));
    const results = await Promise.all(
      competing.map((command) => save(b, command)),
    );
    assert.deepEqual(results.map(({ status }) => status).sort(), [
      "created",
      "insufficient-funds",
    ]);
    assert.deepEqual(
      results.find(({ status }) => status === "insufficient-funds"),
      {
        status: "insufficient-funds",
        shortfall: "2000.0000",
      },
    );
    const accepted = results.findIndex(({ status }) => status === "created");
    assert.deepEqual(await save(b, competing[accepted]), {
      ...results[accepted],
      status: "replayed",
    });
    assert.deepEqual(await as(b, listBankBalances), [
      { ...opening, calculatedAmount: "4000.0000" },
    ]);
    assert.equal((await recent(b, "expense")).length, 1);
    assert.equal((await recent(a, "income"))[0].concept, "Ingreso");
    assert.equal((await recent(a, "income"))[0].category, "Sueldo");
    assert.deepEqual(
      (await totals()).sort((x, y) => x.kind.localeCompare(y.kind)),
      [
        { kind: "expense", currency: "UYU", amount: "1500.0000" },
        { kind: "income", currency: "UYU", amount: "5000.0000" },
      ],
    );

    const foreign = randomUUID();
    const archived = randomUUID();
    await as(b, (client, ownerId) =>
      client.query(
        "INSERT INTO finance.categories (owner_id,id,kind,name) VALUES ($1,$2,'expense','Privada')",
        [ownerId, foreign],
      ),
    );
    await as(a, (client, ownerId) =>
      client.query(
        "INSERT INTO finance.categories (owner_id,id,kind,name,archived_at) VALUES ($1,$2,'expense','Archivada',now())",
        [ownerId, archived],
      ),
    );
    for (const categoryId of [foreign, archived, salary.id])
      assert.deepEqual(
        await save(a, { ...expense, categoryId, idempotencyKey: randomUUID() }),
        { status: "invalid-category" },
      );
    assert.ok(
      !(await as(a, listMovementCategories)).some(({ id }) =>
        [foreign, archived].includes(id),
      ),
    );
    assert.deepEqual(
      await as(b, (client) =>
        saveMovement(client, a, { ...expense, idempotencyKey: randomUUID() }),
      ),
      { status: "unconfigured" },
    );
    let foreignKeyChecked = false;
    await assert.rejects(
      as(a, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO finance.financial_events
         (owner_id,id,kind,concept,effective_on,idempotency_key,command_hash)
         VALUES ($1,$2,'expense','Fixture FK','2026-02-01',$2,repeat('a',64))`,
          [a, id],
        );
        await assert.rejects(
          client.query(
            "INSERT INTO finance.ordinary_movements(owner_id,event_id,category_id,method) VALUES ($1,$2,$3,'debit')",
            [a, id, foreign],
          ),
          {
            code: "23503",
            constraint: "ordinary_movements_owner_id_category_id_fkey",
          },
        );
        foreignKeyChecked = true;
        throw new Error("fixture de rollback");
      }),
    );
    assert.ok(foreignKeyChecked);

    const historical = {
      ...expense,
      method: "transfer",
      effectiveOn: "2026-01-31",
      idempotencyKey: randomUUID(),
    };
    await assert.rejects(
      as(a, async (client, ownerId) => {
        assert.equal(
          (await saveMovement(client, ownerId, historical)).status,
          "created",
        );
        throw new Error("fixture de rollback");
      }),
    );
    assert.equal((await recent(a, "expense")).length, 1);
    assert.equal((await save(a, historical)).status, "created");
    assert.equal((await recent(a, "expense")).length, 2);
    assert.deepEqual(await balances(), [
      { ...opening, calculatedAmount: "13500.0000" },
      usd,
    ]);
    await as(a, async (client) => {
      const {
        rows: [counts],
      } = await client.query(`
        SELECT (SELECT count(*)::int FROM finance.financial_events) AS events,
               (SELECT count(*)::int FROM finance.ordinary_movements) AS movements,
               (SELECT count(*)::int FROM finance.bank_effects) AS effects,
               (SELECT count(*)::int FROM finance.audit_changes WHERE change_type = 'created') AS audits
      `);
      assert.deepEqual(counts, {
        events: 3,
        movements: 3,
        effects: 3,
        audits: 3,
      });
    });
  } finally {
    try {
      if (ownsSchema)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
