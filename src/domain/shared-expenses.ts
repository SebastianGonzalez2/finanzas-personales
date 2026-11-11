import { bankReferenceToday, isBankReferenceDate } from "./bank-balances.ts";
import { parseCreditCommand, type CreditCommand } from "./credit-operations.ts";
import { normalizeName } from "./catalog.ts";
import { installmentTotal } from "./installments.ts";
import {
  conceptLimit,
  movementUuid,
  parseMovement,
  type MovementInput,
} from "./movements.ts";
import { Money, normalizeDecimalAmount, type Currency } from "./money.ts";

export const maxFriends = 20;

type Party = { name: string; amount: string; dueOn: string | null };
type Details = Pick<MovementInput, "concept" | "categoryId" | "note">;
type Purchase = Extract<CreditCommand, { action: "purchase" }>;
type Allocation = { ownAmount: string; parties: Party[] };
type Expense = Details &
  Pick<MovementInput, "currency" | "amount" | "effectiveOn" | "merchantName">;

export type SharedExpenseCommand = { idempotencyKey: string } & (
  | ({
      action: "create";
      method: "third_party";
      creditor: Omit<Party, "amount">;
    } & Expense)
  | ({
      action: "create";
      method: "debit" | "transfer" | "credit";
      purchase?: Purchase;
    } & Expense &
      Allocation)
  | ({ action: "split"; eventId: string } & Allocation)
  | ({ action: "edit"; eventId: string; expectedVersion: number } & Details)
);

function fields(value: unknown, allowed: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error();
  return value as Record<string, unknown>;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !movementUuid.test(value)) throw new Error();
  return value.toLowerCase();
}

function amount(value: unknown, allowZero = false) {
  const normalized = normalizeDecimalAmount(
    typeof value === "string" ? value.trim().replace(",", ".") : value,
  );
  if (normalized.startsWith("-") || (!allowZero && normalized === "0.0000"))
    throw new Error();
  return normalized;
}

function person(value: Record<string, unknown>) {
  if (
    typeof value.name !== "string" ||
    !normalizeName(value.name) ||
    value.name.length > conceptLimit ||
    value.name.includes("\0")
  )
    throw new Error();
  const dueOn = value.dueOn === "" ? null : (value.dueOn ?? null);
  if (dueOn !== null && !isBankReferenceDate(dueOn, "9999-12-31"))
    throw new Error();
  return {
    name: value.name.trim().replace(/\s+/g, " ").normalize("NFC"),
    dueOn,
  };
}

function allocation(own: unknown, list: unknown): Allocation {
  if (!Array.isArray(list) || list.length < 1 || list.length > maxFriends)
    throw new Error();
  const parties = list.map((item) => {
    const row = fields(item, ["name", "amount", "dueOn"]);
    return { ...person(row), amount: amount(row.amount) };
  });
  if (
    new Set(parties.map(({ name }) => name.toLocaleLowerCase("es"))).size !==
    parties.length
  )
    throw new Error("Ingresá un nombre distinto para cada persona.");
  return { ownAmount: amount(own, true), parties };
}

export function allocationMatches(
  { ownAmount, parties }: Allocation,
  total: string,
  currency: Currency,
) {
  try {
    const allocated = parties.reduce(
      (sum, party) => sum.add(Money.parse(party.amount, currency)),
      Money.parse(ownAmount, currency),
    );
    return allocated.toDecimal() === total;
  } catch {
    return false;
  }
}

export function parseSharedExpense(
  input: unknown,
  today = bankReferenceToday(),
): SharedExpenseCommand | { error: string } {
  const invalid = "Revisá los datos, las fechas y los importes del gasto.";
  try {
    const common = ["action", "idempotencyKey"];
    const details = ["concept", "categoryId", "note"];
    const split = ["ownAmount", "parties"];
    const action = (input as { action?: unknown } | null)?.action;
    if (action === "split") {
      const data = fields(input, [...common, "eventId", ...split]);
      return {
        action,
        eventId: uuid(data.eventId),
        idempotencyKey: uuid(data.idempotencyKey),
        ...allocation(data.ownAmount, data.parties),
      };
    }
    if (action === "edit") {
      const data = fields(input, [
        ...common,
        "eventId",
        "expectedVersion",
        ...details,
      ]);
      const { expectedVersion } = data;
      if (
        typeof expectedVersion !== "number" ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1
      )
        throw new Error();
      const parsed = parseMovement(
        {
          kind: "expense",
          currency: "UYU",
          method: "debit",
          amount: "1",
          effectiveOn: today,
          concept: data.concept,
          categoryId: data.categoryId,
          note: data.note,
          idempotencyKey: data.idempotencyKey,
        },
        today,
      );
      if ("error" in parsed) return parsed;
      const { concept, note, categoryId, idempotencyKey } = parsed;
      return {
        action,
        eventId: uuid(data.eventId),
        expectedVersion,
        concept,
        note,
        categoryId,
        idempotencyKey,
      };
    }
    if (action !== "create") throw new Error();
    const method = (input as { method?: unknown }).method;
    const data = fields(input, [
      ...common,
      ...details,
      "method",
      "currency",
      "amount",
      "effectiveOn",
      "merchantName",
      ...(method === "third_party" ? ["creditor"] : split),
      ...(method === "credit"
        ? ["cardId", "cardAmount", "plan", "covered"]
        : []),
    ]);
    if (
      method !== "third_party" &&
      method !== "debit" &&
      method !== "transfer" &&
      method !== "credit"
    )
      throw new Error();
    const parsed = parseMovement(
      {
        kind: "expense",
        currency: data.currency,
        method: method === "transfer" ? "transfer" : "debit",
        amount: data.amount,
        effectiveOn: data.effectiveOn,
        merchantName: data.merchantName,
        concept: data.concept,
        note: data.note,
        categoryId: data.categoryId,
        idempotencyKey: data.idempotencyKey,
      },
      today,
    );
    if ("error" in parsed) return parsed;
    const {
      currency,
      amount: total,
      concept,
      categoryId,
      note,
      effectiveOn,
      idempotencyKey,
      merchantName,
    } = parsed;
    const expense = {
      currency,
      amount: total,
      concept,
      categoryId,
      note,
      effectiveOn,
      idempotencyKey,
      ...(merchantName && { merchantName }),
    };
    if (method === "third_party")
      return {
        action,
        method,
        ...expense,
        creditor: person(fields(data.creditor, ["name", "dueOn"])),
      };
    const shares = allocation(data.ownAmount, data.parties);
    if (!allocationMatches(shares, total, currency))
      return {
        error: "Tu parte y las de tus amigos deben sumar el total exacto.",
      };
    if (method !== "credit") return { action, method, ...expense, ...shares };

    const purchase = parseCreditCommand(
      {
        action: "purchase",
        currency,
        amount: data.plan ? data.cardAmount : total,
        concept,
        categoryId,
        note,
        effectiveOn,
        idempotencyKey,
        cardId: data.cardId,
        covered: data.covered,
        ...(merchantName && { merchantName }),
        ...(data.plan !== undefined && { plan: data.plan }),
      },
      today,
    );
    if ("error" in purchase) return purchase;
    if (
      purchase.action !== "purchase" ||
      (purchase.plan && installmentTotal(purchase.plan, currency) !== total)
    )
      return { error: "Las cuotas deben sumar el total exacto de la compra." };
    return { action, method, ...expense, ...shares, purchase };
  } catch (error) {
    return {
      error:
        error instanceof Error &&
        error.message.startsWith("Ingresá un nombre distinto")
          ? error.message
          : invalid,
    };
  }
}
