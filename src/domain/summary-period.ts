import { installmentPeriodAt, isInstallmentPeriod } from "./installments.ts";
import { daysInRecurrenceMonth } from "./recurrences.ts";
import { statisticsMonthLabel } from "./statistics.ts";

export function summaryMonthEnd(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${period}-${daysInRecurrenceMonth(year, month)}`;
}

export function summaryPeriods(period: string, today: string) {
  const current = today.slice(0, 7);
  const anchor = period > current ? current : period;
  const months = Array.from({ length: 6 }, (_, index) =>
    installmentPeriodAt(anchor, index - 5),
  ).filter(isInstallmentPeriod);
  const range = (month: string, to: string) => ({
    from: `${month}-01`,
    to,
    label: statisticsMonthLabel(month),
    complete: to === summaryMonthEnd(month),
  });
  const to = anchor === current ? today : summaryMonthEnd(anchor);
  const selected = period > current ? null : range(period, to);
  const previous = installmentPeriodAt(period, -1);
  let comparison = null;
  if (selected && isInstallmentPeriod(previous)) {
    const lastDay = summaryMonthEnd(previous);
    const sameDay = `${previous}-${today.slice(-2)}`;
    if (selected.complete || sameDay <= lastDay)
      comparison = range(previous, selected.complete ? lastDay : sameDay);
  }
  return {
    months,
    selected,
    comparison,
    history: { ...range(anchor, to), from: `${months[0]}-01` },
  };
}
