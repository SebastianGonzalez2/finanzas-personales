import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.mts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  listSavingsFunds,
  saveSavingsFund,
} from "../../src/server/savings-funds.ts";
import {
  listContributionChanges,
  listContributionPeriods,
  listContributionPlans,
  processDueContributions,
  saveContributionCommand,
} from "../../src/server/scheduled-contributions.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-03: CA-039, edición prospectiva, reintento explícito, concurrencia y aislamiento", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 4 });
  const admin = await pool.connect();
  const a = randomUUID();
  const b = randomUUID();
  const run = (work, owner = a) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const process = (date) =>
    run((client) => processDueContributions(client, a, date));
  const read = (query, owner = a) =>
    run((client) => query(client, owner), owner);
  const save = (command, date, owner = a) =>
    run(
      (client) => saveContributionCommand(client, owner, command, date),
      owner,
    );
  const payload = (action, fields) => ({
    action,
    idempotencyKey: randomUUID(),
    ...fields,
  });
  let installed = false;
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
    installed = true;
    const { id: fundId } = await run(async (client) => {
      await saveOpeningBalance(client, a, {
        currency: "UYU",
        amount: "700.0000",
        asOfDate: "2026-11-01",
      });
      await saveOpeningBalance(client, a, {
        currency: "USD",
        amount: "9000.0000",
        asOfDate: "2026-11-01",
      });
      return saveSavingsFund(
        client,
        a,
        payload("create", { currency: "UYU", name: "Vacaciones" }),
      );
    });
    const plan = payload("configure", {
      fundId,
      version: 0,
      amount: "1000.0000",
      preferredDay: 31,
    });
    assert.equal((await save(plan, "2026-11-05", b)).status, "not-found");
    assert.equal((await save(plan, "2026-11-05")).status, "saved");
    assert.equal((await save(plan, "2026-11-05")).status, "saved");
    assert.equal(
      (await save({ ...plan, amount: "1.0000" }, "2026-11-05")).status,
      "conflict",
    );
    assert.equal((await read(listContributionPlans))[0].nextOn, "2026-12-31");
    await process("2026-12-30");
    assert.deepEqual(await read(listContributionPeriods), []);
    await Promise.all([process("2026-12-31"), process("2026-12-31")]);
    const [december] = await read(listContributionPeriods);
    assert.equal(december.status, "missed_insufficient");
    assert.equal(december.amount, "1000.0000");
    assert.equal((await read(listSavingsFunds))[0].reservedAmount, "0.0000");
    assert.equal((await read(listBankBalances))[0].amount, "700.0000");
    const complete = payload("complete", { periodId: december.id });
    assert.equal((await save(complete, "2026-12-31")).status, "conflict");
    assert.equal((await save(complete, "2026-12-31", b)).status, "not-found");
    assert.deepEqual(await read(listContributionPeriods, b), []);
    assert.deepEqual(await read(listContributionChanges, b), []);
    await run(async (client) => {
      assert.equal(
        (await client.query("SELECT 1 FROM finance.reserve_effects")).rowCount,
        0,
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
        0,
      );
      assert.equal(
        (
          await saveMovement(
            client,
            a,
            payload("unused", {
              kind: "income",
              method: "transfer",
              currency: "UYU",
              amount: "2300.0000",
              effectiveOn: "2027-01-01",
              concept: "Ingreso sintético",
              note: null,
              categoryId: null,
            }),
          )
        ).status,
        "created",
      );
    });

    const edit = payload("configure", {
      fundId,
      version: 1,
      amount: "350.0001",
      preferredDay: 30,
    });
    assert.equal((await save(edit, "2027-01-10")).status, "saved");
    const [edited] = await read(listContributionPlans);
    assert.equal(edited.nextOn, "2027-01-31");
    assert.equal(edited.nextAmount, "1000.0000");
    await Promise.all([process("2027-01-31"), process("2027-01-31")]);
    const [january, stillPending] = await read(listContributionPeriods);
    assert.equal(january.status, "completed");
    assert.deepEqual(stillPending, december);
    assert.equal((await read(listContributionPlans))[0].nextOn, "2027-02-28");
    await process("2027-03-01");
    const [february] = await read(listContributionPeriods);
    assert.equal(february.status, "missed_execution");
    assert.equal(february.reason, "late");
    assert.equal(february.amount, "350.0001");
    const paused = await save(
      payload("pause", { fundId, version: 2 }),
      "2027-03-05",
    );
    assert.equal(paused.status, "saved");
    await process("2027-04-30");
    assert.equal((await read(listContributionPeriods)).length, 3);

    const resolutions = await Promise.all([
      save(complete, "2027-04-30"),
      save(complete, "2027-04-30"),
    ]);
    assert.deepEqual(
      resolutions.map(({ status }) => status),
      ["saved", "saved"],
    );
    assert.equal(
      (await save(payload("discard", { periodId: december.id }), "2027-04-30"))
        .status,
      "conflict",
    );
    assert.equal(
      (await save(payload("discard", { periodId: february.id }), "2027-04-30"))
        .status,
      "saved",
    );
    assert.equal((await read(listSavingsFunds))[0].reservedAmount, "2000.0000");
    assert.equal(
      (await read(listBankBalances))[0].calculatedAmount,
      "3000.0000",
    );
    const reactivated = await save(
      payload("reactivate", { fundId, version: 3 }),
      "2027-04-30",
    );
    assert.equal(reactivated.status, "saved");
    assert.equal((await read(listContributionPlans))[0].nextOn, "2027-05-30");
    assert.deepEqual(
      (await read(listContributionChanges)).map(({ action }) => action),
      ["reactivate", "pause", "configure", "configure"],
    );

    // If recording the period fails after the reserve, both the effect and cursor roll back.
    await admin.query(
      "ALTER TABLE finance.contribution_periods ADD CONSTRAINT test_reject_may CHECK (scheduled_on <> DATE '2027-05-30')",
    );
    await assert.rejects(process("2027-05-30"), /Operación de datos rechazada/);
    assert.equal((await read(listSavingsFunds))[0].reservedAmount, "2000.0000");
    assert.equal((await read(listContributionPlans))[0].nextOn, "2027-05-30");
    await admin.query(
      "ALTER TABLE finance.contribution_periods DROP CONSTRAINT test_reject_may",
    );
    await process("2027-05-30");
    assert.equal((await read(listSavingsFunds))[0].reservedAmount, "2350.0001");
    await run(async (client) => {
      assert.equal(
        (await client.query("SELECT 1 FROM finance.reserve_effects")).rowCount,
        3,
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
        1,
      );
      const [fund] = await listSavingsFunds(client, a);
      const result = await saveSavingsFund(
        client,
        a,
        payload("update", {
          fundId,
          name: fund.name,
          version: fund.version,
          status: "paused_manual",
        }),
      );
      assert.equal(result.status, "saved");
    });
    assert.equal((await read(listContributionPlans))[0].nextOn, null);
    assert.equal((await read(listContributionChanges))[0].action, "pause");
  } finally {
    try {
      await admin.query("ROLLBACK").catch(() => {});
      if (installed)
        await admin.query(
          "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
        );
    } finally {
      admin.release();
      await pool.end();
    }
  }
});
