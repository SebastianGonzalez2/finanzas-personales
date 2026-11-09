import {
  bankCurrencies,
  bankReferenceToday,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { conceptLimit, movementUuid, noteLimit } from "./movements.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";

export type DebtAmount = { currency: Currency; amount: string };
export type OpeningDebt = { effectiveOn: string; lines: DebtAmount[] };
export type PaymentAllocation = { purchaseId: string; amount: string };
export type CreditPaymentLine = DebtAmount & {
  bankCurrency: Currency;
  bankAmount: string;
  fee: string;
  allocations: PaymentAllocation[];
};
export type CreditAction = "purchase" | "payment" | "adjustment";
export type CreditCommand = {
  cardId: string;
  effectiveOn: string;
  idempotencyKey: string;
} & (
  | ({
      action: "purchase";
      concept: string;
      note: string | null;
      categoryId: string | null;
      covered: boolean;
    } & DebtAmount)
  | ({ action: "adjustment"; expectedDebt: string } & DebtAmount)
  | { action: "payment"; lines: CreditPaymentLine[] }
);

export type CreditVoid = {
  action: "void";
  eventId: string;
  idempotencyKey: string;
};

export type CreditPurchaseOption = DebtAmount & {
  id: string;
  cardId: string;
  concept: string;
  effectiveOn: string;
};

export type CreditHistoryLine = DebtAmount & {
  debtDelta: string;
  debtAfter: string;
  bankCurrency: Currency | null;
  bankAmount: string | null;
  fee: string;
  allocations: (PaymentAllocation & { concept: string })[];
};

function record(input: unknown, keys: string[]) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new Error();
  return input as Record<string, unknown>;
}

function id(value: unknown) {
  if (typeof value !== "string" || !movementUuid.test(value)) throw new Error();
  return value.toLowerCase();
}

function currency(value: unknown) {
  const code = bankCurrencies.find((code) => code === value);
  if (!code) throw new Error();
  return code;
}

function amount(value: unknown, allowZero = false) {
  if (typeof value !== "string") throw new Error();
  const normalized = normalizeDecimalAmount(value.trim().replace(",", "."));
  if (normalized.startsWith("-") || (!allowZero && normalized === "0.0000"))
    throw new Error();
  return normalized;
}

function optionalText(value: unknown, limit: number) {
  if (value == null) return null;
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.trim().length > limit
  )
    throw new Error();
  return value.trim() || null;
}

function date(value: unknown, today: string) {
  if (!isBankReferenceDate(value, today)) throw new Error();
  return value;
}

function currencyLines<T extends DebtAmount>(
  input: unknown,
  parse: (line: unknown) => T,
) {
  if (
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > bankCurrencies.length
  )
    throw new Error();
  const lines = input.map(parse);
  if (new Set(lines.map((line) => line.currency)).size !== lines.length)
    throw new Error();
  return lines.sort((a, b) => a.currency.localeCompare(b.currency));
}

export function parseOpeningDebt(
  input: unknown,
  today = bankReferenceToday(),
): OpeningDebt {
  const opening = record(input, ["effectiveOn", "lines"]);
  return {
    effectiveOn: date(opening.effectiveOn, today),
    lines: currencyLines(opening.lines, (input) => {
      const line = record(input, ["currency", "amount"]);
      return { currency: currency(line.currency), amount: amount(line.amount) };
    }),
  };
}

function paymentLine(input: unknown): CreditPaymentLine {
  const line = record(input, [
    "currency",
    "amount",
    "bankCurrency",
    "bankAmount",
    "fee",
    "allocations",
  ]);
  const debtCurrency = currency(line.currency);
  const bankCurrency = currency(line.bankCurrency);
  const cancelled = amount(line.amount);
  const debited = amount(line.bankAmount);
  if (debtCurrency === bankCurrency && debited !== cancelled) throw new Error();
  const supplied = line.allocations === undefined ? [] : line.allocations;
  if (!Array.isArray(supplied) || supplied.length > 100) throw new Error();
  const allocations = supplied
    .map((input) => {
      const allocation = record(input, ["purchaseId", "amount"]);
      return {
        purchaseId: id(allocation.purchaseId),
        amount: amount(allocation.amount),
      };
    })
    .sort((a, b) => a.purchaseId.localeCompare(b.purchaseId));
  if (
    new Set(allocations.map(({ purchaseId }) => purchaseId)).size !==
    allocations.length
  )
    throw new Error();
  return {
    currency: debtCurrency,
    amount: cancelled,
    bankCurrency,
    bankAmount: debited,
    fee: amount(
      line.fee === "" || line.fee === undefined ? "0" : line.fee,
      true,
    ),
    allocations,
  };
}

const common = ["action", "cardId", "effectiveOn", "idempotencyKey"];

export function parseCreditCommand(
  input: unknown,
  today = bankReferenceToday(),
): CreditCommand | CreditVoid | { error: string } {
  const error = {
    error:
      "Revisá la fecha, la tarjeta y los importes. Usá hasta cuatro decimales, sin separador de miles.",
  };
  try {
    const action = (input as { action?: unknown } | null)?.action;
    if (action === "void") {
      const data = record(input, ["action", "eventId", "idempotencyKey"]);
      return {
        action,
        eventId: id(data.eventId),
        idempotencyKey: id(data.idempotencyKey),
      };
    }
    const fields =
      action === "purchase"
        ? ["currency", "amount", "concept", "note", "categoryId", "covered"]
        : action === "payment"
          ? ["lines"]
          : ["currency", "amount", "expectedDebt"];
    const data = record(input, [...common, ...fields]);
    const target = {
      cardId: id(data.cardId),
      effectiveOn: date(data.effectiveOn, today),
      idempotencyKey: id(data.idempotencyKey),
    };
    if (action === "payment")
      return {
        ...target,
        action,
        lines: currencyLines(data.lines, paymentLine),
      };
    const code = currency(data.currency);
    if (action === "adjustment")
      return {
        ...target,
        action,
        currency: code,
        amount: amount(data.amount, true),
        expectedDebt: amount(data.expectedDebt, true),
      };
    if (action !== "purchase" || typeof data.covered !== "boolean")
      return error;
    const concept = optionalText(data.concept, conceptLimit);
    if (!concept) return { error: "Ingresá un concepto para la compra." };
    return {
      ...target,
      action,
      currency: code,
      amount: amount(data.amount),
      concept,
      note: optionalText(data.note, noteLimit),
      categoryId:
        data.categoryId == null || data.categoryId === ""
          ? null
          : id(data.categoryId),
      covered: data.covered,
    };
  } catch {
    return error;
  }
}
