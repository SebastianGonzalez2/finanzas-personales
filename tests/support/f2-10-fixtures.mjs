import { randomUUID } from "node:crypto";

// Synthetic data only: the values below never come from a real account,
// statement, card or person. Shared by the F2-10 consistency tests.
export const consistencyAmounts = Object.freeze({
  openingBank: "10000.0000",
  purchase: "1000.0000",
  partialPayment: "400.0000",
  remainingDebt: "600.0000",
  overpayment: "700.0000",
  sharedExpense: "4000.0000",
  sharedOwn: "1000.0000",
  sharedParty: "1000.0000",
  loanPrincipal: "1000.0000",
  loanPartial: "400.0000",
});

export function consistencyOwners(prefix = "f2-10") {
  return {
    owner: `${prefix}-a-${randomUUID()}`,
    other: `${prefix}-b-${randomUUID()}`,
  };
}

export const consistencyKey = () => randomUUID();

export function openingBalance({
  currency = "UYU",
  amount = consistencyAmounts.openingBank,
  asOfDate = "2026-01-01",
} = {}) {
  return { currency, amount, asOfDate };
}

export function cardCommand({
  name = "Tarjeta sintética F2-10",
  currency = "UYU",
  idempotencyKey = consistencyKey(),
} = {}) {
  return {
    action: "create",
    kind: "credit",
    name,
    issuer: null,
    currencies: [{ currency, limit: null }],
    idempotencyKey,
  };
}

export function creditPurchase({
  cardId,
  amount = consistencyAmounts.purchase,
  currency = "UYU",
  effectiveOn = "2026-01-15",
  idempotencyKey = consistencyKey(),
  concept = "Compra sintética F2-10",
} = {}) {
  return {
    action: "purchase",
    cardId,
    currency,
    amount,
    concept,
    note: null,
    categoryId: null,
    covered: false,
    effectiveOn,
    idempotencyKey,
  };
}

export function creditPayment({
  cardId,
  amount = consistencyAmounts.partialPayment,
  currency = "UYU",
  bankAmount = amount,
  fee = "0",
  effectiveOn = "2026-01-15",
  idempotencyKey = consistencyKey(),
  allocations = [],
} = {}) {
  return {
    action: "payment",
    cardId,
    effectiveOn,
    idempotencyKey,
    lines: [
      {
        currency,
        amount,
        bankCurrency: currency,
        bankAmount,
        fee,
        allocations,
      },
    ],
  };
}

export function loanLend({
  amount = consistencyAmounts.loanPrincipal,
  currency = "UYU",
  effectiveOn = "2026-01-10",
  idempotencyKey = consistencyKey(),
  concept = "Préstamo sintético F2-10",
} = {}) {
  return {
    action: "lend",
    direction: "receivable",
    concept,
    currency,
    amount,
    installmentLoan: false,
    installmentAmount: null,
    frequency: null,
    dueOn: null,
    agreedTotal: null,
    effectiveOn,
    idempotencyKey,
    note: null,
  };
}

export function loanSettle({
  loanId,
  expectedVersion = 1,
  amount = consistencyAmounts.loanPartial,
  effectiveOn = "2026-01-15",
  idempotencyKey = consistencyKey(),
} = {}) {
  return {
    action: "settle",
    loanId,
    expectedVersion,
    amount,
    principal: null,
    financialCharges: null,
    accruedPaid: null,
    effectiveOn,
    idempotencyKey,
    note: null,
  };
}

export function sharedExpense({
  amount = consistencyAmounts.sharedExpense,
  ownAmount = consistencyAmounts.sharedOwn,
  parties = ["Ana", "Belén", "Carlos"].map((name) => ({
    name,
    amount: consistencyAmounts.sharedParty,
  })),
  currency = "UYU",
  effectiveOn = "2026-01-15",
  idempotencyKey = consistencyKey(),
  concept = "Cena sintética F2-10",
} = {}) {
  return {
    action: "create",
    method: "debit",
    concept,
    categoryId: null,
    note: null,
    currency,
    amount,
    effectiveOn,
    ownAmount,
    parties,
    idempotencyKey,
  };
}
