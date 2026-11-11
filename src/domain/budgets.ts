import { bankCurrencies, isBankReferenceDate } from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import { movementUuid as uuid } from "./movements.ts";

// §11.2: presupuestos opcionales, solo mensuales, sin límites por defecto.
export type BudgetProgress = { month: string; consumed: string };

export type Budget = {
  id: string;
  categoryId: string;
  categoryName: string;
  currency: Currency;
  /** Límite habitual vigente desde la última edición inclusive. */
  monthlyLimit: string;
  /** Límite efectivo del mes mostrado: excepción temporal si existe, si no habitual. */
  effectiveLimit: string;
  /** Excepción «solo este mes» (v9.46): no modifica meses anteriores ni siguientes. */
  exception: { month: string; limit: string } | null;
  version: number;
  /** Consumo del mes en la moneda del límite, ya convertido por el servidor. */
  progress: BudgetProgress | null;
  nextLimit: { currency: Currency; amount: string; exception: boolean } | null;
  references: {
    fromCurrency: Currency;
    rate: string;
    date: string;
    source: string;
  }[];
};

export type BudgetCommand =
  | {
      action: "quote";
      idempotencyKey: string;
      fromCurrency: Currency;
      toCurrency: Currency;
      rate: string;
      effectiveOn: string;
    }
  | {
      action: "save";
      idempotencyKey: string;
      categoryId: string;
      currency: Currency;
      amount: string;
    }
  | {
      action: "edit";
      idempotencyKey: string;
      budgetId: string;
      version: number;
      currency: Currency;
      amount: string;
    }
  | {
      action: "exception";
      idempotencyKey: string;
      budgetId: string;
      version: number;
      month: string;
      amount: string;
    }
  | {
      action: "remove";
      idempotencyKey: string;
      budgetId: string;
      version: number;
    };

const keys = {
  quote: ["fromCurrency", "toCurrency", "rate", "effectiveOn"],
  save: ["categoryId", "currency", "amount"],
  edit: ["budgetId", "version", "currency", "amount"],
  exception: ["budgetId", "version", "month", "amount"],
  remove: ["budgetId", "version"],
} as const;

const monthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const budgetMonthsAhead = 12;

export function currentMonth(today: string) {
  return today.slice(0, 7);
}

export function parseBudgetAmount(input: unknown) {
  try {
    const amount = normalizeDecimalAmount(
      typeof input === "string" ? input.trim().replace(",", ".") : input,
    );
    if (amount !== "0.0000" && !amount.startsWith("-")) return amount;
  } catch {
    return null;
  }
  return null;
}

/** Mes de excepción válido: desde el mes actual inclusive y hasta 12 meses adelante. */
export function parseBudgetMonth(input: unknown, today: string) {
  if (typeof input !== "string" || !monthPattern.test(input)) return null;
  const todayMonth = currentMonth(today);
  if (!monthPattern.test(todayMonth)) return null;
  const [year, month] = todayMonth.split("-").map(Number);
  const ahead = new Date(Date.UTC(year, month - 1 + budgetMonthsAhead, 1));
  const last = `${ahead.getUTCFullYear()}-${String(ahead.getUTCMonth() + 1).padStart(2, "0")}`;
  return input >= todayMonth && input <= last ? input : null;
}

function budgetVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 2147483647
  );
}

export function parseBudgetCommand(
  input: unknown,
  today: string,
): BudgetCommand | { error: string } {
  const invalid = { error: "Revisá los datos del presupuesto." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const {
    action,
    categoryId,
    budgetId,
    version,
    currency,
    amount,
    month,
    idempotencyKey,
    fromCurrency,
    toCurrency,
    rate,
    effectiveOn,
  } = input as Record<string, unknown>;
  if (
    (action !== "quote" &&
      action !== "save" &&
      action !== "edit" &&
      action !== "exception" &&
      action !== "remove") ||
    Object.keys(input).some(
      (key) => !["action", "idempotencyKey", ...keys[action]].includes(key),
    ) ||
    typeof idempotencyKey !== "string" ||
    !uuid.test(idempotencyKey)
  )
    return invalid;
  const commandKey = idempotencyKey.toLowerCase();

  if (action === "quote") {
    if (
      !bankCurrencies.includes(fromCurrency as Currency) ||
      !bankCurrencies.includes(toCurrency as Currency) ||
      fromCurrency === toCurrency ||
      typeof rate !== "string" ||
      !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(rate) ||
      !/[1-9]/.test(rate) ||
      !isBankReferenceDate(effectiveOn, today)
    )
      return invalid;
    return {
      action,
      idempotencyKey: commandKey,
      fromCurrency: fromCurrency as Currency,
      toCurrency: toCurrency as Currency,
      rate: rate.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""),
      effectiveOn,
    };
  }

  if (action === "remove") {
    if (
      typeof budgetId !== "string" ||
      !uuid.test(budgetId) ||
      !budgetVersion(version)
    )
      return invalid;
    return {
      action,
      budgetId: budgetId.toLowerCase(),
      version,
      idempotencyKey: commandKey,
    };
  }

  const decimal = parseBudgetAmount(amount);
  if (!decimal)
    return {
      error: "Ingresá un importe positivo con hasta cuatro decimales.",
    };

  if (action === "save") {
    const code = bankCurrencies.find((item) => item === currency);
    if (!code) return { error: "Elegí UYU, USD o EUR para el límite." };
    if (typeof categoryId !== "string" || !uuid.test(categoryId))
      return { error: "Elegí la categoría del presupuesto." };
    return {
      action,
      categoryId: categoryId.toLowerCase(),
      currency: code,
      amount: decimal,
      idempotencyKey: commandKey,
    };
  }

  if (
    typeof budgetId !== "string" ||
    !uuid.test(budgetId) ||
    !budgetVersion(version)
  )
    return invalid;
  const target = {
    budgetId: budgetId.toLowerCase(),
    version,
    idempotencyKey: commandKey,
  };
  if (action === "exception") {
    const exceptionMonth = parseBudgetMonth(month, today);
    if (!exceptionMonth)
      return {
        error:
          "La excepción aplica solo al mes actual o a un mes futuro próximo.",
      };
    return { action, ...target, month: exceptionMonth, amount: decimal };
  }
  const code = bankCurrencies.find((item) => item === currency);
  if (!code) return { error: "Elegí UYU, USD o EUR para el límite." };
  return { action: "edit", ...target, currency: code, amount: decimal };
}
