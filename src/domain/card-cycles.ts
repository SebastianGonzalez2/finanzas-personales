import { bankCurrencies, isBankReferenceDate } from "./bank-balances.ts";
import { installmentPeriodAt, isInstallmentPeriod } from "./installments.ts";
import { Money, type Currency } from "./money.ts";
import { movementUuid } from "./movements.ts";

type Revision = { version: number };
export type CycleSchedule = Revision & {
  closingDay: number | null;
  dueDay: number | null;
  leadDays: number;
};
export type CycleDates = Revision & {
  closingOn: string | null;
  dueOn: string | null;
};
export type OfficialStatement = Revision & {
  officialAmount: string | null;
  minimumAmount: string | null;
  dueOn: string | null;
};
export type CycleAssignment = Revision & { assignedPeriod: string | null };

export const defaultCycleSchedule: CycleSchedule = {
  version: 0,
  closingDay: null,
  dueDay: null,
  leadDays: 3,
};
export const defaultCycleDates: CycleDates = {
  version: 0,
  closingOn: null,
  dueOn: null,
};
export const defaultStatement: OfficialStatement = {
  version: 0,
  officialAmount: null,
  minimumAmount: null,
  dueOn: null,
};

export type CycleCommand = { cardId: string; idempotencyKey: string } & (
  | ({ scope: "schedule" } & CycleSchedule)
  | ({ scope: "dates"; period: string } & CycleDates)
  | ({
      scope: "statement";
      period: string;
      currency: Currency;
    } & OfficialStatement)
  | ({
      scope: "assignment";
      purchaseId: string;
      ordinal: number;
      currency: Currency;
      reviewed: boolean;
    } & CycleAssignment)
);

export function parseCycleCommand(
  input: unknown,
): CycleCommand | { error: string } {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error();
    const data = input as Record<string, unknown>;
    const scope = data.scope;
    const fields = {
      schedule: ["closingDay", "dueDay", "leadDays"],
      dates: ["period", "closingOn", "dueOn"],
      statement: [
        "period",
        "currency",
        "officialAmount",
        "minimumAmount",
        "dueOn",
      ],
      assignment: [
        "purchaseId",
        "ordinal",
        "currency",
        "assignedPeriod",
        "reviewed",
      ],
    } as const;
    if (
      scope !== "schedule" &&
      scope !== "dates" &&
      scope !== "statement" &&
      scope !== "assignment"
    )
      throw new Error();
    const keys = [
      "scope",
      "cardId",
      "idempotencyKey",
      "version",
      ...fields[scope],
    ];
    if (
      Object.keys(data).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(data, key))
    )
      throw new Error();
    const base = {
      cardId: uuid(data.cardId),
      idempotencyKey: uuid(data.idempotencyKey),
      version: integer(data.version, 0, 2147483646),
    };
    if (scope === "schedule")
      return {
        ...base,
        scope,
        closingDay: day(data.closingDay),
        dueDay: day(data.dueDay),
        leadDays: integer(data.leadDays, 0, 365),
      };
    if (scope === "assignment") {
      if (typeof data.reviewed !== "boolean") throw new Error();
      return {
        ...base,
        scope,
        purchaseId: uuid(data.purchaseId),
        ordinal: integer(data.ordinal, 0, 120),
        currency: currency(data.currency),
        assignedPeriod:
          data.assignedPeriod === "" ? null : period(data.assignedPeriod),
        reviewed: data.reviewed,
      };
    }
    const cyclePeriod = period(data.period);
    const dueOn = date(data.dueOn);
    if (dueOn && dueOn < `${cyclePeriod}-01`) throw new Error();
    if (scope === "dates") {
      const closingOn = date(data.closingOn);
      if (
        closingOn &&
        (!closingOn.startsWith(cyclePeriod) || (dueOn && dueOn < closingOn))
      )
        throw new Error();
      return { ...base, scope, period: cyclePeriod, closingOn, dueOn };
    }
    const code = currency(data.currency);
    const officialAmount = amount(data.officialAmount, code);
    const minimumAmount = amount(data.minimumAmount, code);
    if (
      minimumAmount !== null &&
      (officialAmount === null || units(minimumAmount) > units(officialAmount))
    )
      throw new Error();
    return {
      ...base,
      scope,
      period: cyclePeriod,
      currency: code,
      officialAmount,
      minimumAmount,
      dueOn,
    };
  } catch {
    return {
      error:
        "Revisá el ciclo, las fechas y los importes. El mínimo requiere un total oficial y no puede superarlo.",
    };
  }
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !movementUuid.test(value)) throw new Error();
  return value.toLowerCase();
}

function integer(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error();
  return value;
}

function day(value: unknown) {
  return value === null ? null : integer(value, 1, 31);
}

function period(value: unknown) {
  if (!isInstallmentPeriod(value)) throw new Error();
  return value;
}

function date(value: unknown) {
  if (value === "") return null;
  if (!isBankReferenceDate(value, "9999-12-31")) throw new Error();
  return value;
}

function currency(value: unknown) {
  const code = bankCurrencies.find((code) => code === value);
  if (!code) throw new Error();
  return code;
}

function amount(value: unknown, code: Currency) {
  if (typeof value !== "string") throw new Error();
  if (!value.trim()) return null;
  const parsed = Money.parse(value.trim().replace(",", "."), code).toDecimal();
  if (parsed.startsWith("-")) throw new Error();
  return parsed;
}

// The totals may span multiple NUMERIC(20,4) rows.
export function cycleAmount(values: string[]) {
  return decimal(
    values.reduce((total, amount) => total + units(amount), BigInt(0)),
  );
}

function units(amount: string) {
  return BigInt(amount.replace(".", ""));
}

function decimal(value: bigint) {
  const digits = (value < BigInt(0) ? -value : value)
    .toString()
    .padStart(5, "0");
  return `${value < BigInt(0) ? "-" : ""}${digits.slice(0, -4)}.${digits.slice(-4)}`;
}

function calendarDay(period: string, day: number) {
  const end = new Date(`${period}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return `${period}-${String(Math.min(day, end.getUTCDate())).padStart(2, "0")}`;
}

export function cycleClosingOn(
  period: string,
  schedule: CycleSchedule,
  dates?: CycleDates,
) {
  return (
    dates?.closingOn ??
    (schedule.closingDay === null
      ? null
      : calendarDay(period, schedule.closingDay))
  );
}

export function purchaseCycle(
  effectiveOn: string,
  schedule: CycleSchedule,
  dates: ReadonlyMap<string, CycleDates>,
) {
  const period = effectiveOn.slice(0, 7);
  const close = cycleClosingOn(period, schedule, dates.get(period));
  if (!close) return null;
  if (effectiveOn <= close) return period;
  const next = installmentPeriodAt(period, 1);
  return isInstallmentPeriod(next) &&
    cycleClosingOn(next, schedule, dates.get(next))
    ? next
    : null;
}

export function statementStatus({
  period,
  schedule,
  dates,
  statement,
  estimate,
  paid,
  today,
}: {
  period: string;
  schedule: CycleSchedule;
  dates: CycleDates;
  statement: OfficialStatement;
  estimate: string | null;
  paid: string;
  today: string;
}) {
  const closingOn = cycleClosingOn(period, schedule, dates);
  let dueOn = statement.dueOn ?? dates.dueOn;
  let dueSource = statement.dueOn
    ? "official"
    : dates.dueOn
      ? "exception"
      : null;
  if (!dueOn && closingOn && schedule.dueDay !== null) {
    const dueInNextMonth =
      schedule.closingDay === null
        ? calendarDay(period, schedule.dueDay) < closingOn
        : schedule.dueDay < schedule.closingDay;
    const month = dueInNextMonth ? installmentPeriodAt(period, 1) : period;
    if (isInstallmentPeriod(month)) {
      const candidate = calendarDay(month, schedule.dueDay);
      if (candidate >= closingOn) {
        dueOn = candidate;
        dueSource = "estimated";
      }
    }
  }
  const total = statement.officialAmount ?? estimate;
  const difference =
    statement.officialAmount !== null && estimate !== null
      ? decimal(units(statement.officialAmount) - units(estimate))
      : null;
  const balance = total === null ? null : units(total) - units(paid);
  const remaining =
    balance === null
      ? null
      : decimal(balance > BigInt(0) ? balance : BigInt(0));
  const minimumCovered =
    statement.minimumAmount !== null &&
    units(paid) >= units(statement.minimumAmount);
  const daysUntilDue = dueOn
    ? (Date.parse(dueOn) - Date.parse(today)) / 86_400_000
    : null;
  const alert =
    balance !== null &&
    balance > BigInt(0) &&
    daysUntilDue !== null &&
    daysUntilDue <= schedule.leadDays
      ? minimumCovered
        ? ("informative" as const)
        : ("pending" as const)
      : null;
  return {
    closingOn,
    dueOn,
    dueSource,
    remaining,
    difference,
    minimumCovered,
    alert,
  };
}
