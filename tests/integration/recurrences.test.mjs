import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import {
  createRecurrence,
  listRecurrences,
} from "../../src/server/recurrences.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F4-01: alta concurrente, permisos A/B y calendario sin efectos en PostgreSQL", async () => {
  const pool = new pg.Pool(testDatabaseConfig());
  const owner = randomUUID();
  const other = randomUUID();
  const category = randomUUID();
  const run = (id, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: id }), work);
  const create = (id, command) =>
    run(id, (c, ownerId) => createRecurrence(c, ownerId, command));
  const list = (today, id = owner) =>
    run(id, (c, ownerId) => listRecurrences(c, ownerId, today));
  const command = parseRecurrence({
    kind: "expense",
    concept: "Seguro sintético",
    currency: "UYU",
    categoryId: category,
    firstPeriod: "2027-01-31",
    endDate: "2027-02-28",
    dateMode: "exact",
    dueDay: 31,
    referenceAmount: "1500.1234",
    idempotencyKey: randomUUID(),
  });
  assert.ok(!("error" in command));
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

    await run(owner, (c, id) =>
      c.query(
        "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','Seguro de prueba')",
        [id, category],
      ),
    );
    assert.equal((await create(other, command)).status, "not-found");
    assert.equal(
      (await create(owner, { ...command, kind: "income" })).status,
      "not-found",
    );
    const attempts = await Promise.all([
      create(owner, command),
      create(owner, command),
    ]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    assert.ok(attempts.every(({ id }) => id === command.idempotencyKey));
    assert.equal(
      (await create(owner, { ...command, concept: "Otro seguro" })).status,
      "conflict",
    );
    const [november] = await list("2026-11-30");
    assert.equal(november.referenceAmount, "1500.1234");
    assert.equal(november.first.key, "2027-01");
    assert.equal(november.latest, null);
    assert.equal((await list("2026-12-31"))[0].latest, null);
    assert.equal((await list("2027-01-31"))[0].latest.key, "2027-01");
    assert.equal((await list("2027-02-28"))[0].status, "active");
    const [finished] = await list("2027-03-01");
    assert.equal(finished.status, "finished");
    assert.equal(finished.latest.dueOn, "2027-02-28");
    assert.deepEqual(await list("2027-01-31", other), []);
    assert.equal(
      await run(
        other,
        async (c) =>
          (await c.query("SELECT id FROM finance.recurring_series")).rowCount,
      ),
      0,
    );
    await assert.rejects(
      run(other, (c) =>
        c.query(
          `INSERT INTO finance.recurring_series(owner_id,id,command_hash,kind,concept,currency,frequency,first_period,date_mode)
       VALUES ($1,$2,repeat('a',64),'expense','Intruso','USD','monthly','2027-01-01','none')`,
          [owner, randomUUID()],
        ),
      ),
    );
    await assert.rejects(
      run(other, (c) =>
        c.query(
          `INSERT INTO finance.recurring_series(owner_id,id,command_hash,kind,concept,currency,frequency,first_period,date_mode,category_id)
       VALUES ($1,$2,repeat('a',64),'expense','Categoría ajena','USD','monthly','2027-01-01','none',$3)`,
          [other, randomUUID(), category],
        ),
      ),
    );
    const {
      rows: [effects],
    } = await pool.query(`SELECT
      (SELECT count(*)::int FROM finance.recurring_series) AS series,
      (SELECT count(*)::int FROM finance.financial_events) AS events,
      (SELECT count(*)::int FROM finance.bank_effects) AS bank,
      (SELECT count(*)::int FROM finance.budget_expenses) AS expenses`);
    assert.deepEqual(effects, { series: 1, events: 0, bank: 0, expenses: 0 });
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
