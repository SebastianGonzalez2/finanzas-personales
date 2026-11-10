import assert from "node:assert/strict";
import test from "node:test";
import { parseLoanCommand } from "../../src/domain/loans.ts";

test("F2-07: exige moneda y dos importes reales sin cambiar el formato de reintento anterior", () => {
  const date = "2026-02-14";
  const command = {
    action: "settle",
    amount: "4000",
    effectiveOn: date,
    idempotencyKey: "a457c489-cd1e-479e-98b7-2832d32e35ab",
    loanId: "72f10c0a-d224-48eb-a5d6-0a4468b06d2b",
    expectedVersion: 1,
  };
  const legacy = parseLoanCommand(command, date);
  assert.equal(
    JSON.stringify(legacy),
    JSON.stringify({
      effectiveOn: date,
      idempotencyKey: command.idempotencyKey,
      amount: "4000.0000",
      note: null,
      loanId: command.loanId,
      expectedVersion: 1,
      action: "settle",
      principal: null,
      financialCharges: null,
      accruedPaid: null,
    }),
  );
  const exchange = { bankCurrency: "UYU", appliedAmount: "100,0001" };
  assert.deepEqual(parseLoanCommand({ ...command, ...exchange }, date), {
    ...legacy,
    exchange: { bankCurrency: "UYU", appliedAmount: "100.0001" },
  });
  for (const fields of [
    { bankCurrency: "UYU" },
    { appliedAmount: "100" },
    { ...exchange, bankCurrency: "GBP" },
    { ...exchange, appliedAmount: "0" },
    { ...exchange, appliedAmount: "-100" },
    { ...exchange, appliedAmount: "0.00001" },
    { ...exchange, amount: "0" },
    { ...exchange, financialCharges: "5" },
    { ...exchange, action: "adjust" },
  ])
    assert.ok("error" in parseLoanCommand({ ...command, ...fields }, date));
});
