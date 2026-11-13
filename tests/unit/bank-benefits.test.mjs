import assert from "node:assert/strict";
import test from "node:test";
import { parseBankBenefitCommand } from "../../src/domain/bank-benefits.ts";

const today = "2026-02-27";
const key = "6f2f8d6e-5f0a-4c1e-9d3a-0e5b6c7d8e9f";
const card = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = {
  action: "register",
  idempotencyKey: key,
  destination: "bank",
  currency: "UYU",
  amount: "300",
  effectiveOn: "2026-02-20",
  credited: true,
};

test("F5-09 CA-067: registra solo beneficios acreditados con importe exacto", () => {
  assert.deepEqual(parseBankBenefitCommand(base, today), {
    action: "register",
    idempotencyKey: key,
    destination: "bank",
    cardId: null,
    currency: "UYU",
    amount: "300.0000",
    effectiveOn: "2026-02-20",
    concept: "Beneficio bancario",
    note: null,
  });
  const decimal = parseBankBenefitCommand(
    { ...base, amount: " 12,3456 ", concept: "  Cashback  ", note: " ok " },
    today,
  );
  assert.equal(decimal.amount, "12.3456");
  assert.equal(decimal.concept, "Cashback");
  assert.equal(decimal.note, "ok");
  const onCard = parseBankBenefitCommand(
    { ...base, destination: "card", cardId: card.toUpperCase() },
    today,
  );
  assert.equal(onCard.destination, "card");
  assert.equal(onCard.cardId, card);
});

test("F5-09: rechaza beneficios estimados, futuros, ambiguos o inválidos", () => {
  const invalid = [
    { ...base, credited: undefined },
    { ...base, credited: false },
    { ...base, credited: "true" },
    { ...base, effectiveOn: "2026-02-28" },
    { ...base, effectiveOn: "2026-13-01" },
    { ...base, amount: "0" },
    { ...base, amount: "-5" },
    { ...base, amount: "1.00001" },
    { ...base, amount: "10000000000000000" },
    { ...base, amount: "abc" },
    { ...base, currency: "BRL" },
    { ...base, destination: "cash" },
    { ...base, destination: "card" },
    { ...base, destination: "card", cardId: "no-es-uuid" },
    { ...base, cardId: card },
    { ...base, concept: "x".repeat(121) },
    { ...base, note: "x".repeat(501) },
    { ...base, note: "con\0nulo" },
    { ...base, owner: "otro" },
    { ...base, idempotencyKey: "abc" },
    { ...base, action: "refund" },
    null,
    [],
    "texto",
  ];
  for (const input of invalid)
    assert.ok(
      "error" in parseBankBenefitCommand(input, today),
      JSON.stringify(input),
    );
});

test("F5-09: la anulación solo acepta el evento y la clave", () => {
  assert.deepEqual(
    parseBankBenefitCommand(
      { action: "void", idempotencyKey: key, eventId: card },
      today,
    ),
    { action: "void", idempotencyKey: key, eventId: card },
  );
  for (const input of [
    { action: "void", idempotencyKey: key },
    { action: "void", idempotencyKey: key, eventId: card, amount: "1" },
    { action: "void", idempotencyKey: key, eventId: "x" },
  ])
    assert.ok("error" in parseBankBenefitCommand(input, today));
});
