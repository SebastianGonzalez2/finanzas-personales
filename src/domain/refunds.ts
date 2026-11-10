import {
  bankCurrencies,
  bankReferenceToday,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import { movementUuid } from "./movements.ts";

export type RefundPart = {
  method: "debit" | "credit";
  categoryId: string | null;
  amount: string;
};

export type RefundPartStatus = RefundPart & {
  category: string | null;
  remaining: string;
  credited: string;
  cancelled: string;
  overlap: string;
};

export function unmatchedRefund(part: RefundPartStatus, action: string) {
  const opposite = amountUnits(
    action === "credit" ? part.cancelled : part.credited,
  );
  return opposite - amountUnits(part.overlap);
}

type RefundInput =
  | { action: "pending"; purchaseId: string; amount: string }
  | {
      action: "credit";
      purchaseId: string;
      pendingId: string | null;
      overlaps: boolean;
      parts: RefundPart[];
    }
  | {
      action: "cancel_installments";
      purchaseId: string;
      pendingId: string | null;
      overlaps: boolean;
      ordinals: number[];
    }
  | {
      action: "return_balance";
      cardId: string;
      currency: Currency;
      amount: string;
    };

export type RefundCommand = { idempotencyKey: string } & (
  (RefundInput & { effectiveOn: string }) | { action: "void"; eventId: string }
);

export type RefundEntry = {
  id: string;
  purchaseId: string | null;
  purchaseConcept: string | null;
  pendingId: string | null;
  action: RefundCommand["action"];
  effectiveOn: string;
  currency: Currency;
  amount: string;
  remaining: string;
  status: string;
  cardId: string | null;
  card: string | null;
  debtReduced: string;
  creditDelta: string;
  ordinals: number[];
  parts: (RefundPart & { category: string | null; overlap: string })[];
};

export const refundPartKey = ({
  method,
  categoryId,
}: Pick<RefundPart, "method" | "categoryId">) =>
  `${method}:${categoryId ?? "none"}`;

export function amountUnits(amount: string) {
  return BigInt(normalizeDecimalAmount(amount).replace(".", ""));
}

export function refundDecimal(units: bigint) {
  const negative = units < BigInt(0);
  const digits = (negative ? -units : units).toString().padStart(5, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -4)}.${digits.slice(-4)}`;
}

function record(input: unknown, keys: string[]) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new Error();
  return input as Record<string, unknown>;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !movementUuid.test(value)) throw new Error();
  return value.toLowerCase();
}

function positive(value: unknown) {
  const amount = normalizeDecimalAmount(
    typeof value === "string" ? value.replace(",", ".") : value,
  );
  if (amountUnits(amount) <= BigInt(0)) throw new Error();
  return amount;
}

const fields = {
  pending: ["purchaseId", "amount"],
  credit: ["purchaseId", "pendingId", "parts", "overlaps"],
  cancel_installments: ["purchaseId", "pendingId", "ordinals", "overlaps"],
  return_balance: ["cardId", "currency", "amount"],
  void: ["eventId"],
} as const;

export function parseRefundCommand(
  input: unknown,
  today = bankReferenceToday(),
): RefundCommand | { error: string } {
  try {
    const action = (input as { action?: unknown } | null)?.action;
    if (typeof action !== "string" || !Object.hasOwn(fields, action))
      throw new Error();
    const kind = action as keyof typeof fields;
    const base = ["action", "idempotencyKey"];
    const data = record(input, [
      ...base,
      ...(kind === "void" ? [] : ["effectiveOn"]),
      ...fields[kind],
    ]);
    const idempotencyKey = uuid(data.idempotencyKey);
    if (kind === "void")
      return { action: kind, idempotencyKey, eventId: uuid(data.eventId) };
    if (!isBankReferenceDate(data.effectiveOn, today)) throw new Error();
    const common = { idempotencyKey, effectiveOn: data.effectiveOn };
    if (kind === "return_balance") {
      const currency = bankCurrencies.find((code) => code === data.currency);
      if (!currency) throw new Error();
      return {
        ...common,
        action: kind,
        currency,
        cardId: uuid(data.cardId),
        amount: positive(data.amount),
      };
    }
    const purchaseId = uuid(data.purchaseId);
    if (kind === "pending")
      return {
        ...common,
        action: kind,
        purchaseId,
        amount: positive(data.amount),
      };
    if (data.overlaps !== undefined && typeof data.overlaps !== "boolean")
      throw new Error();
    const linked = {
      overlaps: data.overlaps === true,
      ...common,
      purchaseId,
      pendingId: data.pendingId == null ? null : uuid(data.pendingId),
    };
    if (kind === "cancel_installments") {
      if (
        !Array.isArray(data.ordinals) ||
        !data.ordinals.length ||
        data.ordinals.length > 120 ||
        data.ordinals.some((i) => !Number.isInteger(i) || i < 1 || i > 120) ||
        new Set(data.ordinals).size !== data.ordinals.length
      )
        throw new Error();
      return {
        ...linked,
        action: kind,
        ordinals: [...data.ordinals].sort((a, b) => a - b),
      };
    }
    if (
      !Array.isArray(data.parts) ||
      !data.parts.length ||
      data.parts.length > 40
    )
      throw new Error();
    const parts = data.parts
      .map((raw): RefundPart => {
        const { method, categoryId, amount } = record(raw, [
          "method",
          "categoryId",
          "amount",
        ]);
        if (method !== "debit" && method !== "credit") throw new Error();
        return {
          method,
          categoryId: categoryId === null ? null : uuid(categoryId),
          amount: positive(amount),
        };
      })
      .sort((a, b) => refundPartKey(a).localeCompare(refundPartKey(b)));
    if (new Set(parts.map(refundPartKey)).size !== parts.length)
      throw new Error();
    return { ...linked, action: kind, parts };
  } catch {
    return {
      error: "Revisá la fecha, los importes y el detalle de la devolución.",
    };
  }
}
