import {
  recurrenceSchedule,
  type RecurrenceDefinition,
} from "./recurrence-definition.ts";
import { latestRecurrencePeriod, recurrencePeriodAt } from "./recurrences.ts";

export type RecurrenceChange =
  | { action: "pause" | "resume"; effectiveIndex: number }
  | { action: "due-day"; effectiveIndex: number; dueDay: number };

export type RecurrencePlan = RecurrenceDefinition & {
  changes?: RecurrenceChange[];
};

export function plannedPeriodAt(series: RecurrencePlan, index: number) {
  const schedule = recurrenceSchedule(series);
  const change = series.changes?.findLast(
    (entry) => entry.action === "due-day" && entry.effectiveIndex <= index,
  );
  if (change?.action === "due-day") schedule.dueDay = change.dueDay;
  return recurrencePeriodAt(schedule, index);
}

export function nextRecurrenceIndex(
  series: RecurrenceDefinition,
  today: string,
) {
  const schedule = recurrenceSchedule(series);
  const current = latestRecurrencePeriod(
    { ...schedule, endDate: null, dueDay: null },
    today,
  );
  return (current?.index ?? -1) + 1;
}

export function latestTrackedIndex(series: RecurrencePlan, today: string) {
  const through =
    series.endDate && series.endDate < today ? series.endDate : today;
  const index = nextRecurrenceIndex(series, through) - 1;
  if (index < 0 || !series.endDate) return index;
  const dueOn = plannedPeriodAt(series, index).dueOn;
  return dueOn && dueOn > series.endDate ? index - 1 : index;
}

export function suppressedByPause(series: RecurrencePlan, index: number) {
  const transition = series.changes?.findLast(
    (entry) => entry.action !== "due-day" && entry.effectiveIndex <= index,
  );
  return transition?.action === "pause" ? transition.effectiveIndex : null;
}

export function followingRecurrenceMonth(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month === 12)
    return year === 9999 ? null : `${year + 1}-01`.padStart(7, "0");
  return `${today.slice(0, 4)}-${String(month + 1).padStart(2, "0")}`;
}
