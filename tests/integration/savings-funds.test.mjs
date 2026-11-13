import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import {
  migrateInTransaction,
  readMigrations,
} from "../../src/db/migrations.mts";
import {
  setOwnerContext,
  withOwnerTransaction,
} from "../../src/db/owner-context.mts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  listFundAvailability,
  listSavingsFunds,
  saveSavingsFund,
} from "../../src/server/savings-funds.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F3-01: catálogo de fondos con idempotencia, versión y aislamiento A/B", async () => {
  const client = new pg.Client(testDatabaseConfig());
  try {
    await client.connect();
  } catch {
    throw new Error("PostgreSQL desechable no disponible");
  }
  const ownerA = `f3-01-synthetic-a-${randomUUID()}`;
  const ownerB = `f3-01-synthetic-b-${randomUUID()}`;
  try {
    await client.query("BEGIN");
    await client.query(
      'CREATE SCHEMA neon_auth; REVOKE ALL ON SCHEMA neon_auth FROM PUBLIC; CREATE TABLE neon_auth."user" (id text)',
    );
    assert.ok(
      (await migrateInTransaction(client)).includes(
        "0015_F3-01_savings_funds.sql",
      ),
    );
    assert.ok((await readMigrations()).length >= 15);

    await setOwnerContext(client, ownerA);
    const create = {
      action: "create",
      name: " Vacaciones ",
      currency: "USD",
      idempotencyKey: randomUUID(),
    };
    const created = await saveSavingsFund(client, ownerA, {
      ...create,
      name: "Vacaciones",
    });
    assert.equal(created.status, "created");
    assert.equal(
      (
        await saveSavingsFund(client, ownerA, {
          ...create,
          name: "Vacaciones",
        })
      ).status,
      "replayed",
    );
    const replay = await saveSavingsFund(client, ownerA, {
      ...create,
      name: "Vacaciones",
    });
    assert.equal(replay.id, created.id);
    assert.equal(
      (
        await saveSavingsFund(client, ownerA, {
          ...create,
          name: "Otro nombre",
        })
      ).status,
      "conflict",
    );

    let [fund] = await listSavingsFunds(client, ownerA);
    assert.deepEqual(
      {
        name: fund.name,
        currency: fund.currency,
        reservedAmount: fund.reservedAmount,
        status: fund.status,
        version: fund.version,
      },
      {
        name: "Vacaciones",
        currency: "USD",
        reservedAmount: "0.0000",
        status: "active",
        version: 1,
      },
    );

    assert.equal(
      (
        await saveSavingsFund(client, ownerA, {
          action: "update",
          fundId: fund.id,
          version: fund.version,
          name: "Emergencia",
          status: "paused_manual",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "saved",
    );
    [fund] = await listSavingsFunds(client, ownerA);
    assert.equal(fund.name, "Emergencia");
    assert.equal(fund.status, "paused_manual");
    assert.equal(fund.version, 2);
    assert.equal(
      (
        await saveSavingsFund(client, ownerA, {
          action: "update",
          fundId: fund.id,
          version: 1,
          name: "Atrasado",
          status: "active",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "conflict",
    );

    await setOwnerContext(client, ownerB);
    assert.deepEqual(await listSavingsFunds(client, ownerB), []);
    assert.equal(
      (
        await client.query(
          "SELECT id FROM finance.savings_funds WHERE id = $1",
          [fund.id],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await saveSavingsFund(client, ownerB, {
          action: "update",
          fundId: fund.id,
          version: 2,
          name: "Ajeno",
          status: "active",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "not-found",
    );
    await client.query("SAVEPOINT cross_owner_insert");
    await assert.rejects(
      client.query(
        "INSERT INTO finance.savings_funds (owner_id, id, name, currency) VALUES ($1, $2, 'Ajeno', 'UYU')",
        [ownerA, randomUUID()],
      ),
      { code: "42501" },
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_owner_insert");
    assert.equal(
      (
        await client.query(
          "UPDATE finance.savings_funds SET reserved_amount = 1 WHERE owner_id = $1 AND id = $2",
          [ownerA, fund.id],
        )
      ).rowCount,
      0,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});

const create = (name, currency = "UYU") => ({
  action: "create",
  name,
  currency,
  idempotencyKey: randomUUID(),
});
const reserve = (fundId, amount, version = 1) => ({
  action: "reserve",
  fundId,
  amount,
  version,
  idempotencyKey: randomUUID(),
});

test("F3-04: meta y fecha objetivo editables sin reactivar la pausa por meta", async () => {
  const client = new pg.Client(testDatabaseConfig());
  try {
    await client.connect();
  } catch {
    throw new Error("PostgreSQL desechable no disponible");
  }
  const owner = `f3-04-metas-${randomUUID()}`;
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await setOwnerContext(client, owner);
    const { id } = await saveSavingsFund(client, owner, create("Meta"));
    const update = {
      action: "update",
      fundId: id,
      version: 1,
      name: "Meta",
      targetAmount: "2000.0000",
      targetDate: "2027-12-01",
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (await saveSavingsFund(client, owner, update)).status,
      "saved",
    );
    assert.equal(
      (await saveSavingsFund(client, owner, update)).status,
      "replayed",
    );
    let [fund] = await listSavingsFunds(client, owner);
    assert.deepEqual(
      {
        targetAmount: fund.targetAmount,
        targetDate: fund.targetDate,
        status: fund.status,
        version: fund.version,
      },
      {
        targetAmount: "2000.0000",
        targetDate: "2027-12-01",
        status: "active",
        version: 2,
      },
    );

    // Quitar la fecha conserva la meta; el envío idempotente con otros datos choca.
    assert.equal(
      (
        await saveSavingsFund(client, owner, {
          ...update,
          version: fund.version,
          targetDate: null,
          idempotencyKey: randomUUID(),
        })
      ).status,
      "saved",
    );
    [fund] = await listSavingsFunds(client, owner);
    assert.equal(fund.targetDate, null);
    assert.equal(fund.targetAmount, "2000.0000");

    await saveOpeningBalance(client, owner, {
      currency: "UYU",
      amount: "3000.0000",
      asOfDate: "2026-11-01",
    });
    assert.equal(
      (
        await saveSavingsFund(
          client,
          owner,
          reserve(id, "2000.0000", fund.version),
        )
      ).status,
      "saved",
    );
    [fund] = await listSavingsFunds(client, owner);
    assert.equal(fund.status, "paused_target_reached");
    // Cambiar el estado explícito tampoco reactiva: la reactivación es expresa.
    assert.equal(
      (
        await saveSavingsFund(client, owner, {
          ...update,
          version: fund.version,
          status: "active",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "conflict",
    );
    // Aumentar la meta conserva el estado pausado por meta.
    assert.equal(
      (
        await saveSavingsFund(client, owner, {
          ...update,
          version: fund.version,
          targetAmount: "2500.0000",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "saved",
    );
    [fund] = await listSavingsFunds(client, owner);
    assert.equal(fund.status, "paused_target_reached");
    assert.equal(fund.targetAmount, "2500.0000");
    assert.equal(fund.version, 5);
    assert.deepEqual(
      (
        await client.query(
          "SELECT configuration FROM finance.fund_changes WHERE owner_id = $1 ORDER BY version DESC LIMIT 1",
          [owner],
        )
      ).rows[0].configuration,
      { name: "Meta", targetAmount: "2500.0000", targetDate: "2027-12-01" },
    );
    assert.equal(
      (
        await saveSavingsFund(client, owner, {
          ...update,
          version: fund.version,
          targetAmount: null,
          idempotencyKey: randomUUID(),
        })
      ).status,
      "saved",
    );
    [fund] = await listSavingsFunds(client, owner);
    assert.equal(fund.targetAmount, null);
    assert.equal(fund.status, "paused_target_reached");
    assert.equal(fund.reservedAmount, "2000.0000");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});

test("F3-01 CA-038: efectos exactos, sin impacto bancario, con RLS y rollback atómico", async () => {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  const a = "f3-01-owner-a";
  const b = "f3-01-owner-b";
  const save = (command, owner = a) => saveSavingsFund(client, owner, command);
  const available = async () =>
    (await listFundAvailability(client, a))[0].amount;
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await client.query(`ALTER TABLE finance.reserve_effects
      ADD CONSTRAINT reject_fixture_delta CHECK (delta <> 13.0001)`);
    await setOwnerContext(client, a);
    const { id: source } = await save(create("Vacaciones"));
    const { id: target } = await save(create("Emergencia"));
    const { id: usd } = await save(create("Viaje USD", "USD"));
    assert.equal(
      await saveOpeningBalance(client, a, {
        currency: "UYU",
        amount: "10000.0000",
        asOfDate: "2026-01-01",
      }),
      "created",
    );
    assert.equal((await save(reserve(usd, "1.0000"))).status, "conflict");

    const command = reserve(source, "3000.0000");
    assert.equal((await save(command)).status, "saved");
    assert.equal((await save(command)).status, "replayed");
    assert.equal(
      (await save({ ...command, amount: "3000.0001" })).status,
      "conflict",
    );
    assert.equal(
      (
        await save({
          ...create("Colisión"),
          idempotencyKey: command.idempotencyKey,
        })
      ).status,
      "conflict",
    );
    assert.equal(await available(), "7000.0000");
    assert.equal(
      (await listSavingsFunds(client, a)).find(({ id }) => id === source)
        .reservedAmount,
      "3000.0000",
    );
    assert.equal((await save(reserve(target, "7000.0001"))).status, "conflict");

    const transfer = {
      ...reserve(source, "1000.0001", 2),
      action: "transfer",
      destinationFundId: target,
      destinationVersion: 1,
    };
    assert.equal(
      (await save({ ...transfer, destinationFundId: usd })).status,
      "conflict",
    );
    assert.equal(
      (await save({ ...transfer, amount: "3000.0001" })).status,
      "conflict",
    );
    assert.equal(
      (await save({ ...transfer, destinationVersion: 2 })).status,
      "conflict",
    );
    const release = { ...reserve(source, "500.0002", 3), action: "release" };

    await setOwnerContext(client, b);
    const { id: other } = await save(create("Ajeno"), b);
    for (const operation of [
      command,
      release,
      transfer,
      { ...transfer, fundId: other },
    ])
      assert.equal((await save(operation, b)).status, "not-found");
    for (const relation of ["savings_funds", "fund_changes", "reserve_effects"])
      assert.equal(
        (
          await client.query(
            `SELECT 1 FROM finance.${relation} WHERE owner_id = $1`,
            [a],
          )
        ).rowCount,
        0,
      );

    await setOwnerContext(client, a);
    assert.equal(
      (await save({ ...transfer, destinationFundId: other })).status,
      "not-found",
    );
    const before = await listSavingsFunds(client, a);
    await client.query("SAVEPOINT before_transfer");
    await assert.rejects(save({ ...transfer, amount: "13.0001" }), {
      code: "23514",
    });
    await client.query("ROLLBACK TO SAVEPOINT before_transfer");
    assert.deepEqual(await listSavingsFunds(client, a), before);
    assert.equal(
      (
        await client.query(
          "SELECT 1 FROM finance.fund_changes WHERE idempotency_key = $1",
          [transfer.idempotencyKey],
        )
      ).rowCount,
      0,
    );
    assert.equal((await save(transfer)).status, "saved");
    assert.equal((await save(transfer)).status, "replayed");
    assert.equal(await available(), "7000.0000");
    assert.equal(
      (await save({ ...release, amount: "2000.0000" })).status,
      "conflict",
    );
    assert.equal((await save(release)).status, "saved");
    assert.equal((await save(release)).status, "replayed");
    assert.equal(await available(), "7500.0002");
    assert.deepEqual(
      (
        await client.query(
          "SELECT delta::text, fund_version FROM finance.reserve_effects AS effect ORDER BY effect.delta",
        )
      ).rows,
      [
        { delta: "-1000.0001", fund_version: 3 },
        { delta: "-500.0002", fund_version: 4 },
        { delta: "1000.0001", fund_version: 2 },
        { delta: "3000.0000", fund_version: 2 },
      ],
    );
    assert.equal((await listBankBalances(client, a))[0].amount, "10000.0000");
    for (const relation of [
      "bank_effects",
      "financial_events",
      "ordinary_movements",
    ])
      assert.equal(
        (await client.query(`SELECT 1 FROM finance.${relation}`)).rowCount,
        0,
      );

    await client.query("SAVEPOINT ledger_permissions");
    await assert.rejects(client.query("DELETE FROM finance.reserve_effects"), {
      code: "42501",
    });
    await client.query("ROLLBACK TO SAVEPOINT ledger_permissions");
    await assert.rejects(
      client.query(
        `INSERT INTO finance.reserve_effects (owner_id, command_id, fund_id, currency, delta, fund_version)
      VALUES ($1, $2, $3, 'UYU', 1, 2)`,
        [a, command.idempotencyKey, other],
      ),
      { code: "23503" },
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});

test("F3-01: dos reservas concurrentes revalidan el disponible tras un cambio en Bancos", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 4 });
  const owner = "f3-01-concurrent";
  const run = (work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const admin = await pool.connect();
  let installed = false;
  let bank;
  let pending;
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
    installed = true;
    const [left, right] = await run(async (client) => {
      await saveOpeningBalance(client, owner, {
        currency: "UYU",
        amount: "100.0000",
        asOfDate: "2026-01-01",
      });
      return [
        await saveSavingsFund(client, owner, create("A")),
        await saveSavingsFund(client, owner, create("B")),
      ];
    });
    bank = await pool.connect();
    await bank.query("BEGIN");
    await setOwnerContext(bank, owner);
    const debit = await saveMovement(bank, owner, {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount: "40.0000",
      effectiveOn: "2026-01-02",
      concept: "Gasto concurrente",
      note: null,
      categoryId: null,
      idempotencyKey: randomUUID(),
    });
    assert.equal(debit.status, "created");
    const commands = [
      reserve(left.id, "40.0000"),
      reserve(right.id, "40.0000"),
    ];
    const {
      rows: [{ pid }],
    } = await bank.query("SELECT pg_backend_pid() AS pid");
    pending = Promise.allSettled(
      commands.map((command) =>
        run((client) => saveSavingsFund(client, owner, command)),
      ),
    );
    let waiting = 0;
    for (let attempt = 0; attempt < 100 && waiting < 2; attempt += 1) {
      const {
        rows: [{ count }],
      } = await admin.query(
        `SELECT count(DISTINCT waiter.pid)::int AS count
        FROM pg_locks blocker JOIN pg_locks waiter USING (database, classid, objid, objsubid)
        WHERE blocker.pid = $1 AND blocker.locktype = 'advisory' AND blocker.granted
          AND waiter.locktype = 'advisory' AND NOT waiter.granted`,
        [pid],
      );
      waiting = count;
      if (waiting < 2) await delay(25);
    }
    assert.equal(waiting, 2);
    await bank.query("COMMIT");
    assert.deepEqual(
      (await pending)
        .map((result) => {
          if (result.status === "rejected") throw result.reason;
          return result.value.status;
        })
        .sort(),
      ["conflict", "saved"],
    );
    await run(async (client) => {
      assert.equal(
        (await listFundAvailability(client, owner))[0].amount,
        "20.0000",
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.reserve_effects")).rowCount,
        1,
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
        1,
      );
    });
  } finally {
    if (bank) {
      await bank.query("ROLLBACK").catch(() => {});
      bank.release();
    }
    await pending;
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
