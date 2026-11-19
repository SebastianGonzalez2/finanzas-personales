import {
  bankCurrencies,
  bankReferenceToday,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import { parseOptionalCatalogName } from "./catalog-names.ts";
import {
  installmentTotal,
  parseInstallmentTerms,
  type InstallmentTerms,
} from "./installments.ts";

import {
  coverageSum,
  coverageUnits,
  fundPortionsError,
  parseFundPortions,
  type FundPortion,
} from "./fund-coverage.ts";

export const movementMethods = {
  deposit: "Acreditación bancaria",
  debit: "Débito bancario",
  transfer: "Transferencia bancaria",
} as const;

export const movementDisplayMethods = {
  ...movementMethods,
  unspecified: "Sin medio indicado",
  credit: "Tarjeta de crédito",
  mixed: "Débito y crédito",
  third_party: "Pagado por otra persona",
} as const;
export type MovementDisplayMethod = keyof typeof movementDisplayMethods;

export type MovementKind = "income" | "expense";
// SIMP-02: un gasto nuevo no indica medio bancario ("unspecified").
export type MovementMethod = keyof typeof movementMethods | "unspecified";
export type MovementCategory = { id: string; kind: MovementKind; name: string };

import {
  allocationError,
  allocationSumMatches,
  parseClassification,
  type ClassificationInput,
} from "./classification.ts";

export type MovementInput = ClassificationInput & {
  kind: MovementKind;
  currency: Currency;
  amount: string;
  effectiveOn: string;
  method: MovementMethod;
  concept: string;
  note: string | null;
  categoryId: string | null;
  idempotencyKey: string;
  fundPortions?: FundPortion[];
  merchantName?: string | null;
  plan?: InstallmentTerms;
};

type RevisionTarget = { eventId: string; idempotencyKey: string };
export type MovementRevision = RevisionTarget &
  (
    | { action: "void" }
    | { action: "correct"; amount: string }
    | {
        action: "edit";
        movement: MovementInput | BankTransfer;
        classificationVersion?: number;
      }
  );

export type RecentMovement = Pick<
  MovementInput,
  "kind" | "currency" | "amount" | "effectiveOn" | "concept" | "note"
> & {
  id: string;
  category: string | null;
  method: MovementDisplayMethod;
  shared?: boolean;
};

export type SummaryRecentMovement = RecentMovement & {
  amountCorrectable: boolean;
};

export type MovementTotal = Pick<MovementInput, "kind" | "currency" | "amount">;

export type BankTransfer = {
  kind: "bank_transfer";
  sourceCurrency: Currency;
  sourceAmount: string;
  destinationCurrency: Currency;
  destinationAmount: string;
  effectiveOn: string;
  idempotencyKey: string;
};

export type RecentBankTransfer = Omit<
  BankTransfer,
  "kind" | "idempotencyKey"
> & {
  id: string;
};

export const conceptLimit = 200;
export const noteLimit = 500;
export const movementUuid =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
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
  "fundPortions",
  "allocations",
  "tagIds",
  "merchantName",
  "plan",
];

function positiveAmount(amount: unknown) {
  const decimal = normalizeDecimalAmount(
    typeof amount === "string" ? amount.trim().replace(",", ".") : amount,
  );
  if (decimal.startsWith("-") || decimal === "0.0000")
    throw new Error("Importe positivo requerido");
  return decimal;
}

const installmentsError =
  "Revisá las cuotas: entre 2 y 120, importe positivo con hasta 4 decimales y un mes válido.";

const amountError =
  "Ingresá un importe positivo sin separador de miles y con hasta 4 decimales.";

export function parseBankTransfer(
  input: object,
  today: string,
): BankTransfer | { error: string } {
  const {
    kind,
    sourceCurrency,
    sourceAmount,
    destinationCurrency,
    destinationAmount,
    effectiveOn,
    idempotencyKey,
    ...extra
  } = input as Record<string, unknown>;
  if (
    kind !== "bank_transfer" ||
    Object.keys(extra).length ||
    typeof idempotencyKey !== "string" ||
    !movementUuid.test(idempotencyKey)
  )
    return { error: "Solicitud inválida." };
  const source = bankCurrencies.find((code) => code === sourceCurrency);
  const destination = bankCurrencies.find(
    (code) => code === destinationCurrency,
  );
  if (!source || !destination) return { error: "Elegí dos monedas válidas." };
  if (source === destination)
    return {
      error:
        "Los movimientos entre bancos propios en la misma moneda ya están incluidos en el saldo agregado.",
    };
  if (!isBankReferenceDate(effectiveOn, today))
    return { error: "Ingresá una fecha válida que no sea posterior a hoy." };

  try {
    return {
      kind,
      sourceCurrency: source,
      sourceAmount: positiveAmount(sourceAmount),
      destinationCurrency: destination,
      destinationAmount: positiveAmount(destinationAmount),
      effectiveOn,
      idempotencyKey: idempotencyKey.toLowerCase(),
    };
  } catch {
    return { error: `Revisá los dos importes. ${amountError}` };
  }
}

export function parseMovementRevision(
  input: unknown,
  today = bankReferenceToday(),
): MovementRevision | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Solicitud inválida." };
  const {
    action,
    eventId,
    idempotencyKey,
    amount,
    movement,
    classificationVersion,
  } = input as Record<string, unknown>;
  if (
    (action !== "void" && action !== "correct" && action !== "edit") ||
    typeof eventId !== "string" ||
    !movementUuid.test(eventId) ||
    typeof idempotencyKey !== "string" ||
    !movementUuid.test(idempotencyKey) ||
    Object.keys(input).some(
      (key) =>
        !["action", "eventId", "idempotencyKey"].includes(key) &&
        !(key === "amount" && action === "correct") &&
        !(
          (key === "movement" || key === "classificationVersion") &&
          action === "edit"
        ),
    )
  )
    return { error: "Solicitud inválida." };

  const target = {
    eventId: eventId.toLowerCase(),
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
  if (action === "void") return { action, ...target };
  if (action === "edit") {
    if (
      !movement ||
      typeof movement !== "object" ||
      Array.isArray(movement) ||
      "idempotencyKey" in movement
    )
      return { error: "Solicitud inválida." };
    const replacement = { ...movement, idempotencyKey: target.idempotencyKey };
    const parsed =
      "kind" in movement && movement.kind === "bank_transfer"
        ? parseBankTransfer(replacement, today)
        : parseMovement(replacement, today);
    if (
      classificationVersion !== undefined &&
      (typeof classificationVersion !== "number" ||
        !Number.isInteger(classificationVersion) ||
        classificationVersion < 0 ||
        classificationVersion >= 2147483647 ||
        !("allocations" in parsed))
    )
      return { error: "Solicitud de clasificación inválida." };
    return "error" in parsed
      ? parsed
      : {
          action,
          ...target,
          movement: parsed,
          ...(classificationVersion !== undefined && { classificationVersion }),
        };
  }
  try {
    return { action, ...target, amount: positiveAmount(amount) };
  } catch {
    return { error: amountError };
  }
}

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
    fundPortions,
    allocations,
    tagIds,
    merchantName: rawMerchant,
    plan: rawPlan,
  } = input as Record<string, unknown>;
  if (typeof idempotencyKey !== "string" || !movementUuid.test(idempotencyKey))
    return { error: "Solicitud inválida." };
  if (kind !== "income" && kind !== "expense")
    return { error: "Elegí ingreso o gasto." };
  const resolvedMethod =
    method ?? (kind === "income" ? "deposit" : "unspecified");
  if (
    (kind === "income" && resolvedMethod !== "deposit") ||
    (kind === "expense" &&
      resolvedMethod !== "unspecified" &&
      resolvedMethod !== "debit" &&
      resolvedMethod !== "transfer")
  )
    return { error: "Elegí un medio válido para el movimiento." };
  if (currency !== "UYU" && currency !== "USD" && currency !== "EUR")
    return { error: "Elegí una moneda válida." };
  if (!isBankReferenceDate(effectiveOn, today))
    return { error: "Ingresá una fecha válida que no sea posterior a hoy." };

  let plan: InstallmentTerms | undefined;
  if (rawPlan !== undefined) {
    if (kind !== "expense")
      return { error: "Solo un gasto se puede registrar en cuotas." };
    try {
      plan = parseInstallmentTerms(rawPlan);
    } catch {
      return { error: installmentsError };
    }
  }

  let decimal: string;
  try {
    decimal = plan ? installmentTotal(plan, currency) : positiveAmount(amount);
  } catch {
    return { error: plan ? installmentsError : amountError };
  }
  try {
    if (plan && amount !== undefined && positiveAmount(amount) !== decimal)
      throw new Error();
  } catch {
    return { error: "El importe debe ser igual a la suma de las cuotas." };
  }

  let portions: FundPortion[] | undefined;
  if (plan && fundPortions !== undefined)
    return { error: "Un gasto en cuotas no usa fondos de ahorro." };
  if (fundPortions !== undefined) {
    try {
      portions = parseFundPortions(fundPortions);
      if (kind !== "expense" || coverageSum(portions) > coverageUnits(decimal))
        return { error: fundPortionsError };
    } catch {
      return { error: fundPortionsError };
    }
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
  let merchantName: string | null | undefined;
  try {
    merchantName = parseOptionalCatalogName(rawMerchant);
    if (kind !== "expense" && merchantName !== undefined)
      return { error: "El comercio solo se puede indicar en un gasto." };
  } catch {
    return { error: "Revisá el nombre del comercio." };
  }
  const details = note ?? "";
  if (
    typeof details !== "string" ||
    details.length > noteLimit ||
    details.includes("\0")
  )
    return { error: `Ingresá una nota de hasta ${noteLimit} caracteres.` };
  const category = categoryId ?? "";
  if (
    typeof category !== "string" ||
    (category && !movementUuid.test(category))
  )
    return { error: "Elegí una categoría válida." };

  const classification = parseClassification({ allocations, tagIds });
  if ("error" in classification) return classification;
  if (
    classification.allocations?.length &&
    (category || !allocationSumMatches(classification.allocations, decimal))
  )
    return { error: allocationError };
  if (plan && classification.allocations?.length)
    return { error: "Un gasto en cuotas se asigna a una sola categoría." };

  return {
    ...classification,
    kind,
    currency,
    amount: decimal,
    effectiveOn,
    method: resolvedMethod as MovementMethod,
    concept: label.trim(),
    note: details.trim() || null,
    categoryId: category.toLowerCase() || null,
    ...(portions !== undefined && { fundPortions: portions }),
    ...(merchantName !== undefined && { merchantName }),
    ...(plan && { plan }),
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}
