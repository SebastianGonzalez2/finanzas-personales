import {
  bankCurrencies,
  bankReferenceToday,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { conceptLimit, movementUuid, noteLimit } from "./movements.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";

export const loanDirections = {
  payable: "Deudas por pagar",
  receivable: "Dinero por cobrar",
} as const;
export type LoanDirection = keyof typeof loanDirections;

export const loanFrequencies = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
} as const;

export type LoanTerms = {
  installmentLoan: boolean;
  installmentAmount: string | null;
  frequency: keyof typeof loanFrequencies | null;
  dueOn: string | null;
};

type LoanOpening = LoanTerms & {
  action: "existing" | "lend" | "borrow";
  direction: LoanDirection;
  concept: string;
  currency: Currency;
  agreedTotal: string | null;
};

type LoanChange = { loanId: string; expectedVersion: number } & (
  | {
      action: "settle";
      principal: string | null;
      financialCharges: string | null;
      accruedPaid: string | null;
      exchange?: { bankCurrency: Currency; appliedAmount: string };
    }
  | { action: "adjust"; accruedInterest: string | null }
  | { action: "interest" }
);

export type LoanCommand = (LoanOpening | LoanChange) & {
  amount: string;
  effectiveOn: string;
  idempotencyKey: string;
  note: string | null;
};

export type Loan = LoanTerms & {
  id: string;
  concept: string;
  direction: LoanDirection;
  currency: Currency;
  outstanding: string;
  accruedInterest: string;
  needsReconciliation: boolean;
  version: number;
  effectiveOn: string;
};

export type LoanOperation = {
  id: string;
  loanId: string;
  action: LoanCommand["action"];
  direction: LoanDirection;
  currency: Currency;
  amount: string;
  bankDelta: string | null;
  bankCurrency: Currency | null;
  effectiveRate: string | null;
  outstanding: string;
  previousOutstanding: string | null;
  accruedInterest: string;
  principalPaid: string | null;
  accruedPaid: string;
  expense: string;
  needsReconciliation: boolean;
  effectiveOn: string;
  note: string | null;
};

export function loanActionLabel(
  action: LoanCommand["action"],
  direction: LoanDirection,
) {
  return {
    existing: "Alta de saldo existente",
    lend: "Entrega de préstamo",
    borrow: "Recepción de préstamo",
    settle: direction === "payable" ? "Pago" : "Cobro",
    adjust: "Actualización del pendiente",
    interest: "Intereses devengados",
  }[action];
}

function fields(input: Record<string, unknown>, extra: string[]) {
  const common = ["action", "amount", "effectiveOn", "idempotencyKey", "note"];
  if (
    Object.keys(input).some(
      (key) => !common.includes(key) && !extra.includes(key),
    )
  )
    throw new Error();
}

function amount(value: unknown, zeroAllowed = false) {
  if (typeof value !== "string") throw new Error();
  const normalized = normalizeDecimalAmount(value.trim().replace(",", "."));
  if (normalized.startsWith("-") || (!zeroAllowed && normalized === "0.0000"))
    throw new Error();
  return normalized;
}

function optionalAmount(value: unknown, zeroAllowed = false) {
  return value == null || value === "" ? null : amount(value, zeroAllowed);
}

function text(value: unknown, limit: number) {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.trim().length > limit
  )
    throw new Error();
  return value.trim();
}

export function parseLoanCommand(
  input: unknown,
  today = bankReferenceToday(),
): LoanCommand | { error: string } {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error();
    const data = input as Record<string, unknown>;
    const { action, effectiveOn, idempotencyKey } = data;
    if (!isBankReferenceDate(effectiveOn, today))
      return { error: "Ingresá una fecha real que no sea posterior a hoy." };
    if (
      typeof idempotencyKey !== "string" ||
      !movementUuid.test(idempotencyKey)
    )
      throw new Error();
    const common = {
      effectiveOn,
      idempotencyKey: idempotencyKey.toLowerCase(),
      amount: amount(data.amount, action === "adjust"),
      note: data.note == null ? null : text(data.note, noteLimit) || null,
    };
    if (action === "existing" || action === "lend" || action === "borrow") {
      fields(data, [
        "direction",
        "concept",
        "currency",
        "installmentLoan",
        "installmentAmount",
        "frequency",
        "dueOn",
        "agreedTotal",
      ]);
      const { direction, installmentLoan } = data;
      const concept = text(data.concept, conceptLimit);
      const currency = bankCurrencies.find((code) => code === data.currency);
      if (
        !concept ||
        !currency ||
        typeof installmentLoan !== "boolean" ||
        (direction !== "payable" && direction !== "receivable") ||
        (action === "lend" && direction !== "receivable") ||
        (action === "borrow" && direction !== "payable")
      )
        throw new Error();
      const dueOn = data.dueOn === "" ? null : (data.dueOn ?? null);
      if (dueOn !== null && !isBankReferenceDate(dueOn, "9999-12-31"))
        throw new Error();
      const installmentAmount = optionalAmount(data.installmentAmount);
      const frequency = Object.keys(loanFrequencies).find(
        (key) => key === data.frequency,
      ) as LoanTerms["frequency"] | undefined;
      if (
        (data.frequency != null && data.frequency !== "" && !frequency) ||
        (!installmentLoan && (installmentAmount || frequency))
      )
        throw new Error();
      const agreedTotal = optionalAmount(data.agreedTotal);
      if (
        agreedTotal &&
        (action !== "lend" ||
          installmentLoan ||
          BigInt(agreedTotal.replace(".", "")) <
            BigInt(common.amount.replace(".", "")))
      )
        return {
          error:
            "El total acordado debe ser al menos el capital entregado en un préstamo simple.",
        };
      return {
        ...common,
        action,
        direction,
        concept,
        currency,
        installmentLoan,
        installmentAmount,
        frequency: frequency ?? null,
        dueOn,
        agreedTotal,
      };
    }

    const { loanId, expectedVersion } = data;
    if (
      typeof loanId !== "string" ||
      !movementUuid.test(loanId) ||
      typeof expectedVersion !== "number" ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      expectedVersion >= 2147483647
    )
      throw new Error();
    const change = { ...common, loanId: loanId.toLowerCase(), expectedVersion };
    if (action === "settle") {
      fields(data, [
        "loanId",
        "expectedVersion",
        "principal",
        "financialCharges",
        "accruedPaid",
        "bankCurrency",
        "appliedAmount",
      ]);
      const principal = optionalAmount(data.principal, true);
      const financialCharges = optionalAmount(data.financialCharges, true);
      let exchange:
        { bankCurrency: Currency; appliedAmount: string } | undefined;
      if ("bankCurrency" in data || "appliedAmount" in data) {
        const bankCurrency = bankCurrencies.find(
          (code) => code === data.bankCurrency,
        );
        if (!bankCurrency || principal !== null || financialCharges !== null)
          throw new Error();
        exchange = { bankCurrency, appliedAmount: amount(data.appliedAmount) };
      }
      return {
        ...change,
        action,
        principal,
        financialCharges,
        accruedPaid: optionalAmount(data.accruedPaid, true),
        ...(exchange && { exchange }),
      };
    }
    if (action === "adjust") {
      fields(data, ["loanId", "expectedVersion", "accruedInterest"]);
      return {
        ...change,
        action,
        accruedInterest: optionalAmount(data.accruedInterest, true),
      };
    }
    if (action === "interest") {
      fields(data, ["loanId", "expectedVersion"]);
      return { ...change, action };
    }
  } catch {
    return {
      error:
        "Revisá los datos e importes. Usá hasta cuatro decimales y omití los separadores de miles.",
    };
  }
  return { error: "Operación inválida." };
}
