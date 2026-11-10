import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  migrateInTransaction,
  readMigrations,
} from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.mts";
import {
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
    await client.query("SAVEPOINT money_update");
    await assert.rejects(
      client.query(
        "UPDATE finance.savings_funds SET reserved_amount = 1 WHERE owner_id = $1 AND id = $2",
        [ownerA, fund.id],
      ),
      { code: "42501" },
    );
    await client.query("ROLLBACK TO SAVEPOINT money_update");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
