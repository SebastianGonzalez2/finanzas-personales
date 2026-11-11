import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.mts";
import {
  fundTargetNotices,
  pendingContributionToken,
} from "../../src/domain/savings-funds.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  listFundAvailability,
  listFundClosures,
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

test("F3-04: CA-040/050, cierre confirmado, aislamiento y concurrencia", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 4 });
  const admin = await pool.connect();
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const run = (work, owner = ownerA) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const command = (action, fields) => ({
    action,
    idempotencyKey: randomUUID(),
    ...fields,
  });
  const fundCommand = (payload, owner) =>
    run((client, id) => saveSavingsFund(client, id, payload), owner);
  const planCommand = (payload, date, owner) =>
    run(
      (client, id) => saveContributionCommand(client, id, payload, date),
      owner,
    );
  const process = (date) =>
    run((client, id) => processDueContributions(client, id, date));
  const funds = () => run(listSavingsFunds);
  const plan = async (id) =>
    (await run(listContributionPlans)).find(({ fundId }) => fundId === id);
  const periods = async (id) =>
    (await run(listContributionPeriods)).filter(({ fundId }) => fundId === id);
  let installed = false;
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
    installed = true;
    const setup = async (currency, balance) =>
      run(async (client, owner) => {
        await saveOpeningBalance(client, owner, {
          currency,
          amount: balance,
          asOfDate: "2026-10-01",
        });
        const { id } = await saveSavingsFund(
          client,
          owner,
          command("create", { name: `Meta ${currency}`, currency }),
        );
        assert.equal(
          (
            await saveSavingsFund(
              client,
              owner,
              command("reserve", {
                fundId: id,
                version: 1,
                amount: "1950.0000",
              }),
            )
          ).status,
          "saved",
        );
        assert.equal(
          (
            await saveSavingsFund(
              client,
              owner,
              command("update", {
                fundId: id,
                version: 2,
                name: `Meta ${currency}`,
                targetAmount: "2000.0000",
                targetDate: "2026-11-01",
              }),
            )
          ).status,
          "saved",
        );
        assert.equal(
          (
            await saveContributionCommand(
              client,
              owner,
              command("configure", {
                fundId: id,
                version: 0,
                amount: "200.0000",
                preferredDay: 30,
              }),
              "2026-10-01",
            )
          ).status,
          "saved",
        );
        return id;
      });
    const goal = await setup("UYU", "2025.0000");
    const short = await setup("USD", "1999.9999");
    await process("2026-12-01");
    const [older] = await periods(goal);
    const before = (await funds()).find(({ id }) => id === goal);
    assert.equal(before.reservedAmount, "1950.0000");
    assert.equal(fundTargetNotices(before, "2026-12-01").overdue, true);
    assert.equal(before.status, "active");
    assert.equal((await plan(goal)).nextOn, "2026-12-30");

    await admin.query(
      "ALTER TABLE finance.contribution_periods ADD CONSTRAINT test_no_final CHECK (resolution IS DISTINCT FROM 'target_final')",
    );
    await assert.rejects(process("2026-12-30"), /Operación de datos rechazada/);
    assert.equal(
      (await funds()).find(({ id }) => id === goal).reservedAmount,
      "1950.0000",
    );
    assert.equal((await plan(goal)).nextOn, "2026-12-30");
    assert.deepEqual(await periods(goal), [older]);
    await admin.query(
      "ALTER TABLE finance.contribution_periods DROP CONSTRAINT test_no_final",
    );

    await Promise.all([process("2026-12-30"), process("2026-12-30")]);
    const [final, preserved] = await periods(goal);
    assert.deepEqual(preserved, older);
    assert.equal(final.amount, "50.0000");
    assert.equal(final.status, "completed");
    assert.equal(final.resolution, "target_final");
    const achieved = (await funds()).find(({ id }) => id === goal);
    assert.equal(achieved.reservedAmount, "2000.0000");
    assert.equal(achieved.status, "paused_target_reached");
    assert.equal(fundTargetNotices(achieved, "2026-12-30").overdue, false);
    assert.equal((await plan(goal)).nextOn, null);
    assert.equal((await plan(goal)).amount, "200.0000");
    const shortPeriods = await periods(short);
    const [missed] = shortPeriods;
    assert.equal(missed.status, "missed_insufficient");
    assert.equal(missed.amount, "50.0000");
    assert.equal(
      (await funds()).find(({ id }) => id === short).reservedAmount,
      "1950.0000",
    );
    assert.equal((await plan(short)).nextOn, "2027-01-30");
    assert.equal((await plan(short)).nextAmount, "200.0000");

    const reactivate = command("reactivate", {
      fundId: goal,
      version: (await plan(goal)).version,
    });
    assert.equal(
      (await planCommand(reactivate, "2027-01-08", ownerB)).status,
      "not-found",
    );
    assert.equal(
      (await planCommand(reactivate, "2027-01-08")).status,
      "conflict",
    );
    assert.equal(
      (
        await fundCommand(
          command("release", {
            fundId: goal,
            version: achieved.version,
            amount: "75.1234",
          }),
        )
      ).status,
      "saved",
    );
    assert.equal((await plan(goal)).nextOn, null);
    assert.equal(
      (await funds()).find(({ id }) => id === goal).status,
      "paused_target_reached",
    );
    assert.equal((await planCommand(reactivate, "2027-01-08")).status, "saved");
    assert.equal((await planCommand(reactivate, "2027-01-08")).status, "saved");
    assert.equal((await plan(goal)).nextOn, "2027-02-28");
    assert.deepEqual(await periods(goal), [final, older]);

    const open = (await funds()).find(({ id }) => id === goal);
    const stale = command("close", {
      fundId: goal,
      version: open.version,
      pendingToken: await pendingContributionToken([]),
    });
    const closing = {
      ...stale,
      pendingToken: await pendingContributionToken([older.id]),
    };
    assert.equal((await fundCommand(closing, ownerB)).status, "not-found");
    assert.equal((await fundCommand(stale)).status, "conflict");
    const closed = await Promise.all([
      fundCommand(closing),
      fundCommand(closing),
    ]);
    assert.deepEqual(closed.map(({ status }) => status).sort(), [
      "replayed",
      "saved",
    ]);
    assert.equal((await plan(goal)).nextOn, null);
    assert.equal(
      (await funds()).find(({ id }) => id === goal).reservedAmount,
      "0.0000",
    );
    assert.equal(
      (await funds()).find(({ id }) => id === goal).status,
      "closed",
    );
    assert.equal((await periods(goal))[1].resolution, "fund_closed");
    assert.equal((await periods(goal))[1].reason, "late");
    assert.deepEqual(await periods(short), shortPeriods);
    assert.equal((await run(listFundClosures))[0].amount, "1924.8766");
    assert.deepEqual(await run(listFundClosures, ownerB), []);
    assert.deepEqual(await run(listContributionPeriods, ownerB), []);
    assert.deepEqual(await run(listFundAvailability), [
      { currency: "UYU", amount: "2025.0000" },
      { currency: "USD", amount: "49.9999" },
    ]);
    await run(async (client, owner) => {
      assert.deepEqual(
        (
          await client.query(
            "SELECT delta::numeric(20,4)::text AS delta FROM finance.reserve_effects WHERE owner_id = $1 AND fund_id = $2 ORDER BY fund_version",
            [owner, goal],
          )
        ).rows.map(({ delta }) => delta),
        ["1950.0000", "50.0000", "-75.1234", "-1924.8766"],
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
        0,
      );
    });
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
