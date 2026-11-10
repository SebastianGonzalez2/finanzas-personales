import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.ts";
import { parseCycleCommand } from "../../src/domain/card-cycles.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  listCardCycleAlerts,
  loadCardCycle,
  saveCardCycle,
} from "../../src/server/card-cycles.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import {
  saveCreditOperation,
  voidCreditOperation,
} from "../../src/server/credit-operations.ts";
import { listMovementTotals } from "../../src/server/movements.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

test("F2-04: CA-023, ciclos auditados, alertas y pagos sin duplicar gastos", async () => {
  const client = new pg.Client(testDatabaseConfig());
  const today = "2026-02-07";
  const owner = "cycle-owner-a";
  const other = "cycle-owner-b";
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await setOwnerContext(client, owner);
    await saveOpeningBalance(client, owner, {
      currency: "UYU",
      amount: "10000.0000",
      asOfDate: "2026-01-01",
    });
    const { id: cardId } = await saveCard(client, owner, {
      action: "create",
      kind: "credit",
      name: "Tarjeta sintética",
      issuer: null,
      currencies: [
        { currency: "UYU", limit: null },
        { currency: "USD", limit: null },
      ],
      idempotencyKey: randomUUID(),
    });
    const credit = async (fields) => {
      const command = parseCreditCommand(
        { cardId, idempotencyKey: randomUUID(), ...fields },
        today,
      );
      assert.ok(!("error" in command));
      return saveCreditOperation(client, owner, command);
    };
    const cycle = (fields, actor = owner) => {
      const command = parseCycleCommand({
        cardId,
        version: 0,
        idempotencyKey: randomUUID(),
        ...fields,
      });
      assert.ok(!("error" in command));
      return saveCardCycle(client, actor, command);
    };
    const purchase = (amount, effectiveOn, extra = {}) =>
      credit({
        action: "purchase",
        currency: "UYU",
        concept: "Compra sintética",
        covered: false,
        amount,
        effectiveOn,
        ...extra,
      });
    const cards = () => listCards(client, owner);
    const state = async (period = "2026-01") =>
      loadCardCycle(client, owner, (await cards())[0], period, today);
    const summary = async (period) => (await state(period)).summaries[0];
    const alerts = async () =>
      listCardCycleAlerts(client, owner, await cards(), today);
    const money = async () => {
      const [bank] = await listBankBalances(client, owner);
      return {
        bank: bank.calculatedAmount ?? bank.amount,
        debt: (await cards())[0].currencies[0].debt,
        january: (await listMovementTotals(client, owner, "2026-01-01")).map(
          ({ amount }) => amount,
        ),
        february: (await listMovementTotals(client, owner, "2026-02-01")).map(
          ({ amount }) => amount,
        ),
      };
    };

    const { id: first } = await purchase("4000.0001", "2026-01-24");
    await purchase("2000", "2026-01-27");
    const { id: plan } = await purchase("0", "2026-01-26", {
      plan: { installmentAmount: "250", count: 3, firstPeriod: "2026-02" },
    });
    assert.equal((await summary()).estimate, null);
    assert.deepEqual(await alerts(), []);
    const baseline = await money();
    const schedule = {
      scope: "schedule",
      closingDay: 25,
      dueDay: 10,
      leadDays: 3,
      idempotencyKey: randomUUID(),
    };
    assert.equal((await cycle(schedule)).status, "created");
    assert.equal((await cycle(schedule)).status, "replayed");
    assert.equal((await cycle({ ...schedule, dueDay: 11 })).status, "conflict");
    assert.equal(
      (await cycle({ ...schedule, idempotencyKey: randomUUID() })).status,
      "conflict",
    );
    assert.equal((await summary()).estimate, "4000.0001");
    assert.equal((await summary("2026-02")).estimate, "2250.0000");
    assert.equal((await alerts()).length, 1);
    assert.equal((await alerts())[0].official, false);

    const dates = {
      scope: "dates",
      period: "2026-01",
      closingOn: "2026-01-23",
      dueOn: "2026-02-09",
    };
    assert.equal((await cycle(dates)).status, "created");
    assert.equal((await summary()).estimate, "0.0000");
    assert.equal((await summary("2026-02")).estimate, "6250.0001");
    assert.equal(
      (await cycle({ ...dates, version: 1, closingOn: "" })).status,
      "created",
    );
    assert.equal((await alerts())[0].dueOn, "2026-02-09");

    const statement = {
      scope: "statement",
      period: "2026-01",
      currency: "UYU",
      officialAmount: "5500",
      minimumAmount: "1000",
      dueOn: "2026-02-10",
    };
    assert.equal((await cycle(statement)).status, "created");
    assert.equal((await summary()).difference, "1499.9999");
    assert.equal((await alerts()).length, 1);
    assert.equal((await alerts())[0].dueOn, "2026-02-10");
    assert.equal((await alerts())[0].amount, "5500.0000");
    assert.equal((await state()).summaries[1].statement.officialAmount, null);

    const move = {
      scope: "assignment",
      purchaseId: first,
      ordinal: 0,
      currency: "UYU",
      assignedPeriod: "2026-02",
      reviewed: false,
    };
    assert.equal((await cycle(move)).status, "conflict");
    assert.equal((await cycle({ ...move, reviewed: true })).status, "created");
    assert.equal((await summary()).estimate, "0.0000");
    assert.equal((await summary()).statement.officialAmount, "5500.0000");
    assert.equal(
      (await cycle({ ...move, version: 1, assignedPeriod: "", reviewed: true }))
        .status,
      "created",
    );
    assert.equal((await summary()).estimate, "4000.0001");
    assert.equal(
      (
        await cycle({
          ...move,
          purchaseId: plan,
          ordinal: 1,
          assignedPeriod: "2026-03",
        })
      ).status,
      "created",
    );
    assert.equal((await summary("2026-02")).estimate, "2000.0000");
    assert.equal((await summary("2026-03")).estimate, "500.0000");
    assert.equal((await summary("2026-04")).estimate, "250.0000");
    assert.deepEqual(await money(), baseline);

    const payment = {
      action: "payment",
      effectiveOn: today,
      idempotencyKey: randomUUID(),
      lines: [
        {
          currency: "UYU",
          amount: "1000",
          bankCurrency: "UYU",
          bankAmount: "1000",
          statementPeriod: "2026-01",
        },
      ],
    };
    const saved = await credit(payment);
    assert.equal(saved.status, "created");
    assert.equal((await credit(payment)).status, "replayed");
    assert.equal((await alerts())[0].alert, "informative");
    assert.equal((await summary()).remaining, "4500.0000");
    assert.equal((await summary("2026-02")).paid, "0.0000");
    assert.deepEqual(await money(), {
      ...baseline,
      bank: "9000.0000",
      debt: "5000.0001",
    });
    await voidCreditOperation(client, owner, {
      eventId: saved.id,
      idempotencyKey: randomUUID(),
    });
    assert.equal((await alerts())[0].alert, "pending");
    assert.deepEqual(await money(), baseline);

    assert.equal(
      (
        await client.query(
          "SELECT 1 FROM finance.card_cycle_changes WHERE scope = 'assignment'",
        )
      ).rowCount,
      3,
    );
    await client.query("SAVEPOINT no_cycle_update");
    await assert.rejects(
      client.query("UPDATE finance.card_cycle_changes SET version = 9"),
      { code: "42501" },
    );
    await client.query("ROLLBACK TO SAVEPOINT no_cycle_update");
    await setOwnerContext(client, other);
    assert.equal(
      (await client.query("SELECT 1 FROM finance.current_card_cycles"))
        .rowCount,
      0,
    );
    assert.equal((await cycle(statement, other)).status, "not-found");
    await client.query("SAVEPOINT no_foreign_cycle");
    await assert.rejects(
      client.query(
        `INSERT INTO finance.card_cycle_changes (owner_id,idempotency_key,command_hash,card_id,scope,version,lead_days) VALUES ($1,$2,repeat('a',64),$3,'schedule',1,3)`,
        [other, randomUUID(), cardId],
      ),
      { code: "23503" },
    );
    await client.query("ROLLBACK TO SAVEPOINT no_foreign_cycle");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
