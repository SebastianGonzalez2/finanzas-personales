import {
  bankCurrencies,
  bankReferenceToday,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { conceptLimit, movementUuid, noteLimit } from "./movements.ts";
import {
  installmentCount,
  installmentPeriodAt,
  installmentTotal,
  isInstallmentPeriod,
  type InstallmentTerms,
} from "./installments.ts";
import { Money, normalizeDecimalAmount, type Currency } from "./money.ts";

export type DebtAmount = { currency: Currency; amount: string };
export type OpeningDebt = { effectiveOn: string; lines: DebtAmount[] };
export type PaymentAllocation = { purchaseId: string; amount: string };
export type CreditPaymentLine = DebtAmount & {
  bankCurrency: Currency;
  bankAmount: string;
  fee: string;
  statementPeriod?: string;
  allocations: PaymentAllocation[];
};
export type CreditAction = "purchase" | "payment" | "adjustment";
export const maxPurchaseCategories = 10;
export type PurchaseCategory = {
  method: "debit" | "credit";
  categoryId: string | null;
  amount: string;
};
export type MixedPurchase = {
  total: string;
  debitAmount: string;
  debitCardId: string | null;
  categories: PurchaseCategory[];
  correction?: { eventId: string; planVersion: number };
};
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
      plan?: InstallmentTerms;
      mixed?: MixedPurchase;
    } & DebtAmount)
  | ({ action: "adjustment"; expectedDebt: string } & DebtAmount)
  | { action: "payment"; lines: CreditPaymentLine[] }
);

export type CreditVoid = {
  action: "void";
  eventId: string;
  idempotencyKey: string;
};

export type InstallmentRevision = {
  eventId: string;
  idempotencyKey: string;
  expectedVersion: number;
} & (
  | { action: "edit-installments"; plan: InstallmentTerms }
  | { action: "cancel-installments"; fromPeriod: string }
);

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
  statementPeriod?: string | null;
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
    "statementPeriod",
  ]);
  const debtCurrency = currency(line.currency);
  const bankCurrency = currency(line.bankCurrency);
  const cancelled = amount(line.amount);
  const debited = amount(line.bankAmount);
  if (debtCurrency === bankCurrency && debited !== cancelled) throw new Error();
  const statementPeriod = line.statementPeriod;
  if (statementPeriod !== undefined && !isInstallmentPeriod(statementPeriod))
    throw new Error();
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
    ...(statementPeriod && { statementPeriod }),
  };
}

const common = ["action", "cardId", "effectiveOn", "idempotencyKey"];

function installmentTerms(input: unknown): InstallmentTerms {
  const plan = record(input, ["installmentAmount", "count", "firstPeriod"]);
  const { count, firstPeriod } = plan;
  if (
    !installmentCount(count) ||
    !isInstallmentPeriod(firstPeriod) ||
    !isInstallmentPeriod(installmentPeriodAt(firstPeriod, count - 1))
  )
    throw new Error();
  return {
    count,
    firstPeriod,
    installmentAmount: amount(plan.installmentAmount),
  };
}

function categoryId(value: unknown) {
  return value == null || value === "" ? null : id(value);
}

class MixedPurchaseInputError extends Error {}

function mixedPurchase(
  input: unknown,
  credit: string,
  code: Currency,
): MixedPurchase {
  const data = record(input, [
    "total",
    "debitAmount",
    "debitCardId",
    "categories",
    "correction",
  ]);
  const total = amount(data.total);
  const debitAmount = amount(data.debitAmount);
  if (
    Money.parse(debitAmount, code)
      .add(Money.parse(credit, code))
      .toDecimal() !== total
  )
    throw new MixedPurchaseInputError(
      "El débito y el crédito deben sumar el total de la compra.",
    );
  const splits = data.categories;
  if (!Array.isArray(splits) || splits.length > maxPurchaseCategories)
    throw new Error();
  const categories = splits
    .map((input): PurchaseCategory => {
      const row = record(input, ["method", "categoryId", "amount"]);
      if (row.method !== "debit" && row.method !== "credit") throw new Error();
      return {
        method: row.method,
        categoryId: categoryId(row.categoryId),
        amount: amount(row.amount),
      };
    })
    .sort(
      (a, b) =>
        a.method.localeCompare(b.method) ||
        (a.categoryId ?? "").localeCompare(b.categoryId ?? ""),
    );
  for (const method of ["debit", "credit"] as const) {
    const rows = categories.filter((row) => row.method === method);
    if (
      categories.length &&
      (new Set(rows.map((row) => row.categoryId)).size !== rows.length ||
        rows
          .reduce(
            (sum, row) => sum.add(Money.parse(row.amount, code)),
            Money.parse("0", code),
          )
          .toDecimal() !== (method === "debit" ? debitAmount : credit))
    )
      throw new MixedPurchaseInputError(
        "Las categorías de cada medio deben sumar su porción, sin repetir categorías en el mismo medio.",
      );
  }
  let correction;
  if (data.correction !== undefined) {
    const { eventId, planVersion } = record(data.correction, [
      "eventId",
      "planVersion",
    ]);
    if (
      typeof planVersion !== "number" ||
      !Number.isSafeInteger(planVersion) ||
      planVersion < 0
    )
      throw new Error();
    correction = { eventId: id(eventId), planVersion };
  }
  return {
    total,
    debitAmount,
    debitCardId: categoryId(data.debitCardId),
    categories,
    ...(correction && { correction }),
  };
}

export function parseCreditCommand(
  input: unknown,
  today = bankReferenceToday(),
): CreditCommand | CreditVoid | InstallmentRevision | { error: string } {
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
    if (action === "edit-installments" || action === "cancel-installments") {
      const data = record(input, [
        "action",
        "eventId",
        "idempotencyKey",
        "expectedVersion",
        action === "edit-installments" ? "plan" : "fromPeriod",
      ]);
      const expectedVersion = data.expectedVersion;
      if (
        typeof expectedVersion !== "number" ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1
      )
        return error;
      const target = {
        eventId: id(data.eventId),
        idempotencyKey: id(data.idempotencyKey),
        expectedVersion,
      };
      if (action === "edit-installments") {
        return { ...target, action, plan: installmentTerms(data.plan) };
      }
      if (!isInstallmentPeriod(data.fromPeriod)) return error;
      return { ...target, action, fromPeriod: data.fromPeriod };
    }
    const fields =
      action === "purchase"
        ? [
            "currency",
            "amount",
            "concept",
            "note",
            "categoryId",
            "covered",
            "plan",
            "mixed",
          ]
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
    const plan =
      data.plan === undefined ? undefined : installmentTerms(data.plan);
    const charge = amount(data.amount, !!plan);
    const financed = plan && installmentTotal(plan, code);
    if (financed) {
      if (
        (charge === "0.0000" && data.covered) ||
        charge.padStart(21, "0") > financed.padStart(21, "0")
      )
        return {
          error:
            "Ingresá solo el cargo confirmado por el emisor, hasta el total financiado.",
        };
    }
    const mixed =
      data.mixed === undefined
        ? undefined
        : mixedPurchase(data.mixed, financed ?? charge, code);
    return {
      ...target,
      action,
      currency: code,
      amount: charge,
      concept,
      note: optionalText(data.note, noteLimit),
      categoryId: mixed?.categories.length ? null : categoryId(data.categoryId),
      covered: data.covered,
      ...(plan && { plan }),
      ...(mixed && { mixed }),
    };
  } catch (cause) {
    return cause instanceof MixedPurchaseInputError
      ? { error: cause.message }
      : error;
  }
}
