import { bankCurrencies } from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import { conceptLimit, movementUuid, noteLimit } from "./movements.ts";
import {
  defaultRecurrenceFrequency,
  isRecurrenceDate,
  isRecurrenceDay,
  isRecurrenceFrequency,
  type RecurrenceFrequency,
  type RecurrenceSchedule,
} from "./recurrences.ts";

export const recurrenceDateModes = ["none", "approximate", "exact"] as const;
type DateMode = (typeof recurrenceDateModes)[number];

export type RecurrenceDefinition = {
  kind: "income" | "expense";
  concept: string;
  categoryId: string | null;
  currency: Currency;
  note: string | null;
  referenceAmount: string | null;
  frequency: RecurrenceFrequency;
  firstPeriod: string;
  dateMode: DateMode;
  dueDay: number | null;
  endDate: string | null;
};

export type CreateRecurrence = RecurrenceDefinition & {
  idempotencyKey: string;
};

export function recurrenceSchedule(
  definition: RecurrenceDefinition,
): RecurrenceSchedule {
  return {
    frequency: definition.frequency,
    firstPeriod: definition.firstPeriod,
    dueDay:
      definition.dateMode === "exact" ? (definition.dueDay ?? undefined) : null,
    endDate: definition.endDate,
  };
}

const allowed = new Set([
  "kind",
  "concept",
  "categoryId",
  "currency",
  "note",
  "referenceAmount",
  "frequency",
  "firstPeriod",
  "dateMode",
  "dueDay",
  "endDate",
  "idempotencyKey",
]);

export function parseRecurrence(
  input: unknown,
): CreateRecurrence | { error: string } {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.has(key))
  )
    return { error: "Solicitud inválida." };

  const {
    kind,
    concept,
    categoryId = null,
    currency,
    note = null,
    referenceAmount = null,
    frequency = defaultRecurrenceFrequency,
    firstPeriod,
    dateMode = "none",
    dueDay = null,
    endDate = null,
    idempotencyKey,
  } = input as Record<string, unknown>;

  if (
    kind !== "expense" ||
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length !== 36 ||
    !movementUuid.test(idempotencyKey)
  )
    return { error: "Solicitud inválida." };
  if (
    typeof concept !== "string" ||
    !concept.trim() ||
    concept.trim().length > conceptLimit ||
    concept.includes("\0")
  )
    return {
      error: `Ingresá un concepto de hasta ${conceptLimit} caracteres.`,
    };
  if (
    note !== null &&
    (typeof note !== "string" ||
      note.trim().length > noteLimit ||
      note.includes("\0"))
  )
    return { error: `Ingresá una nota de hasta ${noteLimit} caracteres.` };
  if (
    categoryId !== null &&
    (typeof categoryId !== "string" ||
      categoryId.length !== 36 ||
      !movementUuid.test(categoryId))
  )
    return { error: "Elegí una categoría válida." };
  const code = bankCurrencies.find((value) => value === currency);
  if (!code) return { error: "Elegí una moneda válida." };
  if (!isRecurrenceFrequency(frequency) || !isRecurrenceDate(firstPeriod))
    return { error: "Elegí una frecuencia y un primer período válidos." };
  if (endDate !== null && (!isRecurrenceDate(endDate) || endDate < firstPeriod))
    return {
      error: "La fecha final debe ser igual o posterior al primer período.",
    };
  const mode = recurrenceDateModes.find((value) => value === dateMode);
  if (!mode) return { error: "Elegí un tipo de vencimiento válido." };
  const usesDueDay = mode === "exact" && frequency !== "weekly";
  if (dueDay !== null && (!usesDueDay || !isRecurrenceDay(dueDay)))
    return {
      error:
        "El día habitual debe estar entre 1 y 31 para un vencimiento exacto no semanal.",
    };

  let amount: string | null = null;
  if (referenceAmount !== null) {
    try {
      amount = normalizeDecimalAmount(
        typeof referenceAmount === "string"
          ? referenceAmount.trim().replace(",", ".")
          : referenceAmount,
      );
      if (amount === "0.0000" || amount.startsWith("-")) throw new Error();
    } catch {
      return {
        error:
          "Ingresá un importe de referencia positivo con hasta cuatro decimales.",
      };
    }
  }

  return {
    kind,
    concept: concept.trim(),
    categoryId: categoryId?.toLowerCase() ?? null,
    currency: code,
    note: note?.trim() || null,
    referenceAmount: amount,
    frequency,
    firstPeriod,
    dateMode: mode,
    dueDay: usesDueDay
      ? ((dueDay as number | null) ?? Number(firstPeriod.slice(8)))
      : null,
    endDate,
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}
