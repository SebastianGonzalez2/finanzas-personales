import { bankReferenceToday, isBankReferenceDate } from "./bank-balances.ts";
import { parseCreditCommand, type CreditCommand } from "./credit-operations.ts";
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
export type RevisedShares = {
  ownAmount: string;
  parties: { loanId: string; amount: string }[];
};
type Details = Pick<MovementInput, "concept" | "categoryId" | "note">;
type Purchase = Extract<CreditCommand, { action: "purchase" }>;
export type SharedAllocation = { ownAmount: string; parties: Party[] };
type Expense = Details &
  Pick<MovementInput, "currency" | "amount" | "effectiveOn">;

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
      SharedAllocation)
  | ({ action: "split"; eventId: string } & SharedAllocation)
  | ({
      action: "revise-split";
      eventId: string;
      expectedVersion: number;
    } & RevisedShares)
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

export function sharedPersonName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > conceptLimit ||
    value.includes("\0")
  )
    throw new Error();
  return value.trim().replace(/\s+/g, " ").normalize("NFC");
}

function person(value: Record<string, unknown>) {
  const dueOn = value.dueOn === "" ? null : (value.dueOn ?? null);
  if (dueOn !== null && !isBankReferenceDate(dueOn, "9999-12-31"))
    throw new Error();
  return {
    name: sharedPersonName(value.name),
    dueOn,
  };
}

export function parseSharedAllocation(
  own: unknown,
  list: unknown,
): SharedAllocation {
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
  { ownAmount, parties }: SharedAllocation,
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
        ...parseSharedAllocation(data.ownAmount, data.parties),
      };
    }
    if (action === "edit" || action === "revise-split") {
      const data = fields(input, [
        ...common,
        "eventId",
        "expectedVersion",
        ...(action === "edit" ? details : split),
      ]);
      const { expectedVersion } = data;
      if (
        typeof expectedVersion !== "number" ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1
      )
        throw new Error();
      if (action === "revise-split") {
        if (
          !Array.isArray(data.parties) ||
          !data.parties.length ||
          data.parties.length > maxFriends
        )
          throw new Error();
        const parties = data.parties
          .map((entry) => {
            const row = fields(entry, ["loanId", "amount"]);
            return {
              loanId: uuid(row.loanId),
              amount: amount(row.amount, true),
            };
          })
          .sort((a, b) => a.loanId.localeCompare(b.loanId));
        if (
          new Set(parties.map(({ loanId }) => loanId)).size !== parties.length
        )
          throw new Error();
        return {
          action,
          eventId: uuid(data.eventId),
          idempotencyKey: uuid(data.idempotencyKey),
          expectedVersion,
          ownAmount: amount(data.ownAmount, true),
          parties,
        };
      }
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
    } = parsed;
    const expense = {
      currency,
      amount: total,
      concept,
      categoryId,
      note,
      effectiveOn,
      idempotencyKey,
    };
    if (method === "third_party")
      return {
        action,
        method,
        ...expense,
        creditor: person(fields(data.creditor, ["name", "dueOn"])),
      };
    const shares = parseSharedAllocation(data.ownAmount, data.parties);
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
