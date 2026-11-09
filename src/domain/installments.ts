import { formatBankAmount } from "./bank-balances.ts";
import { Money, type Currency } from "./money.ts";

export const maxInstallments = 120;

export type InstallmentTerms = {
  installmentAmount: string;
  count: number;
  firstPeriod: string;
};

export type InstallmentVersion = InstallmentTerms & {
  version: number;
  activeCount: number;
  change: "created" | "edited" | "cancelled";
  recordedOn: string;
};

export type InstallmentSummary = InstallmentVersion & {
  id: string;
  cardId: string;
  concept: string;
  currency: Currency;
};

export type MonthlyInstallment = {
  id: string;
  concept: string;
  ordinal: number;
  currency: Currency;
  amount: string;
  category: string | null;
};

export function isInstallmentPeriod(value: unknown): value is string {
  return (
    typeof value === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)
  );
}

export function installmentPeriodAt(firstPeriod: string, offset: number) {
  const [year, month] = firstPeriod.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function installmentCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 2 &&
    value <= maxInstallments
  );
}

export function installmentTotal(
  terms: InstallmentTerms,
  currency: Currency,
  count = terms.count,
) {
  return Money.parse(terms.installmentAmount, currency)
    .multiply(BigInt(count))
    .toDecimal();
}

export function formatInstallmentTotal(
  terms: InstallmentTerms,
  currency: Currency,
  count = terms.count,
) {
  return formatBankAmount({
    currency,
    amount: installmentTotal(terms, currency, count),
  });
}

const periodLabel = new Intl.DateTimeFormat("es-UY", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatInstallmentPeriod(period: string) {
  return periodLabel.format(new Date(`${period}-01T12:00:00Z`));
}

export function futureInstallmentPeriods(
  plan: InstallmentVersion,
  today: string,
) {
  return Array.from({ length: plan.activeCount }, (_, index) =>
    installmentPeriodAt(plan.firstPeriod, index),
  ).filter((period) => period > today.slice(0, 7));
}
