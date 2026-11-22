import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { URLSearchParams } from "node:url";
import { historySearch, parseHistoryParams } from "../../src/domain/history.ts";
import {
  parseMovement,
  parseMovementRevision,
} from "../../src/domain/movements.ts";

const today = "2026-11-08";
const expense = {
  kind: "expense",
  currency: "UYU",
  amount: "1500,0001",
  effectiveOn: today,
  method: "debit",
  concept: " Compra ",
  idempotencyKey: randomUUID(),
};

test("F1-07: valida rangos exactos y el cursor de un gasto", () => {
  const cursor = { date: today, id: randomUUID(), kind: "expense" };
  const filters = {
    q: "alquiler %",
    min: "9007199254740993,0001",
    max: "9007199254740993,0002",
  };
  const input = Object.fromEntries(
    new URLSearchParams(historySearch(filters, cursor)),
  );
  assert.deepEqual(parseHistoryParams(input), {
    filters,
    minimum: "9007199254740993.0001",
    maximum: "9007199254740993.0002",
    cursor,
  });
  for (const invalid of [
    { min: filters.max, max: filters.min },
    { from: "2025-02-29" },
    { q: ["uno", "dos"] },
    { before: "2025-01-01.falso.expense" },
    { status: "scheduled" },
  ]) {
    assert.ok(parseHistoryParams(invalid).error);
  }
});

test("F1-07: edición reusa la validación de alta y rechaza campos de autoridad", () => {
  const { idempotencyKey, ...movement } = expense;
  const edit = {
    action: "edit",
    eventId: randomUUID(),
    idempotencyKey,
    movement,
  };
  assert.deepEqual(parseMovementRevision(edit, today), {
    ...edit,
    movement: parseMovement(expense, today),
  });
  for (const invalid of [
    { ownerId: "ajeno" },
    { idempotencyKey: randomUUID() },
    { effectiveOn: "2026-11-09" },
    { amount: 50 },
  ]) {
    assert.ok(
      parseMovementRevision(
        { ...edit, movement: { ...movement, ...invalid } },
        today,
      ).error,
    );
  }
});

test("F1-03: registra importes exactos y normaliza campos opcionales", () => {
  assert.deepEqual(parseMovement(expense, today), {
    ...expense,
    amount: "1500.0001",
    concept: "Compra",
    note: null,
    categoryId: null,
  });
  const categoryId = randomUUID();
  const optional = parseMovement(
    {
      ...expense,
      method: "transfer",
      concept: "Sin ingreso",
      currency: "EUR",
      amount: "9999999999999999.9999",
      categoryId: categoryId.toUpperCase(),
      note: " Recibido ",
    },
    today,
  );
  assert.equal(optional.concept, "Sin ingreso");
  assert.equal(optional.note, "Recibido");
  assert.equal(optional.amount, "9999999999999999.9999");
  assert.equal(optional.categoryId, categoryId);
});

test("F1-04: valida revisiones y conserva importes superiores a la precisión binaria", () => {
  const idempotencyKey = randomUUID();
  const eventId = randomUUID();
  const payload = {
    action: "correct",
    eventId: eventId.toUpperCase(),
    idempotencyKey,
  };
  assert.deepEqual(
    parseMovementRevision({ ...payload, amount: "9007199254740993,0001" }),
    {
      ...payload,
      eventId,
      amount: "9007199254740993.0001",
    },
  );
  assert.deepEqual(parseMovementRevision({ ...payload, action: "void" }), {
    ...payload,
    eventId,
    action: "void",
  });
  for (const amount of [
    undefined,
    500,
    "5e2",
    "0",
    "-1",
    "1.00001",
    "10000000000000000",
    "1.500,00",
  ]) {
    assert.ok("error" in parseMovementRevision({ ...payload, amount }));
  }
  for (const fields of [
    { ownerId: "otro" },
    { currency: "USD" },
    { eventId: "inválido" },
    { idempotencyKey: null },
    { action: "void", amount: "1" },
  ]) {
    assert.ok(
      "error" in parseMovementRevision({ ...payload, amount: "1", ...fields }),
    );
  }
});

test("F1-03: rechaza datos no permitidos para un movimiento real", () => {
  for (const invalid of [
    { ownerId: "otro" },
    { method: "credit" },
    { method: "deposit" },
    { kind: "income" },
    { kind: "bank_transfer" },
    { kind: "expense", concept: "" },
    { amount: 1500 },
    { amount: "1.500,00" },
    { amount: "0" },
    { amount: "-1" },
    { amount: "1.00001" },
    { currency: "ARS" },
    { effectiveOn: "2026-02-29" },
    { effectiveOn: "2026-11-09" },
    { concept: " " },
    { note: "a".repeat(501) },
    { categoryId: "otro" },
    { idempotencyKey: "" },
  ])
    assert.ok(
      "error" in parseMovement({ ...expense, ...invalid }, today),
      JSON.stringify(invalid),
    );
});

test("SIMP-02: el gasto no exige medio bancario y reparte cuotas exactas", () => {
  const { method, ...withoutMethod } = expense;
  assert.equal(method, "debit");
  assert.equal(parseMovement(withoutMethod, today).method, "unspecified");
  assert.ok("error" in parseMovement({ ...expense, method: "deposit" }, today));

  const plan = { installmentAmount: "5000", count: 6, firstPeriod: "2026-11" };
  const { amount, ...withoutAmount } = withoutMethod;
  assert.equal(amount, "1500,0001");
  const parsed = parseMovement({ ...withoutAmount, plan }, today);
  assert.equal(parsed.amount, "30000.0000");
  assert.deepEqual(parsed.plan, { ...plan, installmentAmount: "5000.0000" });
  assert.equal(
    parseMovement({ ...withoutAmount, amount: "30000", plan }, today).amount,
    "30000.0000",
  );
  for (const invalid of [
    { ...withoutAmount, amount: "29999", plan },
    { ...withoutAmount, plan: { ...plan, count: 121 } },
    { ...withoutAmount, plan: { ...plan, firstPeriod: "2026-13" } },
    { ...withoutAmount, plan: { ...plan, installmentAmount: "-1" } },
    { ...withoutAmount, plan: { ...plan, extra: true } },
    { ...withoutAmount, kind: "income", plan },
    { ...withoutAmount, plan, fundPortions: [] },
    { ...withoutAmount, plan, cardAmounts: [] },
  ])
    assert.ok(
      "error" in parseMovement(invalid, today),
      JSON.stringify(invalid),
    );
});
