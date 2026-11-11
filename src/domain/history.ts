import { bankCurrencies, isBankReferenceDate } from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import {
  movementDisplayMethods,
  movementUuid,
  type MovementDisplayMethod,
} from "./movements.ts";

export const historyKinds = {
  income: "Ingreso",
  expense: "Gasto",
  bank_transfer: "Cambio de moneda",
  checkpoint: "Saldo confirmado",
  card_purchase: "Compra con tarjeta",
  card_payment: "Pago de tarjeta",
  card_opening: "Deuda inicial de tarjeta",
  card_adjustment: "Ajuste de deuda de tarjeta",
  loan_operation: "Deudas y préstamos",
  purchase_refund: "Devolución",
  card_credit_return: "Reintegro de saldo a favor",
} as const;

export const historyStates = {
  confirmed: "Confirmado",
  pending: "Pendiente",
  corrected: "Corregido",
  voided: "Anulado",
} as const;

export type HistoryKind = keyof typeof historyKinds;

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  status: keyof typeof historyStates;
  effectiveOn: string;
  concept: string;
  note: string | null;
  currency: Currency;
  amount: string;
  otherCurrency: Currency | null;
  otherAmount: string | null;
  categoryId: string | null;
  category: string | null;
  method: MovementDisplayMethod | null;
  cardAmounts?: { currency: Currency; amount: string }[] | null;
};

const filterKeys = [
  "q",
  "from",
  "to",
  "currency",
  "kind",
  "category",
  "merchant",
  "method",
  "min",
  "max",
  "status",
] as const;
export type HistoryFilters = Partial<
  Record<(typeof filterKeys)[number], string>
>;
export type HistoryCursor = { date: string; id: string; kind: HistoryKind };

export function historySearch(filters: HistoryFilters, cursor?: HistoryCursor) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (cursor)
    params.set("before", `${cursor.date}.${cursor.id}.${cursor.kind}`);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function parseHistoryParams(
  input: Record<string, string | string[] | undefined>,
) {
  const filters: HistoryFilters = {};
  for (const key of filterKeys) {
    const value = input[key];
    if (typeof value === "string") filters[key] = value.trim();
  }
  const {
    q,
    from,
    to,
    currency,
    kind,
    category,
    merchant,
    method,
    min,
    max,
    status,
  } = filters;
  const invalid = {
    error:
      "Revisá los filtros. Usá fechas válidas, rangos en orden e importes con hasta cuatro decimales.",
  } as const;
  if (
    Object.values(input).some(Array.isArray) ||
    (q && (q.length > 200 || q.includes("\0"))) ||
    (from && !isBankReferenceDate(from, "9999-12-31")) ||
    (to && !isBankReferenceDate(to, "9999-12-31")) ||
    (from && to && from > to) ||
    (currency && !bankCurrencies.some((code) => code === currency)) ||
    (kind && !Object.hasOwn(historyKinds, kind)) ||
    (category && category !== "none" && !movementUuid.test(category)) ||
    (merchant && !movementUuid.test(merchant)) ||
    (method && !Object.hasOwn(movementDisplayMethods, method)) ||
    (status && !Object.hasOwn(historyStates, status))
  )
    return invalid;

  let minimum: string | null;
  let maximum: string | null;
  try {
    minimum = min ? normalizeDecimalAmount(min.replace(",", ".")) : null;
    maximum = max ? normalizeDecimalAmount(max.replace(",", ".")) : null;
  } catch {
    return invalid;
  }
  if (
    minimum &&
    maximum &&
    BigInt(minimum.replace(".", "")) > BigInt(maximum.replace(".", ""))
  )
    return invalid;

  let cursor: HistoryCursor | undefined;
  if (input.before) {
    const [date, id, rowKind, extra] = (input.before as string).split(".");
    if (
      extra !== undefined ||
      !isBankReferenceDate(date, "9999-12-31") ||
      !movementUuid.test(id ?? "") ||
      !Object.hasOwn(historyKinds, rowKind ?? "")
    )
      return {
        error:
          "La página solicitada no es válida. Volvé al inicio del historial.",
      } as const;
    cursor = { date, id, kind: rowKind as HistoryKind };
  }
  return { filters, minimum, maximum, cursor };
}
