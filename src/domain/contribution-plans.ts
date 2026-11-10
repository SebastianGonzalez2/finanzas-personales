import type { Currency } from "./money.ts";
import { movementUuid } from "./movements.ts";
import { parseFundAmount } from "./savings-funds.ts";
import { isContributionDay } from "./scheduled-contributions.ts";

export type ContributionPlan = {
  fundId: string;
  amount: string;
  preferredDay: number;
  version: number;
  nextOn: string | null;
  nextAmount: string | null;
};

export type ContributionPeriod = {
  id: string;
  fundId: string;
  fundName: string;
  amount: string;
  currency: Currency;
  scheduledOn: string;
  status:
    "missed_insufficient" | "missed_execution" | "completed" | "discarded";
  reason: "insufficient" | "late" | "fund_limit" | null;
  resolvedOn: string | null;
};

export type ContributionChange = {
  id: string;
  fundId: string;
  action: "configure" | "pause" | "reactivate";
  amount: string;
  preferredDay: number;
  changedOn: string;
  nextOn: string | null;
  nextAmount: string | null;
  effectiveOn: string | null;
};

export type PlanCommand = { fundId: string; version: number } & (
  | { action: "configure"; amount: string; preferredDay: number }
  | { action: "pause" | "reactivate" }
);

export type ContributionCommand = { idempotencyKey: string } & (
  PlanCommand | { action: "complete" | "discard"; periodId: string }
);

export function contributionPending(period: ContributionPeriod) {
  return (
    period.status === "missed_insufficient" ||
    period.status === "missed_execution"
  );
}

const fields = {
  configure: ["fundId", "version", "amount", "preferredDay"],
  pause: ["fundId", "version"],
  reactivate: ["fundId", "version"],
  complete: ["periodId"],
  discard: ["periodId"],
};

export function parseContributionCommand(
  input: unknown,
): ContributionCommand | { error: string } {
  const invalid = { error: "Revisá los datos de la aportación." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const {
    action,
    idempotencyKey,
    fundId,
    version,
    amount,
    preferredDay,
    periodId,
  } = input as Record<string, unknown>;
  if (
    action !== "configure" &&
    action !== "pause" &&
    action !== "reactivate" &&
    action !== "complete" &&
    action !== "discard"
  )
    return invalid;
  if (
    typeof idempotencyKey !== "string" ||
    !movementUuid.test(idempotencyKey) ||
    Object.keys(input).some(
      (key) => !["action", "idempotencyKey", ...fields[action]].includes(key),
    )
  )
    return invalid;
  const key = idempotencyKey.toLowerCase();
  if (action === "complete" || action === "discard") {
    if (typeof periodId !== "string" || !movementUuid.test(periodId))
      return invalid;
    return { action, idempotencyKey: key, periodId: periodId.toLowerCase() };
  }
  if (
    typeof fundId !== "string" ||
    !movementUuid.test(fundId) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 0 ||
    version >= 2147483647
  )
    return invalid;
  const target = { fundId: fundId.toLowerCase(), version, idempotencyKey: key };
  if (action !== "configure") return { action, ...target };
  const decimal = parseFundAmount(amount);
  if (!decimal || !isContributionDay(preferredDay))
    return {
      error:
        "Ingresá un importe positivo con hasta cuatro decimales y un día entre 1 y 31.",
    };
  return { action, ...target, amount: decimal, preferredDay };
}
