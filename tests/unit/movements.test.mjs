import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseMovement } from "../../src/domain/movements.ts";

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

test("F1-03: registra importes exactos y normaliza campos opcionales", () => {
  assert.deepEqual(parseMovement(expense, today), {
    ...expense,
    amount: "1500.0001",
    concept: "Compra",
    note: null,
    categoryId: null,
  });
  const categoryId = randomUUID();
  const income = parseMovement(
    {
      ...expense,
      kind: "income",
      method: "deposit",
      concept: undefined,
      currency: "EUR",
      amount: "9999999999999999.9999",
      categoryId: categoryId.toUpperCase(),
      note: " Recibido ",
    },
    today,
  );
  assert.equal(income.concept, "");
  assert.equal(income.note, "Recibido");
  assert.equal(income.amount, "9999999999999999.9999");
  assert.equal(income.categoryId, categoryId);
});

test("F1-03: rechaza datos no permitidos para un movimiento real", () => {
  for (const invalid of [
    { ownerId: "otro" },
    { method: "credit" },
    { method: "deposit" },
    { kind: "income", method: "transfer" },
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
