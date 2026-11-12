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

// Rangos relativos: el filtro guardado consulta siempre el período vigente y
// no congela las fechas del día en que se creó (v9.47 / CA-058).
export const historyPeriods = {
  "mes-actual": "Mes actual",
  "mes-anterior": "Mes anterior",
  "ultimos-3-meses": "Últimos 3 meses",
  "anio-actual": "Año actual",
} as const;

export type HistoryPeriod = keyof typeof historyPeriods;

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
  "period",
  "from",
  "to",
  "currency",
  "kind",
  "category",
  "method",
  "min",
  "max",
  "status",
  "tags",
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
    period,
    from,
    to,
    currency,
    kind,
    category,
    method,
    min,
    max,
    status,
  } = filters;
  const rawTags = Array.isArray(input.tags)
    ? input.tags.join(",")
    : filters.tags;
  const tagIds = rawTags ? rawTags.split(",") : [];
  const invalid = {
    error:
      "Revisá los filtros. Usá fechas válidas, rangos en orden e importes con hasta cuatro decimales.",
  } as const;
  if (
    Object.entries(input).some(
      ([key, value]) => key !== "tags" && Array.isArray(value),
    ) ||
    (q && (q.length > 200 || q.includes("\0"))) ||
    (period && (!Object.hasOwn(historyPeriods, period) || from || to)) ||
    (from && !isBankReferenceDate(from, "9999-12-31")) ||
    (to && !isBankReferenceDate(to, "9999-12-31")) ||
    (from && to && from > to) ||
    (currency && !bankCurrencies.some((code) => code === currency)) ||
    (kind && !Object.hasOwn(historyKinds, kind)) ||
    tagIds.length > 20 ||
    tagIds.some((id) => !movementUuid.test(id)) ||
    (category && category !== "none" && !movementUuid.test(category)) ||
    (method && !Object.hasOwn(movementDisplayMethods, method)) ||
    (status && !Object.hasOwn(historyStates, status))
  )
    return invalid;

  if (tagIds.length)
    filters.tags = [...new Set(tagIds.map((id) => id.toLowerCase()))].join(",");

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

// Fecha de referencia para los rangos relativos, en la zona horaria del
// producto (Uruguay). Devuelve YYYY-MM-DD.
export function historyToday(timeZone = "America/Montevideo") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// parseHistoryParams ya validó el valor; el guard solo afina el tipo.
export function historyPeriodFilter(
  period: string | undefined,
): HistoryPeriod | null {
  return period && Object.hasOwn(historyPeriods, period)
    ? (period as HistoryPeriod)
    : null;
}

export function historyPeriodRange(
  period: HistoryPeriod,
  today: string,
): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) throw new Error("Fecha de referencia inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Fecha de referencia inválida.");
  const lastDay = (y: number, m: number) =>
    new Date(Date.UTC(y, m, 0)).getUTCDate();
  const format = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  switch (period) {
    case "mes-actual":
      return {
        from: format(year, month, 1),
        to: format(year, month, lastDay(year, month)),
      };
    case "mes-anterior": {
      const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1];
      return { from: format(y, m, 1), to: format(y, m, lastDay(y, m)) };
    }
    case "ultimos-3-meses": {
      const index = year * 12 + (month - 1) - 2;
      const y = Math.floor(index / 12);
      const m = (index % 12) + 1;
      return {
        from: format(y, m, 1),
        to: format(year, month, lastDay(year, month)),
      };
    }
    case "anio-actual":
      return { from: format(year, 1, 1), to: format(year, 12, 31) };
  }
}
