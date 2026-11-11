import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { saveOpeningBalance } from "../../src/server/bank-balances.ts";
import { findLoan, saveLoanOperation } from "../../src/server/loans.ts";
import {
  listLoanDueNotices,
  listRecurrenceDueNotices,
} from "../../src/server/due-notices.ts";
import { createRecurrence } from "../../src/server/recurrences.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F4-05: aviso de vencimiento cierto por titular con antelación configurable", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
  const as = (ownerId, work) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const owner = "f4-05-owner";
  const outsider = "f4-05-outsider";
  const today = "2026-11-17";
  const dueOn = "2026-11-20";
  let installed = false;
  const command = (fields) => {
    const parsed = parseLoanCommand(
      { effectiveOn: today, idempotencyKey: randomUUID(), ...fields },
      today,
    );
    assert.ok(!("error" in parsed));
    return parsed;
  };
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
    await as(owner, (client, id) =>
      saveOpeningBalance(client, id, {
        currency: "UYU",
        amount: "10000.0000",
        asOfDate: "2026-11-01",
      }),
    );

    const opening = command({
      action: "borrow",
      direction: "payable",
      amount: "5000",
      concept: "Préstamo F4-05",
      currency: "UYU",
      installmentLoan: false,
      dueOn,
    });
    const legacyOpening = { ...opening };
    delete legacyOpening.noticeLeadDays;
    const created = await as(owner, (client, id) =>
      saveLoanOperation(client, id, legacyOpening),
    );
    assert.equal(created.status, "created");
    const loanId = created.id;
    assert.deepEqual(
      await as(owner, (client, id) => saveLoanOperation(client, id, opening)),
      { status: "replayed", id: loanId },
    );

    // Predeterminado confirmado: 3 días de antelación (v9.44).
    assert.equal(
      (await as(owner, (client, id) => findLoan(client, id, loanId)))
        .noticeLeadDays,
      3,
    );

    const notices = await as(owner, (client, id) =>
      listLoanDueNotices(client, id, today),
    );
    assert.equal(notices.length, 1);
    assert.match(notices[0].timing, /Vence el 20\/11\/2026, en 3 días/);
    assert.match(notices[0].amount, /5\.000,00 UYU/);
    assert.equal(
      (
        await as(outsider, (client, id) =>
          listLoanDueNotices(client, id, today),
        )
      ).length,
      0,
    );

    // Antelación configurada en 10 días: la misma obligación entra en ventana.
    const widened = await as(owner, (client, id) =>
      saveLoanOperation(
        client,
        id,
        command({
          action: "borrow",
          direction: "payable",
          amount: "1000",
          concept: "Préstamo con antelación amplia",
          currency: "UYU",
          installmentLoan: false,
          dueOn: "2026-11-27",
          noticeLeadDays: 10,
        }),
      ),
    );
    assert.equal(widened.status, "created");
    assert.equal(
      (await as(owner, (client, id) => findLoan(client, id, widened.id)))
        .noticeLeadDays,
      10,
    );
    assert.equal(
      (await as(owner, (client, id) => listLoanDueNotices(client, id, today)))
        .length,
      2,
    );

    // CA-049: deuda sin fecha cierta no inventa vencimiento ni aviso.
    const undated = await as(owner, (client, id) =>
      saveLoanOperation(
        client,
        id,
        command({
          action: "borrow",
          direction: "payable",
          amount: "700",
          concept: "Deuda sin fecha",
          currency: "UYU",
          installmentLoan: false,
        }),
      ),
    );
    assert.equal(undated.status, "created");
    assert.equal(
      (await as(owner, (client, id) => listLoanDueNotices(client, id, today)))
        .length,
      2,
    );

    // Al confirmarse el pago completo, el aviso se cierra (antirruido).
    const settled = await as(owner, (client, id) =>
      saveLoanOperation(
        client,
        id,
        command({
          loanId,
          expectedVersion: 1,
          action: "settle",
          amount: "5000",
        }),
      ),
    );
    assert.equal(settled.status, "created");
    const after = await as(owner, (client, id) =>
      listLoanDueNotices(client, id, today),
    );
    assert.deepEqual(
      after.map(({ key }) => key),
      [`loan:${widened.id}`],
    );

    const recurrence = parseRecurrence({
      kind: "income",
      concept: "Cobro de referencia",
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
