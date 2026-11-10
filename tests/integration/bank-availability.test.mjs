import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import {
  setOwnerContext,
  withOwnerTransaction,
} from "../../src/db/owner-context.ts";
import {
  listBankAvailability,
  saveBalanceAdjustment,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { saveLoanOperation } from "../../src/server/loans.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveBankTransfer,
  saveMovement,
} from "../../src/server/movements.ts";
import { saveRefund } from "../../src/server/refunds.ts";
import { saveSavingsFund } from "../../src/server/savings-funds.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

const asOfDate = "2026-01-10";
const effectiveOn = "2026-01-11";
const today = "2026-01-20";
const keyed = (fields) => ({ idempotencyKey: randomUUID(), ...fields });
const expense = (amount, fields) =>
  keyed({
    kind: "expense",
    method: "debit",
    currency: "UYU",
    concept: "Gasto sintético",
    categoryId: null,
    note: null,
    effectiveOn,
    amount,
    ...fields,
  });
const reserve = (fundId, amount, version = 1) =>
  keyed({ action: "reserve", fundId, amount, version });

async function open(client, owner, currency, amount) {
  assert.equal(
    await saveOpeningBalance(client, owner, { currency, amount, asOfDate }),
    "created",
  );
  const fund = await saveSavingsFund(
    client,
    owner,
    keyed({ action: "create", name: "Vacaciones", currency }),
  );
  assert.equal(fund.status, "created");
  return fund.id;
}

const amounts = (rows) =>
  rows.map(
    ({
      currency,
      amount,
      calculatedAmount,
      reservedAmount,
      availableAmount,
    }) => [
      currency,
      calculatedAmount ?? amount,
      reservedAmount,
      availableAmount,
    ],
  );

test("F3-02: las salidas vigentes respetan reservas por moneda y preservan los efectos auditados", async () => {
  const client = new pg.Client(testDatabaseConfig());
  const owner = "f3-02-a";
  const other = "f3-02-b";
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await setOwnerContext(client, other);
    const otherFund = await open(client, other, "UYU", "500.0000");
    assert.equal(
      (await saveSavingsFund(client, other, reserve(otherFund, "500.0000")))
        .status,
      "saved",
    );

    await setOwnerContext(client, owner);
    const fund = await open(client, owner, "UYU", "1000.0000");
    const usdFund = await open(client, owner, "USD", "400.0000");
    assert.equal(
      (await saveSavingsFund(client, owner, reserve(fund, "800.0000"))).status,
      "saved",
    );
    assert.equal(
      (await saveSavingsFund(client, owner, reserve(usdFund, "400.0000")))
        .status,
      "saved",
    );
    const balances = async () =>
      amounts(await listBankAvailability(client, owner));
    const before = [
      ["UYU", "1000.0000", "800.0000", "200.0000"],
      ["USD", "400.0000", "400.0000", "0.0000"],
    ];
    assert.deepEqual(await balances(), before);
    assert.deepEqual(await listBankAvailability(client, other), []);

    const { id: cardId } = await saveCard(
      client,
      owner,
      keyed({
        action: "create",
        kind: "credit",
        name: "Tarjeta de prueba",
        issuer: null,
        currencies: [{ currency: "UYU", limit: null }],
      }),
    );
    const credit = (fields) => {
      const command = parseCreditCommand(
        keyed({ cardId, effectiveOn, ...fields }),
        today,
      );
      assert.ok(!("error" in command), command.error);
      return saveCreditOperation(client, owner, command);
    };
    const purchase = {
      action: "purchase",
      currency: "UYU",
      amount: "500",
      concept: "Crédito de prueba",
      covered: false,
    };
    assert.equal((await credit(purchase)).status, "created");
    const payment = (amount) =>
      credit({
        action: "payment",
        lines: [
          { currency: "UYU", amount, bankCurrency: "UYU", bankAmount: amount },
        ],
      });
    const mixed = await credit({
      ...purchase,
      amount: "30",
      mixed: {
        total: "230.0001",
        debitAmount: "200.0001",
        categories: [
          { method: "debit", amount: "200.0001", categoryId: null },
          { method: "credit", amount: "30", categoryId: null },
        ],
      },
    });
    const loan = parseLoanCommand(
      keyed({
        action: "lend",
        direction: "receivable",
        installmentLoan: false,
        concept: "Préstamo de prueba",
        currency: "UYU",
        amount: "200.0001",
        effectiveOn,
      }),
      today,
    );
    assert.ok(!("error" in loan), loan.error);
    assert.match(mixed.message, /Disponible libre insuficiente/);
    assert.match(
      (await payment("200.0001")).message,
      /Disponible libre insuficiente/,
    );
    assert.match(
      (await saveLoanOperation(client, owner, loan)).message,
      /disponible libre/,
    );
    assert.deepEqual(
      await saveBankTransfer(
        client,
        owner,
        keyed({
          kind: "bank_transfer",
          sourceCurrency: "UYU",
          sourceAmount: "200.0001",
          destinationCurrency: "USD",
          destinationAmount: "5.0000",
          effectiveOn,
        }),
      ),
      { status: "insufficient-funds", shortfall: "0.0001", currency: "UYU" },
    );
    assert.deepEqual(await balances(), before);
    assert.equal(
      (await listCards(client, owner))[0].currencies[0].debt,
      "500.0000",
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
      0,
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.loans")).rowCount,
      0,
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.financial_events")).rowCount,
      1,
    );

    const paid = await payment("100");
    assert.equal(paid.status, "created");
    const debit = expense("100.0000");
    const saved = await saveMovement(client, owner, debit);
    assert.equal(saved.status, "created");
    assert.deepEqual(await saveMovement(client, owner, debit), {
      status: "replayed",
      id: saved.id,
    });
    assert.deepEqual(
      await reviseMovement(
        client,
        owner,
        keyed({ action: "correct", eventId: saved.id, amount: "100.0001" }),
      ),
      { status: "insufficient-funds", shortfall: "0.0001", currency: "UYU" },
    );
    assert.deepEqual(await balances(), [
      ["UYU", "800.0000", "800.0000", "0.0000"],
      before[1],
    ]);
    assert.equal(
      (await listCards(client, owner))[0].currencies[0].debt,
      "400.0000",
    );
    assert.deepEqual(await listMovementTotals(client, owner, "2026-01-01"), [
      { kind: "expense", currency: "UYU", amount: "600.0000" },
    ]);
    assert.equal(
      (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
      2,
    );

    // A bank credit can back a new reservation. Voiding it must then fail.
    const refund = async (fields) => {
      const command = parseRefundCommand(keyed(fields), today);
      assert.ok(!("error" in command), command.error);
      return saveRefund(client, owner, command, today);
    };
    const credited = await refund({
      action: "credit",
      purchaseId: saved.id,
      effectiveOn,
      parts: [{ method: "debit", amount: "25", categoryId: null }],
    });
    assert.equal(credited.status, "created");
    assert.equal(
      (await saveSavingsFund(client, owner, reserve(fund, "25.0000", 2)))
        .status,
      "saved",
    );
    assert.match(
      (await refund({ action: "void", eventId: credited.id })).message,
      /disponible libre/,
    );

    // A real confirmation can disclose a deficit. Covered history does not
    // spend the current balance, and the deficit prevents new outflows.
    assert.equal(
      (
        await saveBalanceAdjustment(
          client,
          owner,
          keyed({
            currency: "UYU",
            amount: "800.0000",
            asOfDate: effectiveOn,
            note: null,
          }),
        )
      ).status,
      "created",
    );
    assert.equal(
      (await refund({ action: "void", eventId: credited.id })).status,
      "revised",
    );
    assert.equal(
      (await saveMovement(client, owner, expense("0.0001"))).status,
      "insufficient-funds",
    );
    assert.deepEqual((await balances())[0], [
      "UYU",
      "800.0000",
      "825.0000",
      "-25.0000",
    ]);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("F3-02: un gasto concurrente espera la reserva y vuelve a validar antes de escribir", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 3 });
  const owner = "f3-02-concurrente";
  const asOwner = (work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  const admin = await pool.connect();
  let installed = false;
  let reserving;
  let spending;
  try {
    await admin.query("BEGIN");
    await migrateInTransaction(admin);
    await admin.query("COMMIT");
    installed = true;
    const fund = await asOwner((client) =>
      open(client, owner, "UYU", "100.0000"),
    );
    reserving = await pool.connect();
    await reserving.query("BEGIN");
    await setOwnerContext(reserving, owner);
    const reservation = reserve(fund, "60.0001");
    assert.equal(
      (await saveSavingsFund(reserving, owner, reservation)).status,
      "saved",
    );
    const command = expense("40.0000");
    spending = asOwner((client) => saveMovement(client, owner, command)).then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    const {
      rows: [{ pid }],
    } = await reserving.query("SELECT pg_backend_pid() AS pid");
    let blocked = false;
    for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
      const { rowCount } = await admin.query(
        "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND $1 = ANY(pg_blocking_pids(pid))",
        [pid],
      );
      blocked = rowCount === 1;
      if (!blocked) await delay(20);
    }
    assert.ok(blocked);
    await reserving.query("COMMIT");
    assert.deepEqual(await spending, {
      result: { status: "insufficient-funds", shortfall: "0.0001" },
    });
    reserving.release();
    reserving = undefined;
    await asOwner(async (client) => {
      assert.equal(
        (await saveSavingsFund(client, owner, reservation)).status,
        "replayed",
      );
      assert.deepEqual(amounts(await listBankAvailability(client, owner)), [
        ["UYU", "100.0000", "60.0001", "39.9999"],
      ]);
      assert.equal(
        (await client.query("SELECT 1 FROM finance.reserve_effects")).rowCount,
        1,
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.financial_events")).rowCount,
        0,
      );
      assert.equal(
        (await client.query("SELECT 1 FROM finance.bank_effects")).rowCount,
        0,
      );
      assert.deepEqual(
        await listMovementTotals(client, owner, "2026-01-01"),
        [],
      );
    });
  } finally {
    if (reserving) {
      await reserving.query("ROLLBACK").catch(() => {});
      reserving.release();
    }
    await spending;
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
