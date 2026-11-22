import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { listBudgets, saveBudget } from "../../src/server/budgets.ts";
import { saveMovement } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-06 CA-043: historial, jerarquía, cuotas fijas, RLS, reintentos y concurrencia real", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 5 });
  const a = `budget-a-${randomUUID()}`,
    b = `budget-b-${randomUUID()}`;
  const parent = randomUUID(),
    child = randomUUID();
  const run = (work, ownerId = a) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const save = (data, today = "2026-11-10", owner = a) => {
    const command = parseBudgetCommand(
      { idempotencyKey: randomUUID(), ...data },
      today,
    );
    assert.ok(!("error" in command));
    return run((c, id) => saveBudget(c, id, command, today), owner);
  };
  const list = (month, owner = a) =>
    run((c, id) => listBudgets(c, id, month), owner);
  const expense = (
    categoryId,
    amount,
    currency = "UYU",
    effectiveOn = "2026-11-10",
  ) =>
    run((c, id) =>
      saveMovement(c, id, {
        kind: "expense",
        currency,
        amount,
        effectiveOn,
        method: "debit",
        concept: "Sintético F3-06",
        note: null,
        categoryId,
        idempotencyKey: randomUUID(),
      }),
    );
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
    await run(async (c, id) => {
      for (const [category, name, ancestor] of [
        [parent, "Alimentación", null],
        [child, "Supermercado", parent],
      ])
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind,parent_id) VALUES ($1,$2,$3,'expense',$4)",
          [id, category, name, ancestor],
        );
    });
    const command = {
      action: "save",
      categoryId: parent,
      currency: "UYU",
      amount: "10000",
      idempotencyKey: randomUUID(),
    };
    const copies = await Promise.all([save(command), save(command)]);
    assert.deepEqual(copies.map((x) => x.status).sort(), [
      "created",
      "replayed",
    ]);
    const id = copies[0].id;
    assert.equal(
      (await save({ ...command, amount: "10001" })).status,
      "conflict",
    );
    assert.equal(
      (await save({ ...command, idempotencyKey: randomUUID() })).status,
      "conflict",
    );
    assert.equal(
      (
        await save(
          { action: "save", categoryId: parent, currency: "USD", amount: "1" },
          undefined,
          b,
        )
      ).status,
      "not-found",
    );
    await save({
      action: "save",
      categoryId: child,
      currency: "UYU",
      amount: "5000",
    });
    assert.equal((await expense(child, "4000.0000")).status, "created");
    assert.equal((await expense(parent, "0.0001")).status, "created");
    let rows = await list("2026-11");
    assert.equal(rows.find((x) => x.id === id).progress.consumed, "4000.0001");
    assert.equal(
      rows.find((x) => x.categoryId === child).progress.consumed,
      "4000.0000",
    );

    // Two stale edits race: exactly one commits, the other must conflict.
    const edits = await Promise.all(
      ["12000", "13000"].map((amount) =>
        save(
          { action: "edit", budgetId: id, version: 1, currency: "UYU", amount },
          "2026-12-01",
        ),
      ),
    );
    assert.deepEqual(edits.map((x) => x.status).sort(), ["conflict", "saved"]);
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).monthlyLimit,
      "10000.0000",
    );
    const customary = (await list("2026-12")).find(
      (x) => x.id === id,
    ).monthlyLimit;
    const december = {
      action: "exception",
      budgetId: id,
      version: 2,
      month: "2026-12",
      amount: "15000",
      idempotencyKey: randomUUID(),
    };
    assert.equal((await save(december, "2026-12-31")).status, "saved");
    const retryInJanuary = (data) =>
      run((c, owner) =>
        saveBudget(
          c,
          owner,
          parseBudgetCommand(data, "2027-01-01", {
            checkExceptionWindow: false,
          }),
          "2027-01-01",
        ),
      );
    assert.deepEqual(await retryInJanuary(december), {
      status: "replayed",
      id,
    });
    assert.equal(
      (
        await retryInJanuary({
          ...december,
          version: 3,
          idempotencyKey: randomUUID(),
        })
      ).status,
      "conflict",
    );
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).effectiveLimit,
      "15000.0000",
    );
    assert.equal(
      (await list("2027-01")).find((x) => x.id === id).effectiveLimit,
      customary,
    );
    assert.equal(
      (await list("2027-01")).find((x) => x.id === id).progress.consumed,
      "0.0000",
    );
    assert.equal(
      (
        await save(
          {
            action: "edit",
            budgetId: id,
            version: 3,
            currency: "EUR",
            amount: "220",
          },
          "2027-01-01",
        )
      ).status,
      "saved",
    );
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).currency,
      "UYU",
    );
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).effectiveLimit,
      "15000.0000",
    );
    assert.equal(
      (await list("2027-01")).find((x) => x.id === id).currency,
      "EUR",
    );
    await run(async (c, owner) => {
      assert.equal(
        (
          await c.query(
            "SELECT 1 FROM finance.budget_limits WHERE owner_id=$1",
            [a],
          )
        ).rowCount,
        0,
      );
      assert.deepEqual(await listBudgets(c, a, "2026-12"), []);
      await assert.rejects(
        c.query(
          "INSERT INTO finance.budget_limits(owner_id,id,category_id) VALUES ($1,$2,$3)",
          [a, randomUUID(), parent],
        ),
      );
      assert.equal(owner, b);
    }, b).then(
      () => assert.fail("SQL error must roll back"),
      (err) => assert.equal(err.message, "Operación de datos rechazada"),
    );
    assert.deepEqual(await list("2026-12", b), []);
    assert.equal(
      (
        await save(
          { action: "remove", budgetId: id, version: 4 },
          "2027-01-01",
          b,
        )
      ).status,
      "not-found",
    );

    // Missing FX is visible; adding a quote resolves it and freezes the rate.
    assert.equal((await expense(child, "20.0000", "USD")).status, "created");
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).progress,
      null,
    );
    await pool.query(`INSERT INTO finance.fx_reference_refreshes(year,retry_at)
      VALUES (2026,now()+interval '1 hour') ON CONFLICT (year) DO NOTHING`);
    const quote = {
      action: "quote",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: "40",
      effectiveOn: "2026-11-09",
      idempotencyKey: randomUUID(),
    };
    assert.equal((await save(quote)).status, "created");
    assert.equal((await save(quote)).status, "replayed");
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).progress.consumed,
      "4800.0001",
    );
    await save({ ...quote, rate: "50", idempotencyKey: randomUUID() });
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).progress.consumed,
      "4800.0001",
    );
    assert.equal(
      (await list("2026-11")).find((x) => x.id === id).references[0].source,
      "manual",
    );

    // A legacy plan retains its registration-time quote across installments.
    // The fixture writes the plan using the older database contract.
    const today = bankReferenceToday(),
      period = today.slice(0, 7);
    await save(
      {
        ...quote,
        effectiveOn: today,
        rate: "40",
        idempotencyKey: randomUUID(),
      },
      today,
    );
    // SIMP-04: una compra en cuotas es un gasto independiente de tarjetas.
    const bought = await run((c, owner) =>
      saveMovement(c, owner, {
        kind: "expense",
        currency: "UYU",
        amount: "60",
        effectiveOn: today,
        method: "unspecified",
        concept: "Cuotas sintéticas",
        note: null,
        categoryId: child,
        plan: { installmentAmount: "20", count: 3, firstPeriod: period },
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(bought.status, "created");
    // Budget is UYU before January; select a future month with a UYU child limit.
    const next = new Date(`${period}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const nextMonth = next.toISOString().slice(0, 7);
    const future = (await list(nextMonth)).find((x) => x.categoryId === child);
    assert.equal(future.progress.consumed, "20.0000");
    await save({ action: "remove", budgetId: id, version: 4 }, "2027-02-01");
    assert.ok(!(await list("2027-02")).some((x) => x.id === id));
    assert.equal(
      (await list("2026-12")).find((x) => x.id === id).effectiveLimit,
      "15000.0000",
    );
    const revived = await save(
      { action: "save", categoryId: parent, currency: "UYU", amount: "7000" },
      "2027-03-01",
    );
    assert.equal(revived.id, id);
    assert.equal((await list("2027-03")).find((x) => x.id === id).version, 6);
  } finally {
    try {
      if (installed)
        await pool.query(
          "DROP SCHEMA finance,finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
