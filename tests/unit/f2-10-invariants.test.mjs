import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import {
  consistencyKey,
  creditPayment,
  loanSettle,
  sharedExpense,
} from "../support/f2-10-fixtures.mjs";

const today = "2026-01-15";
const cardId = randomUUID();
const loanId = randomUUID();
const purchaseId = randomUUID();

const refundPending = (idempotencyKey = consistencyKey()) => ({
  action: "pending",
  purchaseId,
  amount: "100",
  effectiveOn: today,
  idempotencyKey,
});

const validShared = () => sharedExpense();

test("F2-10 I-11/I-12: reintentos normalizados y sin titular inyectable", () => {
  const key = consistencyKey().toUpperCase();
  const payment = creditPayment({ cardId, idempotencyKey: key });
  const settle = loanSettle({ loanId, idempotencyKey: key });
  const shared = { ...validShared(), idempotencyKey: key };
  const refund = refundPending(key);

  const parsed = [
    parseCreditCommand(payment, today),
    parseLoanCommand(settle, today),
    parseSharedExpense(shared, today),
    parseRefundCommand(refund, today),
  ];
  for (const [index, command] of parsed.entries()) {
    assert.ok(!("error" in command), `comando ${index}: ${command.error}`);
    assert.equal(command.idempotencyKey, key.toLowerCase());
  }
  assert.deepEqual(
    parseCreditCommand(payment, today),
    parseCreditCommand(
      { ...payment, idempotencyKey: key.toLowerCase() },
      today,
    ),
  );

  for (const command of [payment, settle, shared, refund]) {
    const spoofed = { ...command, ownerId: "titular-ajeno" };
    const result =
      "lines" in command
        ? parseCreditCommand(spoofed, today)
        : "loanId" in command
          ? parseLoanCommand(spoofed, today)
          : "parties" in command
            ? parseSharedExpense(spoofed, today)
            : parseRefundCommand(spoofed, today);
    assert.ok("error" in result);
  }
});

test("F2-10 I-02/I-04: pagos y cobros parciales exactos, nunca importes nulos o negativos", () => {
  const partial = parseCreditCommand(
    creditPayment({ cardId, amount: "400" }),
    today,
  );
  assert.ok(!("error" in partial));

  for (const amount of ["0", "-400", "400.00001", "1.000,00"]) {
    assert.ok(
      "error" in parseCreditCommand(creditPayment({ cardId, amount }), today),
      `pago ${amount}`,
    );
    assert.ok(
      "error" in parseLoanCommand(loanSettle({ loanId, amount }), today),
      `cobro ${amount}`,
    );
    assert.ok(
      "error" in parseRefundCommand({ ...refundPending(), amount }, today),
      `devolución ${amount}`,
    );
  }

  const payment = creditPayment({ cardId });
  assert.ok(
    "error" in
      parseCreditCommand(
        { ...payment, lines: [{ ...payment.lines[0], fee: "-0.0001" }] },
        today,
      ),
  );
  for (const fields of [
    { principal: "-1" },
    { financialCharges: "-1" },
    { accruedPaid: "-1" },
  ]) {
    assert.ok(
      "error" in
        parseLoanCommand({ ...loanSettle({ loanId }), ...fields }, today),
      JSON.stringify(fields),
    );
  }
});

test("F2-10 I-05: la parte propia y las ajenas suman el total una sola vez", () => {
  const valid = parseSharedExpense(validShared(), today);
  assert.ok(!("error" in valid), valid.error);
  assert.deepEqual(
    valid.parties.map(({ name, amount }) => [name, amount]),
    [
      ["Ana", "1000.0000"],
      ["Belén", "1000.0000"],
      ["Carlos", "1000.0000"],
    ],
  );

  for (const fields of [
    { ownAmount: "1000.0001" },
    { ownAmount: "-1" },
    { parties: [{ name: "Ana", amount: "1000" }] },
    {
      parties: [
        { name: "Ana", amount: "1500" },
        { name: "ana", amount: "1500" },
      ],
    },
    {
      parties: [
        { name: "Ana", amount: "-1500" },
        { name: "Belén", amount: "3000" },
      ],
    },
  ]) {
    assert.ok(
      "error" in parseSharedExpense({ ...validShared(), ...fields }, today),
      JSON.stringify(fields),
    );
  }
});

test("F2-10 I-06: la compra con dos medios reparte el total y sus categorías", () => {
  const purchase = {
    action: "purchase",
    cardId,
    currency: "UYU",
    amount: "600",
    concept: "Compra mixta sintética",
    note: null,
    categoryId: null,
    covered: false,
    effectiveOn: today,
    idempotencyKey: consistencyKey(),
    mixed: {
      total: "1000",
      debitAmount: "400",
      debitCardId: null,
      categories: [
        { method: "debit", categoryId: null, amount: "400" },
        { method: "credit", categoryId: null, amount: "600" },
      ],
    },
  };
  const parsed = parseCreditCommand(purchase, today);
  assert.ok(!("error" in parsed), parsed.error);
  assert.deepEqual(
    parsed.mixed.categories.map(({ method, amount }) => [method, amount]),
    [
      ["credit", "600.0000"],
      ["debit", "400.0000"],
    ],
  );

  for (const mixed of [
    { ...purchase.mixed, total: "1000.0001" },
    {
      ...purchase.mixed,
      categories: [
        { method: "debit", categoryId: null, amount: "400" },
        { method: "credit", categoryId: null, amount: "500" },
      ],
    },
    {
      ...purchase.mixed,
      categories: [
        { method: "debit", categoryId: null, amount: "400" },
        { method: "credit", categoryId: null, amount: "300" },
        { method: "credit", categoryId: null, amount: "300" },
      ],
    },
  ]) {
    assert.ok(
      "error" in parseCreditCommand({ ...purchase, mixed }, today),
      JSON.stringify(mixed),
    );
  }
});
