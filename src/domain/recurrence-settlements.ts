import { isBankReferenceDate } from "./bank-balances.ts";
import {
  decimalToUnits,
  normalizeDecimalAmount,
  unitsToDecimal,
} from "./money.ts";
import { movementUuid } from "./movements.ts";
import type {
  RecurrencePeriod,
  RecurrencePeriodStatus,
} from "./recurrences.ts";

export const settlementLimit = 12;
export const duplicateSettlement =
  "Ya existe un movimiento parecido. Revisá los movimientos de esa fecha o confirmá que se trata de otro.";

export type SettlementTarget = {
  index: number;
  recorded: string;
  version: number;
  total: string | null;
  final: boolean;
  amount: string;
};

export type Settlement = {
  seriesId: string;
  idempotencyKey: string;
} & (
  | {
      action: "record";
      targets: SettlementTarget[];
      amount: string;
      effectiveOn: string;
      method: "debit" | "transfer" | "unspecified";
      distinct: boolean;
    }
  | {
      action: "link";
      targets: SettlementTarget[];
      amount: string;
      eventId: string;
    }
  | {
      action: "detach";
      target: Omit<SettlementTarget, "amount">;
      eventId: string;
    }
  | {
      action: "total" | "omit" | "restore";
      target: Omit<SettlementTarget, "amount">;
    }
);

export type SettlementEvent = {
  id: string;
  effectiveOn: string;
  amount: string;
  method: "deposit" | "debit" | "transfer" | "credit" | "unspecified";
};

export type TrackedPeriod = RecurrencePeriod & {
  referenceAmount: string | null;
  confirmedTotal: string | null;
  finalized: boolean;
  recorded: string;
  remaining: string | null;
  status: RecurrencePeriodStatus;
  version: number;
  events: SettlementEvent[];
};

function uuid(value: unknown) {
  if (typeof value !== "string" || !movementUuid.test(value)) throw new Error();
  return value.toLowerCase();
}

function exact(value: unknown, allowZero = false) {
  const result = normalizeDecimalAmount(
    typeof value === "string" ? value.trim().replace(",", ".") : value,
  );
  if (result.startsWith("-") || (!allowZero && result === "0.0000"))
    throw new Error();
  return result;
}

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

function periodTarget(value: unknown, withAmount: boolean) {
  const {
    index,
    recorded,
    version,
    total = null,
    final = false,
    amount,
  } = fields(value, [
    "index",
    "recorded",
    "version",
    "total",
    "final",
    ...(withAmount ? ["amount"] : []),
  ]);
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 521723 ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 0 ||
    version > 2147483647 ||
    typeof final !== "boolean" ||
    (final && total !== null)
  )
    throw new Error();
  return {
    index,
    recorded: exact(recorded, true),
    version,
    total: total === null ? null : exact(total),
    final,
    amount: withAmount ? exact(amount) : "0.0000",
  };
}

export function parseSettlement(
  input: unknown,
  today: string,
): Settlement | { error: string } {
  try {
    const base = ["action", "seriesId", "idempotencyKey"];
    const { action, seriesId, idempotencyKey } = fields(input, [
      ...base,
      "target",
      "targets",
      "amount",
      "effectiveOn",
      "method",
      "distinct",
      "eventId",
    ]);
    const command = {
      seriesId: uuid(seriesId),
      idempotencyKey: uuid(idempotencyKey),
    };
    if (
      action === "total" ||
      action === "omit" ||
      action === "restore" ||
      action === "detach"
    ) {
      const { target, eventId } = fields(input, [
        ...base,
        "target",
        ...(action === "detach" ? ["eventId"] : []),
      ]);
      const { index, recorded, version, total, final } = periodTarget(
        target,
        false,
      );
      if (action !== "total" && (total || final)) throw new Error();
      const period = { index, recorded, version, total, final };
      return action === "detach"
        ? { ...command, action, target: period, eventId: uuid(eventId) }
        : { ...command, action, target: period };
    }
    if (action !== "record" && action !== "link") throw new Error();
    const { targets, amount, eventId } = fields(input, [
      ...base,
      "targets",
      "amount",
      ...(action === "record"
        ? ["effectiveOn", "method", "distinct"]
        : ["eventId"]),
    ]);
    if (
      !Array.isArray(targets) ||
      !targets.length ||
      targets.length > settlementLimit
    )
      throw new Error();
    const parsed = targets
      .map((target) => periodTarget(target, true))
      .sort((a, b) => a.index - b.index);
    const actual = exact(amount);
    if (
      new Set(parsed.map(({ index }) => index)).size !== parsed.length ||
      parsed.reduce(
        (sum, part) => sum + decimalToUnits(part.amount),
        BigInt(0),
      ) !== decimalToUnits(actual)
    ) {
      return {
        error:
          "Los importes asignados deben sumar exactamente el importe real.",
      };
    }
    const settlement = {
      ...command,
      targets: parsed,
      amount: actual,
    };
    if (action === "link")
      return { ...settlement, action, eventId: uuid(eventId) };

    const {
      effectiveOn,
      method,
      distinct = false,
    } = input as Record<string, unknown>;
    if (
      !isBankReferenceDate(effectiveOn, today) ||
      typeof distinct !== "boolean" ||
      (method !== "unspecified" && method !== "debit" && method !== "transfer")
    )
      throw new Error();
    return { ...settlement, action, effectiveOn, method, distinct };
  } catch {
    return {
      error:
        "Revisá el período, la fecha real y los importes positivos con hasta cuatro decimales.",
    };
  }
}

export function settlementAmounts(
  recorded: string,
  total: string | null,
  finalizedAmount: string | null,
  omitted: boolean,
) {
  const actual = decimalToUnits(recorded);
  const finalized =
    finalizedAmount !== null && decimalToUnits(finalizedAmount) === actual;
  const remaining = total === null ? null : decimalToUnits(total) - actual;
  const status: RecurrencePeriodStatus = omitted
    ? "skipped"
    : finalized || remaining === BigInt(0)
      ? "completed"
      : actual > BigInt(0)
        ? "partial"
        : "expected";
  return {
    status,
    finalized,
    confirmedTotal: finalized ? recorded : total,
    remaining: finalized
      ? "0.0000"
      : remaining === null || omitted
        ? null
        : unitsToDecimal(remaining),
  };
}
