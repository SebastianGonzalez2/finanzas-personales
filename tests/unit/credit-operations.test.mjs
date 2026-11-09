import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCreditCommand,
  parseOpeningDebt,
} from "../../src/domain/credit-operations.ts";
import {
  installmentPeriodAt,
  installmentTotal,
} from "../../src/domain/installments.ts";

const cardId = "12345678-0000-0000-0000-000000000000";
const idempotencyKey = "87654321-0000-0000-0000-000000000000";
const today = "2026-01-15";
const base = { cardId, idempotencyKey, effectiveOn: today };

test("F2-02: pago multimoneda conserva importes reales exactos y normaliza reintentos", () => {
  const local = {
    currency: "UYU",
    amount: "20,1",
    bankCurrency: "UYU",
    bankAmount: "20.1000",
  };
  const foreign = {
    currency: "USD",
    amount: "1.0001",
    bankCurrency: "UYU",
    bankAmount: "42.1234",
    fee: "0,0101",
  };
  const parse = (lines) =>
    parseCreditCommand({ ...base, action: "payment", lines }, today);
  const command = parse([local, foreign]);
  assert.deepEqual(command, parse([foreign, local]));
  assert.deepEqual(command.lines, [
    { ...foreign, fee: "0.0101", allocations: [] },
    { ...local, amount: "20.1000", fee: "0.0000", allocations: [] },
  ]);
  for (const lines of [
    [],
    [local, local],
    [{ ...local, bankAmount: "20.1001" }],
    [{ ...local, amount: "20.10001" }],
    [{ ...foreign, fee: "-1" }],
    [{ ...foreign, fee: 0 }],
    [
      {
        ...foreign,
        allocations: [
          { purchaseId: cardId, amount: "1" },
          { purchaseId: cardId, amount: "0.01" },
        ],
      },
    ],
  ])
    assert.ok("error" in parse(lines));
});

test("F2-02: deuda inicial fechada y ajuste exacto sin parámetros de titular", () => {
  assert.deepEqual(
    parseOpeningDebt(
      { effectiveOn: today, lines: [{ currency: "EUR", amount: "5,0001" }] },
      today,
    ),
    {
      effectiveOn: today,
      lines: [{ currency: "EUR", amount: "5.0001" }],
    },
  );
  assert.throws(() =>
    parseOpeningDebt(
      { effectiveOn: "2026-01-16", lines: [{ currency: "EUR", amount: "5" }] },
      today,
    ),
  );
  const adjustment = {
    ...base,
    action: "adjustment",
    currency: "EUR",
    amount: "0",
    expectedDebt: "5,0001",
  };
  assert.deepEqual(parseCreditCommand(adjustment, today), {
    ...adjustment,
    amount: "0.0000",
    expectedDebt: "5.0001",
  });
  assert.ok(
    "error" in parseCreditCommand({ ...adjustment, ownerId: "foreign" }, today),
  );
});

test("F2-03: cuotas iguales exactas, meses válidos y cargo explícito", () => {
  const input = {
    ...base,
    action: "purchase",
    currency: "UYU",
    amount: "0",
    concept: "Prueba",
    covered: false,
    plan: { installmentAmount: "2000,0001", count: 3, firstPeriod: "2026-12" },
  };
  const parse = (fields) => parseCreditCommand({ ...input, ...fields }, today);
  const command = parse({});
  assert.equal(command.amount, "0.0000");
  assert.equal(installmentTotal(command.plan, "UYU"), "6000.0003");
  assert.equal(installmentPeriodAt(command.plan.firstPeriod, 2), "2027-02");
  assert.equal(parse({ amount: "6000.0003" }).amount, "6000.0003");
  for (const fields of [
    { amount: "6000.0004" },
    { amount: "-1" },
    { covered: true },
    { amount: 0 },
    ...[
      { count: 1 },
      { count: 2.5 },
      { count: 121 },
      { count: "3" },
      { firstPeriod: "2026-13" },
      { firstPeriod: "9999-11" },
      { firstPeriod: "0000-01" },
      { installmentAmount: "0" },
      { installmentAmount: "9999999999999999" },
      { installmentAmount: "0.00001" },
      { amounts: [1, 2, 3] },
    ].map((fields) => ({ plan: { ...input.plan, ...fields } })),
  ])
    assert.ok("error" in parse(fields), JSON.stringify(fields));

  const edit = {
    action: "edit-installments",
    eventId: cardId,
    idempotencyKey,
    expectedVersion: 1,
    plan: input.plan,
  };
  assert.equal(
    parseCreditCommand(edit, today).plan.installmentAmount,
    "2000.0001",
  );
  assert.ok("error" in parseCreditCommand({ ...edit, amount: "10" }, today));
  assert.ok(
    "error" in parseCreditCommand({ ...edit, expectedVersion: 0 }, today),
  );
});
