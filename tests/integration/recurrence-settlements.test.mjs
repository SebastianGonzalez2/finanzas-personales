import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { parseRecurrenceSeriesCommand } from "../../src/domain/recurrence-pause.ts";
import { latestTrackedIndex } from "../../src/domain/recurrence-plan.ts";
import { parseSettlement } from "../../src/domain/recurrence-settlements.ts";
import { listRecurrenceDueNotices } from "../../src/server/due-notices.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { recurrenceEventPeriods } from "../../src/server/recurrence-links.ts";
import {
  applySettlement,
  additionalRecurrencePeriods,
  linkableRecurrenceEvents,
  trackedPeriods,
} from "../../src/server/recurrence-settlements.ts";
import {
  applyRecurrenceSeriesCommand,
  createRecurrence,
  loadRecurrence,
} from "../../src/server/recurrences.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const today = "2026-12-15";
const target = (p, fields = {}) => ({
  index: p.index,
  version: p.version,
  recorded: p.recorded,
  ...fields,
});

test("F4-02: confirmación real, vínculos, concurrencia, aislamiento y correcciones", async (t) => {
  const pool = new pg.Pool(testDatabaseConfig());
  const owner = randomUUID(),
    other = randomUUID();
  const run = (work, id = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId: id }), work);
  const create = async (kind, fields = {}, user = owner) => {
    const definition = parseRecurrence({
      kind,
      concept: "Servicio sintético",
      firstPeriod: "2026-11-01",
      currency: "UYU",
      referenceAmount: "50000",
      dateMode: "exact",
      dueDay: 25,
      idempotencyKey: randomUUID(),
      ...fields,
    });
    assert.ok(!("error" in definition));
    const result = await run(
      (c, id) => createRecurrence(c, id, definition),
      user,
    );
    assert.equal(result.status, "created");
    return { ...definition, id: result.id };
  };
  const state = (series, ...indices) =>
    run((c, id) => trackedPeriods(c, id, series, indices));
  const total = async (date, kind) =>
    (await run((c, id) => listMovementTotals(c, id, date))).find(
      (row) => row.kind === kind,
    )?.amount;
  const apply = (series, fields, user = owner, at = today) => {
    const command = parseSettlement(
      { idempotencyKey: randomUUID(), ...fields, seriesId: series.id },
      at,
    );
    assert.ok(!("error" in command), JSON.stringify(command));
    return run((c, id) => applySettlement(c, id, command, at), user);
  };
  const record = (period, amount, date, fields = {}, method = "debit") => ({
    action: "record",
    targets: [target(period, { amount, ...fields })],
    amount,
    effectiveOn: date,
    method,
  });
  const revise = (fields) =>
    run((c, id) =>
      reviseMovement(c, id, { idempotencyKey: randomUUID(), ...fields }),
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

    await t.test(
      "CA-047: omisión, pausa y edición conservan el seguimiento y Bancos",
      async () => {
        const subscriber = randomUUID();
        const read = (work) => run(work, subscriber);
        const series = await create("expense", {}, subscriber);
        const periods = (plan) =>
          read((c, id) => trackedPeriods(c, id, plan, [0, 1]));
        const [november, december] = await periods(series);
        const settle = (fields, user = subscriber, at = today) =>
          apply(series, fields, user, at);
        assert.equal(
          (await settle(record(november, "100", today))).status,
          "created",
        );

        const revise = (fields, date, user = subscriber) => {
          const command = parseRecurrenceSeriesCommand({
            seriesId: series.id,
            idempotencyKey: randomUUID(),
            ...fields,
          });
          assert.ok(!("error" in command));
          return run(
            (c, id) => applyRecurrenceSeriesCommand(c, id, command, date),
            user,
          );
        };
        const history = (date) =>
          read((c, id) =>
            additionalRecurrencePeriods(c, id, series.id, 99, date),
          );
        const omitKey = randomUUID();
        const omit = {
          action: "omit",
          target: target(december),
          idempotencyKey: omitKey,
        };
        assert.equal((await settle(omit, other)).status, "not-found");
        const results = await Promise.all([settle(omit), settle(omit)]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "created",
          "replayed",
        ]);
        assert.deepEqual(
          (await history(today)).periods.map(({ key }) => key),
          ["2026-11"],
        );

        const edit = {
          action: "due-day",
          dueDay: 10,
          effectiveMonth: "2027-01",
          version: 1,
        };
        assert.equal((await revise(edit, today, other)).status, "not-found");
        assert.equal((await revise(edit, "2027-01-01")).status, "stale");
        assert.equal((await revise(edit, today)).status, "created");
        assert.equal(
          (await revise({ ...edit, dueDay: 15 }, today)).status,
          "stale",
        );
        const [january] = (await history("2027-01-01")).periods;
        assert.equal(january.key, "2027-01");
        assert.equal(january.dueOn, "2027-01-10");
        assert.equal(january.status, "expected");
        const plan = await read((c, id) => loadRecurrence(c, id, series.id));
        const [savedNovember, savedDecember] = await periods(plan);
        assert.equal(savedNovember.dueOn, november.dueOn);
        assert.equal(savedNovember.recorded, "100.0000");
        assert.equal(savedDecember.dueOn, december.dueOn);
        assert.equal(savedDecember.status, "skipped");

        assert.equal(
          (
            await revise(
              { action: "pause", idempotencyKey: omitKey },
              "2027-01-12",
            )
          ).status,
          "conflict",
        );
        assert.equal(
          (await revise({ action: "pause" }, "2027-01-12")).status,
          "created",
        );
        const keys = async (date) =>
          (await history(date)).periods.map(({ key }) => key);
        assert.deepEqual(await keys("2027-02-12"), ["2027-01", "2026-11"]);
        const duringPause = {
          action: "omit",
          target: { index: 3, version: 0, recorded: "0" },
        };
        assert.equal(
          (await settle(duringPause, subscriber, "2027-02-12")).status,
          "not-found",
        );
        assert.equal(
          (await revise({ action: "resume" }, "2027-03-01")).status,
          "created",
        );
        assert.deepEqual(await keys("2027-03-12"), ["2027-01", "2026-11"]);
        assert.deepEqual(await keys("2027-04-01"), [
          "2027-04",
          "2027-01",
          "2026-11",
        ]);
        assert.equal(
          (await settle(duringPause, subscriber, "2027-04-01")).status,
          "not-found",
        );
        assert.deepEqual(
          (await read((c, id) => listMovementTotals(c, id, today))).map(
            ({ kind, amount }) => [kind, amount],
          ),
          [["expense", "100.0000"]],
        );
      },
    );

    await t.test(
      "CA-046: dos depósitos en un mes y reintento concurrente",
      async () => {
        const series = await create("expense");
        assert.equal(latestTrackedIndex(series, today), 1);
        let [nov, dec] = await state(series, 0, 1);
        assert.equal(dec.status, "expected");
        assert.equal(dec.dueOn, "2026-12-25");
        assert.equal(await total("2026-11-01", "expense"), undefined);
        const command = {
          ...record(nov, "30000", "2026-11-03"),
          idempotencyKey: randomUUID(),
        };
        await assert.rejects(
          run(async (client, id) => {
            const parsed = parseSettlement(
              { ...command, seriesId: series.id },
              today,
            );
            const saved = await applySettlement(client, id, parsed, today);
            assert.equal(saved.status, "created");
            throw new Error("Fallo sintético antes del commit");
          }),
          { message: "Operación de datos rechazada" },
        );
        assert.equal((await state(series, 0))[0].version, 0);
        const attempts = await Promise.all([
          apply(series, command),
          apply(series, command),
        ]);
        assert.deepEqual(attempts.map(({ status }) => status).sort(), [
          "created",
          "replayed",
        ]);
        assert.equal(attempts[0].id, attempts[1].id);
        assert.equal(
          (await apply(series, { ...command, distinct: true })).status,
          "conflict",
        );
        assert.equal(
          (await apply(series, record(nov, "100", "2026-11-04"))).status,
          "conflict",
        );
        [nov] = await state(series, 0);
        assert.equal(nov.status, "partial");
        assert.equal(nov.remaining, null);
        assert.equal(
          (await apply(series, record(nov, "30000", "2026-11-03"))).status,
          "duplicate",
        );
        const second = await apply(
          series,
          record(nov, "20000", "2026-11-08", { final: true }),
        );
        assert.equal(second.status, "created");
        [nov, dec] = await state(series, 0, 1);
        assert.equal(nov.status, "completed");
        assert.equal(nov.recorded, "50000.0000");
        assert.deepEqual(
          nov.events.map(({ effectiveOn }) => effectiveOn),
          ["2026-11-08", "2026-11-03"],
        );
        assert.equal(dec.recorded, "0.0000");
        assert.equal(await total("2026-11-01", "expense"), "50000.0000");
        assert.equal(await total("2026-12-01", "expense"), undefined);
        assert.deepEqual(
          await run((c, id) => recurrenceEventPeriods(c, id, second.id)),
          [{ seriesId: series.id, key: "2026-11", index: 0 }],
        );
      },
    );

    await t.test(
      "CA-045: cierre explícito por debajo de referencia y corrección conciliada",
      async () => {
        const series = await create("expense");
        let [nov] = await state(series, 0);
        let dec;
        const payment = await apply(series, record(nov, "47000", "2026-12-03"));
        assert.equal(payment.status, "created");
        [nov] = await state(series, 0);
        assert.equal(nov.remaining, null);
        assert.equal(nov.status, "partial");
        assert.equal(
          (
            await apply(series, {
              action: "total",
              target: target(nov, { final: true }),
            })
          ).status,
          "created",
        );
        [nov, dec] = await state(series, 0, 1);
        assert.equal(nov.status, "completed");
        assert.equal(nov.confirmedTotal, "47000.0000");
        assert.equal(nov.remaining, "0.0000");
        assert.equal(dec.referenceAmount, "50000.0000");
        assert.equal(await total("2026-12-01", "expense"), "47000.0000");
        const correction = await revise({
          action: "correct",
          eventId: payment.id,
          amount: "46000.0000",
        });
        assert.equal(correction.status, "revised");
        [nov] = await state(series, 0);
        assert.equal(nov.status, "partial");
        assert.equal(nov.events[0].id, correction.id);
        assert.equal(nov.remaining, null);
        assert.equal(await total("2026-12-01", "expense"), "46000.0000");
        assert.equal(
          (
            await apply(series, {
              action: "total",
              target: target(nov, { final: true }),
            })
          ).status,
          "created",
        );
      },
    );

    await t.test(
      "pago repartido entre meses con un efecto, parcial, anulación y omisión",
      async () => {
        const series = await create("expense", {
          referenceAmount: "1500",
          endDate: "2026-12-25",
        });
        let [nov] = await state(series, 0);
        let dec;
        const first = await apply(
          series,
          record(nov, "800", "2026-11-28", { total: "1800" }, "debit"),
        );
        assert.equal(first.status, "created");
        [nov, dec] = await state(series, 0, 1);
        assert.equal(nov.remaining, "1000.0000");
        const split = {
          action: "record",
          amount: "2500",
          method: "transfer",
          effectiveOn: "2026-12-14",
          targets: [
            target(nov, { amount: "1000" }),
            target(dec, { amount: "1500", final: true }),
          ],
        };
        assert.equal((await apply(series, split, other)).status, "not-found");
        const result = await apply(series, split);
        assert.equal(result.status, "created");
        [nov, dec] = await state(series, 0, 1);
        assert.equal(nov.status, "completed");
        assert.equal(dec.status, "completed");
        assert.equal(nov.events[0].id, dec.events[0].id);
        assert.equal(await total("2026-11-01", "expense"), "50800.0000");
        assert.equal(await total("2026-12-01", "expense"), "48500.0000");
        assert.equal(
          (
            await revise({
              action: "correct",
              eventId: result.id,
              amount: "2499.0000",
            })
          ).status,
          "recurrence-conflict",
        );
        assert.equal(
          (await revise({ action: "void", eventId: result.id })).status,
          "revised",
        );
        [nov, dec] = await state(series, 0, 1);
        assert.equal(nov.status, "partial");
        assert.equal(dec.status, "expected");
        assert.equal(await total("2026-12-01", "expense"), "46000.0000");
        assert.equal(
          (await apply(series, { action: "omit", target: target(nov) })).status,
          "conflict",
        );
        assert.equal(
          (
            await apply(series, {
              action: "total",
              target: target(dec, { total: "1500" }),
            })
          ).status,
          "created",
        );
        [dec] = await state(series, 1);
        assert.equal(
          (await apply(series, { action: "omit", target: target(dec) })).status,
          "created",
        );
        [nov, dec] = await state(series, 0, 1);
        assert.equal(dec.status, "skipped");
        assert.equal(dec.remaining, null);
        assert.equal(nov.status, "partial");
        assert.equal(
          (await apply(series, { action: "restore", target: target(dec) }))
            .status,
          "created",
        );
        const [restored] = await state(series, 1);
        assert.equal(restored.status, "expected");
        assert.equal(restored.remaining, "1500.0000");
        assert.equal(latestTrackedIndex(series, "2027-01-01"), 1);
      },
    );

    await t.test(
      "vincular un movimiento existente respeta titular, moneda e idempotencia",
      async () => {
        const series = await create("expense");
        const foreignSeries = await create("expense", {}, other);
        const linked = {
          kind: "expense",
          concept: "Gasto cargado en Historial",
          note: null,
          categoryId: null,
          currency: "UYU",
          method: "debit",
          amount: "212.1234",
          effectiveOn: "2026-12-15",
          idempotencyKey: randomUUID(),
        };
        const saved = await run((c, id) => saveMovement(c, id, linked));
        assert.equal(saved.status, "created");
        const [nov, dec] = await state(series, 0, 1);
        const foreign = await run(
          (c, id) => trackedPeriods(c, id, foreignSeries, [0]),
          other,
        );
        const link = {
          action: "link",
          eventId: saved.id,
          amount: linked.amount,
          targets: [target(nov, { amount: linked.amount, final: true })],
        };
        assert.equal(
          (
            await apply(
              foreignSeries,
              {
                ...link,
                targets: [target(foreign[0], { amount: linked.amount })],
              },
              other,
            )
          ).status,
          "not-found",
        );
        assert.equal(
          (
            await run((c, id) =>
              linkableRecurrenceEvents(c, id, series.id, today),
            )
          ).some(({ id }) => id === saved.id),
          true,
        );
        assert.equal(
          (await apply(series, record(nov, linked.amount, today))).status,
          "duplicate",
        );
        const attempts = await Promise.all([
          apply(series, link),
          apply(series, {
            ...link,
            targets: [target(dec, { amount: linked.amount })],
          }),
        ]);
        assert.deepEqual(attempts.map(({ status }) => status).sort(), [
          "created",
          "not-found",
        ]);
        assert.equal(await total("2026-12-01", "expense"), "46212.1234");
        const beforeDetach = await state(series, 0, 1);
        const assigned = beforeDetach.find(({ events }) =>
          events.some(({ id }) => id === saved.id),
        );
        const detach = {
          action: "detach",
          eventId: saved.id,
          target: target(assigned),
          idempotencyKey: randomUUID(),
        };
        assert.equal((await apply(series, detach)).status, "created");
        assert.equal((await apply(series, detach)).status, "replayed");
        const afterDetach = await state(series, 0, 1);
        assert.ok(afterDetach.every(({ events }) => !events.length));
        const otherPeriod = afterDetach.find(
          ({ index }) => index !== assigned.index,
        );
        assert.equal(
          (
            await apply(series, {
              ...link,
              targets: [
                target(otherPeriod, { amount: linked.amount, final: true }),
              ],
            })
          ).status,
          "created",
        );
        assert.equal(await total("2026-12-01", "expense"), "46212.1234");
        for (const table of [
          "recurring_periods",
          "recurring_commands",
          "recurring_allocations",
          "recurring_event_lineage",
          "recurring_active_allocations",
        ]) {
          assert.equal(
            (
              await run(
                (c) =>
                  c.query(
                    `SELECT 1 FROM finance.${table} WHERE owner_id = $1`,
                    [owner],
                  ),
                other,
              )
            ).rowCount,
            0,
          );
        }
        await assert.rejects(
          run(
            (c, id) =>
              c.query(
                `INSERT INTO finance.recurring_commands(owner_id,id,series_id,event_id,command_hash,details)
         VALUES ($1,$2,$3,$4,repeat('a',64),'{}')`,
                [id, randomUUID(), foreignSeries.id, saved.id],
              ),
            other,
          ),
        );
      },
    );

    await t.test(
      "F4-06: diciembre omitido y factura de enero pagada en febrero bisiesto",
      async () => {
        const payer = randomUUID();
        const read = (work) => run(work, payer);
        const at = "2028-02-26";
        const series = await create(
          "expense",
          { firstPeriod: "2027-12-01", dueDay: 31, referenceAmount: "300" },
          payer,
        );
        const periods = () =>
          read((c, id) => trackedPeriods(c, id, series, [0, 1, 2]));
        const notices = () =>
          read((c, id) => listRecurrenceDueNotices(c, id, at));
        const settle = (fields, user = payer) =>
          apply(series, fields, user, at);
        const [december, january] = await periods();
        assert.equal(
          (await settle({ action: "omit", target: target(december) })).status,
          "created",
        );
        assert.deepEqual(
          (await notices()).map(({ dueOn }) => dueOn),
          ["2028-01-31", "2028-02-29"],
        );

        const first = {
          ...record(january, "125.1234", "2028-02-02", {}, "transfer"),
          idempotencyKey: randomUUID(),
        };
        const [original, retry] = await Promise.all([
          settle(first),
          settle({
            ...first,
            idempotencyKey: first.idempotencyKey.toUpperCase(),
          }),
        ]);
        assert.deepEqual([original.status, retry.status].sort(), [
          "created",
          "replayed",
        ]);
        assert.equal(original.id, retry.id);
        assert.equal((await settle(first, other)).status, "not-found");
        assert.equal(
          (await settle({ ...first, effectiveOn: at })).status,
          "conflict",
        );
        const [, partial] = await periods();
        assert.equal(partial.status, "partial");
        assert.equal(partial.confirmedTotal, null);
        assert.equal(partial.remaining, null);
        const [januaryNotice] = await notices();
        assert.equal(januaryNotice.dueOn, "2028-01-31");
        assert.equal(januaryNotice.amount, null);

        // Dos solicitudes distintas compiten por la misma versión del período.
        const finalPayment = record(
          partial,
          "74.8766",
          at,
          { final: true },
          "transfer",
        );
        const results = await Promise.all([
          settle(finalPayment),
          settle(finalPayment),
        ]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [
          "conflict",
          "created",
        ]);
        const [skipped, completed, february] = await periods();
        assert.equal(skipped.status, "skipped");
        assert.equal(skipped.events.length, 0);
        assert.equal(completed.status, "completed");
        assert.equal(completed.key, "2028-01");
        assert.equal(completed.dueOn, "2028-01-31");
        assert.equal(completed.confirmedTotal, "200.0000");
        assert.deepEqual(
          completed.events.map(({ effectiveOn, amount }) => [
            effectiveOn,
            amount,
          ]),
          [
            [at, "74.8766"],
            ["2028-02-02", "125.1234"],
          ],
        );
        assert.equal(february.status, "expected");
        assert.deepEqual(
          (await notices()).map(({ dueOn }) => dueOn),
          ["2028-02-29"],
        );
        assert.deepEqual(
          await read((c, id) => listMovementTotals(c, id, "2028-01-01")),
          [],
        );
        assert.deepEqual(
          (await read((c, id) => listMovementTotals(c, id, "2028-02-01"))).map(
            ({ kind, amount }) => [kind, amount],
          ),
          [["expense", "200.0000"]],
        );
        const receipts = (user) =>
          run(
            (c) =>
              c.query(
                "SELECT id FROM finance.recurring_commands WHERE series_id = $1",
                [series.id],
              ),
            user,
          );
        assert.equal((await receipts(payer)).rowCount, 3);
        assert.equal((await receipts(other)).rowCount, 0);
      },
    );
  } finally {
    if (installed)
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    await pool.end();
  }
});
