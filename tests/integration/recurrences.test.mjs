import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { parseRecurrencePause } from "../../src/domain/recurrence-pause.ts";
import {
  createRecurrence,
  listRecurrences,
  setRecurrencePaused,
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

test("F4-03: pausa y reanudación explícitas sin tocar períodos ni historial", async () => {
  const pool = new pg.Pool(testDatabaseConfig());
  const owner = randomUUID();
  const other = randomUUID();
  const run = (id, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: id }), work);
  const today = "2026-11-11";
  const parsed = parseRecurrencePause({
    seriesId: randomUUID(),
    idempotencyKey: randomUUID(),
    action: "pause",
  });
  assert.ok(!("error" in parsed));
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

    const definition = parseRecurrence({
      kind: "income",
      concept: "Sueldo sintético",
      currency: "UYU",
      categoryId: null,
      firstPeriod: "2026-11-01",
      dateMode: "exact",
      dueDay: 1,
      referenceAmount: "40000",
      idempotencyKey: randomUUID(),
    });
    assert.ok(!("error" in definition));
    const created = await run(owner, (c, ownerId) =>
      createRecurrence(c, ownerId, definition),
    );
    assert.equal(created.status, "created");
    const seriesId = created.id;
    const pause = (id, command = parsed) =>
      run(id, (c, ownerId) => setRecurrencePaused(c, ownerId, command, today))
        .then((result) => result.status)
        .catch(() => "rejected");

    // Otro titular no puede pausar una serie ajena.
    assert.equal(await pause(other), "not-found");
    assert.equal(
      await pause(
        owner,
        parseRecurrencePause({
          seriesId: randomUUID(),
          idempotencyKey: randomUUID(),
          action: "pause",
        }),
      ),
      "not-found",
    );
    assert.equal(await pause(owner, seriesId), "created");
    // El mismo envío repetido es una reemisión, no un conflicto.
    assert.equal(await pause(owner, seriesId), "replayed");
    // La misma clave con otros datos entra en conflicto.
    assert.equal(
      await pause(owner, seriesId, {
        ...parsed,
        action: "resume",
      }),
      "conflict",
    );
    // Pausar dos veces no incrementa la versión ni cambia el estado.
    assert.equal(
      await pause(owner, seriesId, {
        ...parsed,
        idempotencyKey: randomUUID(),
      }),
      "created",
    );

    const [paused] = await run(owner, (c, ownerId) =>
      listRecurrences(c, ownerId, today),
    );
    assert.equal(paused.status, "paused");
    assert.equal(paused.latest.key, "2026-11");

    // La reanudación devuelve la serie a activa con otro comprobante.
    assert.equal(
      await pause(owner, seriesId, {
        ...parsed,
        idempotencyKey: randomUUID(),
        action: "resume",
      }),
      "created",
    );
    const [resumed] = await run(owner, (c, ownerId) =>
      listRecurrences(c, ownerId, today),
    );
    assert.equal(resumed.status, "active");

    // Aislamiento por titular: solo el dueño ve filas y comandos propios.
    assert.equal(
      await run(other, (c) =>
        c
          .query("SELECT 1 FROM finance.recurring_commands")
          .then(({ rowCount }) => rowCount),
      ),
      0,
    );

    const {
      rows: [state],
    } = await pool.query(
      `SELECT
      s.paused, s.version,
      (SELECT count(*)::int FROM finance.recurring_periods) AS periods,
      (SELECT count(*)::int FROM finance.recurring_commands
        WHERE owner_id = $1) AS commands,
      (SELECT count(*)::int FROM finance.financial_events) AS events,
      (SELECT count(*)::int FROM finance.bank_effects) AS bank
      FROM finance.recurring_series s WHERE s.owner_id = $1`,
      [owner],
    );
    assert.deepEqual(state, {
      paused: false,
      version: 3,
      periods: 0,
      commands: 3,
      events: 0,
      bank: 0,
    });

    // Una serie finalizada no admite pausa ni reanudación.
    const finished = parseRecurrence({
      ...definition,
      firstPeriod: "2026-01-31",
      endDate: "2026-02-28",
      idempotencyKey: randomUUID(),
    });
    assert.ok(!("error" in finished));
    const closed = await run(owner, (c, ownerId) =>
      createRecurrence(c, ownerId, finished),
    );
    assert.equal(closed.status, "created");
    assert.equal(
      await pause(owner, closed.id, {
        ...parsed,
        seriesId: closed.id,
        idempotencyKey: randomUUID(),
        action: "resume",
      }),
      "finished",
    );
    const [finishedState] = await run(owner, (c, ownerId) =>
      listRecurrences(c, ownerId, today),
    );
    assert.equal(finishedState.status, "finished");
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
