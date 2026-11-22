import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { listRecurrenceDueNotices } from "../../src/server/due-notices.ts";
import { createRecurrence } from "../../src/server/recurrences.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F4-05: aviso de vencimiento cierto por titular con antelación configurable", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const owner = "f4-05-owner";
  const outsider = "f4-05-outsider";
  let installed = false;
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await migrateInTransaction(client);
      await client.query("COMMIT");
      installed = true;
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    const recurrence = parseRecurrence({
      kind: "expense",
      concept: "Pago de referencia",
      currency: "UYU",
      firstPeriod: "2026-12-01",
      endDate: "2026-12-01",
      dateMode: "exact",
      frequency: "monthly",
      referenceAmount: "1000",
      idempotencyKey: randomUUID(),
    });
    assert.ok(!("error" in recurrence));
    assert.equal(
      (
        await as(owner, (client, id) =>
          createRecurrence(client, id, recurrence),
        )
      ).status,
      "created",
    );
    const recurrenceNotices = (day) =>
      as(owner, (client, id) => listRecurrenceDueNotices(client, id, day));
    assert.deepEqual(await recurrenceNotices("2026-11-27"), []);
    const upcoming = await recurrenceNotices("2026-11-28");
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].dueOn, "2026-12-01");
    assert.equal(
      (await recurrenceNotices("2026-12-01"))[0].key,
      upcoming[0].key,
    );
    assert.equal(
      (await recurrenceNotices("2026-12-02"))[0].key,
      upcoming[0].key,
    );
    assert.deepEqual(
      await as(outsider, (client, id) =>
        listRecurrenceDueNotices(client, id, "2026-11-28"),
      ),
      [],
    );
  } finally {
    try {
      if (installed)
        await pool.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      await pool.end();
    }
  }
});
