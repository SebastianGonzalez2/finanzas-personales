import { bankCurrencies } from "./bank-balances.ts";
import { Money, normalizeDecimalAmount, type Currency } from "./money.ts";
import { movementUuid as uuid } from "./movements.ts";

export const fundStatuses = {
  active: "Activo",
  paused_manual: "Pausado",
  paused_target_reached: "Aportes pausados por meta",
  closed: "Cerrado",
} as const;
export type FundStatus = keyof typeof fundStatuses;
export type EditableFundStatus = "active" | "paused_manual";

export type SavingsFund = {
  id: string;
  name: string;
  currency: Currency;
  reservedAmount: string;
  committedAmount?: string;
  targetAmount: string | null;
  targetDate: string | null;
  status: FundStatus;
  version: number;
};

type FundTarget = { fundId: string; version: number };
export type FundMovement = {
  idempotencyKey: string;
  amount: string;
} & FundTarget &
  (
    | { action: "reserve" | "release" }
    | {
        action: "transfer";
        destinationFundId: string;
        destinationVersion: number;
      }
  );

export type FundAvailability = { currency: Currency; amount: string };
export type FundClosureRecord = {
  fundId: string;
  amount: string;
  closedOn: string;
};

export type FundCommand =
  | FundMovement
  | ({ idempotencyKey: string } & (
      | { action: "create"; name: string; currency: Currency }
      | ({ action: "close"; pendingToken: string } & FundTarget)
      | ({
          action: "update";
          name: string;
          targetAmount?: string | null;
          targetDate?: string | null;
        } & FundTarget &
          Partial<{ status: EditableFundStatus }>)
    ));

const editableStatuses: EditableFundStatus[] = ["active", "paused_manual"];
const keys = {
  create: ["name", "currency"],
  update: ["fundId", "version", "name", "status", "targetAmount", "targetDate"],
  close: ["fundId", "version", "pendingToken"],
  reserve: ["fundId", "version", "amount"],
  release: ["fundId", "version", "amount"],
  transfer: [
    "fundId",
    "version",
    "amount",
    "destinationFundId",
    "destinationVersion",
  ],
};

function fundVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 2147483647
  );
}

export function parseFundAmount(input: unknown) {
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

export function parseFundDate(input: unknown) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return value;
}

export function targetRemainder(
  fund: Pick<SavingsFund, "targetAmount" | "reservedAmount" | "currency">,
) {
  if (fund.targetAmount === null) return null;
  return Money.parse(fund.targetAmount, fund.currency)
    .add(Money.parse(fund.reservedAmount, fund.currency).negate())
    .toDecimal();
}

export async function pendingContributionToken(ids: readonly string[]) {
  const data = new TextEncoder().encode([...ids].sort().join(","));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function contributionTowardTarget(
  scheduledAmount: string,
  fund: Parameters<typeof targetRemainder>[0],
) {
  const remaining = targetRemainder(fund);
  if (remaining === null) return { amount: scheduledAmount, final: false };
  const units = (amount: string) => BigInt(amount.replace(".", ""));
  if (units(remaining) <= BigInt(0)) return { amount: null, final: false };
  return units(remaining) <= units(scheduledAmount)
    ? { amount: remaining, final: true }
    : { amount: scheduledAmount, final: false };
}

// The live notices are projections of durable fund state: one per kind and
// fund, updated or removed as that state changes, with no daily inserts.
export function fundTargetNotices(fund: SavingsFund, today: string) {
  const remaining = targetRemainder(fund);
  const below =
    remaining !== null && BigInt(remaining.replace(".", "")) > BigInt(0);
  return {
    remaining,
    reached: remaining !== null && !below,
    pausedByTarget: fund.status === "paused_target_reached",
    overdue:
      fund.status !== "closed" &&
      below &&
      !!fund.targetDate &&
      fund.targetDate < today,
  };
}

/** Whole calendar months between two YYYY-MM-DD dates, at least one. */
export function monthsUntil(today: string, deadline: string) {
  const months = (value: string) => {
    const [year, month] = value.split("-").map(Number);
    return year * 12 + month;
  };
  return Math.max(1, months(deadline) - months(today));
}

/** Monthly amount needed to close a gap within a whole number of months. */
export function orientativeMonthlySaving(remaining: string, months: number) {
  if (!Number.isInteger(months) || months < 1) return null;
  const units = BigInt(remaining.replace(".", ""));
  // Round half up to four fractional digits, like the exact amounts.
  const scaled =
    (units * BigInt(2) + BigInt(months)) / (BigInt(months) * BigInt(2));
  const digits = scaled.toString().padStart(5, "0");
  return `${digits.slice(0, -4)}.${digits.slice(-4)}`;
}

export function parseFundCommand(
  input: unknown,
): FundCommand | { error: string } {
  const invalid = { error: "Revisá los datos del fondo." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const {
    action,
    fundId,
    version,
    name,
    currency,
    status,
    idempotencyKey,
    amount,
    targetAmount,
    targetDate,
    pendingToken,
    destinationFundId,
    destinationVersion,
  } = input as Record<string, unknown>;
  if (
    action !== "create" &&
    action !== "update" &&
    action !== "close" &&
    action !== "reserve" &&
    action !== "release" &&
    action !== "transfer"
  )
    return invalid;
  if (
    Object.keys(input).some(
      (key) => !["action", "idempotencyKey", ...keys[action]].includes(key),
    ) ||
    typeof idempotencyKey !== "string" ||
    !uuid.test(idempotencyKey)
  )
    return invalid;
  const commandKey = idempotencyKey.toLowerCase();
  if (action === "close") {
    if (
      typeof fundId !== "string" ||
      !uuid.test(fundId) ||
      !fundVersion(version) ||
      typeof pendingToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(pendingToken)
    )
      return invalid;
    return {
      action,
      fundId: fundId.toLowerCase(),
      version,
      pendingToken,
      idempotencyKey: commandKey,
    };
  }
  if (action !== "create" && action !== "update") {
    if (
      typeof fundId !== "string" ||
      !uuid.test(fundId) ||
      !fundVersion(version)
    )
      return invalid;
    const decimal = parseFundAmount(amount);
    if (!decimal)
      return {
        error: "Ingresá un importe positivo con hasta cuatro decimales.",
      };
    const movement = {
      fundId: fundId.toLowerCase(),
      version,
      amount: decimal,
      idempotencyKey: commandKey,
    };
    if (action !== "transfer") return { action, ...movement };
    if (
      typeof destinationFundId !== "string" ||
      !uuid.test(destinationFundId) ||
      !fundVersion(destinationVersion) ||
      destinationFundId.toLowerCase() === movement.fundId
    ) {
      return { error: "Elegí otro fondo como destino del traspaso." };
    }
    return {
      action,
      ...movement,
      destinationFundId: destinationFundId.toLowerCase(),
      destinationVersion,
    };
  }
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    name.includes("\0")
  )
    return { error: "Indicá un nombre de hasta 100 caracteres." };

  if (action === "create") {
    const code = bankCurrencies.find((item) => item === currency);
    if (!code) return { error: "Elegí UYU, USD o EUR para el fondo." };
    return {
      action,
      name: name.trim(),
      currency: code,
      idempotencyKey: commandKey,
    };
  }

  if (typeof fundId !== "string" || !uuid.test(fundId) || !fundVersion(version))
    return invalid;
  if (
    status !== undefined &&
    !editableStatuses.includes(status as EditableFundStatus)
  )
    return { error: "Solo podés activar o pausar un fondo desde el catálogo." };
  const rawTarget =
    targetAmount === null || targetAmount === "" || targetAmount === undefined
      ? null
      : targetAmount;
  const meta = rawTarget === null ? null : parseFundAmount(rawTarget);
  if (rawTarget !== null && !meta)
    return {
      error: "Ingresá una meta positiva con hasta cuatro decimales, o quitala.",
    };
  const rawDeadline =
    targetDate === null || targetDate === "" || targetDate === undefined
      ? null
      : targetDate;
  const deadline = rawDeadline === null ? null : parseFundDate(rawDeadline);
  if (rawDeadline !== null && !deadline)
    return { error: "Ingresá una fecha válida para la meta, o quitála." };
  return {
    action,
    fundId: fundId.toLowerCase(),
    version,
    name: name.trim(),
    ...(status === undefined ? {} : { status: status as EditableFundStatus }),
    ...(targetAmount === undefined ? {} : { targetAmount: meta }),
    ...(targetDate === undefined ? {} : { targetDate: deadline }),
    idempotencyKey: commandKey,
  };
}
