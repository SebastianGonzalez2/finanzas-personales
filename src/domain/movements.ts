import { isBankReferenceDate } from "./bank-balances.ts";
import { Money, type Currency } from "./money.ts";

export const movementMethods = {
  deposit: "Acreditación bancaria",
  debit: "Débito bancario",
  transfer: "Transferencia bancaria",
} as const;

export type MovementKind = "income" | "expense";
export type MovementMethod = keyof typeof movementMethods;
export type MovementCategory = { id: string; kind: MovementKind; name: string };

export type MovementInput = {
  kind: MovementKind;
  currency: Currency;
  amount: string;
  effectiveOn: string;
  method: MovementMethod;
  concept: string;
  note: string | null;
  categoryId: string | null;
  idempotencyKey: string;
};

export type RecentMovement = Pick<
  MovementInput,
  "kind" | "currency" | "amount" | "effectiveOn" | "method" | "concept" | "note"
> & { id: string; category: string | null };

export type MovementTotal = Pick<MovementInput, "kind" | "currency" | "amount">;

export const conceptLimit = 200;
export const noteLimit = 500;
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const inputKeys = [
  "kind",
  "currency",
  "amount",
  "effectiveOn",
  "method",
  "concept",
  "note",
  "categoryId",
  "idempotencyKey",
];

export function parseMovement(
  input: unknown,
  today: string,
): MovementInput | { error: string } {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !inputKeys.includes(key))
  )
    return { error: "Solicitud inválida." };

  const {
    kind,
    currency,
    amount,
    effectiveOn,
    method,
    concept,
    note,
    categoryId,
    idempotencyKey,
  } = input as Record<string, unknown>;
  if (typeof idempotencyKey !== "string" || !uuid.test(idempotencyKey))
    return { error: "Solicitud inválida." };
  if (kind !== "income" && kind !== "expense")
    return { error: "Elegí ingreso o gasto." };
  if (
    (kind === "income" && method !== "deposit") ||
    (kind === "expense" && method !== "debit" && method !== "transfer")
  )
    return { error: "Elegí un medio válido para el movimiento." };
  if (currency !== "UYU" && currency !== "USD" && currency !== "EUR")
    return { error: "Elegí una moneda válida." };
  if (!isBankReferenceDate(effectiveOn, today))
    return { error: "Ingresá una fecha válida que no sea posterior a hoy." };

  let decimal: string;
  try {
    decimal = Money.parse(
      typeof amount === "string" ? amount.trim().replace(",", ".") : amount,
      currency,
    ).toDecimal();
    if (decimal.startsWith("-") || decimal === "0.0000") throw new Error();
  } catch {
    return {
      error:
        "Ingresá un importe positivo sin separador de miles y con hasta 4 decimales.",
    };
  }

  const label = concept ?? "";
  if (
    typeof label !== "string" ||
    label.length > conceptLimit ||
    label.includes("\0")
  )
    return {
      error: `Ingresá un concepto de hasta ${conceptLimit} caracteres.`,
    };
  if (kind === "expense" && !label.trim())
    return { error: "Ingresá el concepto del gasto." };
  const details = note ?? "";
  if (
    typeof details !== "string" ||
    details.length > noteLimit ||
    details.includes("\0")
  )
    return { error: `Ingresá una nota de hasta ${noteLimit} caracteres.` };
  const category = categoryId ?? "";
  if (typeof category !== "string" || (category && !uuid.test(category)))
    return { error: "Elegí una categoría válida." };

  return {
    kind,
    currency,
    amount: decimal,
    effectiveOn,
    method: method as MovementMethod,
    concept: label.trim(),
    note: details.trim() || null,
    categoryId: category.toLowerCase() || null,
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}
