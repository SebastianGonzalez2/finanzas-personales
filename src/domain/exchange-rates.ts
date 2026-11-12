import { bankCurrencies, isBankReferenceDate } from "./bank-balances.ts";
import type { Currency } from "./money.ts";

export type FxKey = { date: string; base: Currency };
export type FxSource = "datosuruguay" | "frankfurter" | "manual";
export type FxQuote = FxKey & {
  target: Currency;
  observed: string;
  source: FxSource;
  rate: string;
};

export function isCurrency(value: unknown): value is Currency {
  return bankCurrencies.some((currency) => currency === value);
}

export function fxKey({ date, base }: FxKey) {
  return `${date}/${base}`;
}

export function parseFxRate(value: unknown) {
  if (typeof value !== "string") return null;
  const rate = value.trim().replace(",", ".");
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,18})?$/.test(rate) || !/[1-9]/.test(rate))
    return null;
  return rate.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function parseManualFx(
  input: Record<string, unknown>,
  today: string,
): (FxKey & { target: Currency; rate: string }) | null {
  if (Object.keys(input).length !== 4) return null;
  const { date, base, target } = input;
  const rate = parseFxRate(input.rate);
  return isBankReferenceDate(date, today) &&
    isCurrency(base) &&
    isCurrency(target) &&
    base !== target &&
    rate
    ? { date, base, target, rate }
    : null;
}

export function fxSourceName(source: FxSource) {
  if (source === "manual") return "Tasa manual";
  return source === "datosuruguay"
    ? "datosUruguay (BCU)"
    : "Frankfurter (respaldo)";
}

function decimalUnits(value: string, scale: number) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

// Multiply in integer units and round once, after summing (half away from zero).
export function sumFx(
  values: { amount: string | null; rate: string | undefined }[],
) {
  const rateScale = BigInt("1000000000000000000");
  const amountScale = BigInt(10000);
  const zero = BigInt(0);
  let total = zero;
  for (const { amount, rate } of values) {
    if (amount === null) return null;
    const units = decimalUnits(amount, 4);
    if (units === zero) continue;
    if (!rate) return null;
    total += units * decimalUnits(rate, 18);
  }
  const absolute = total < zero ? -total : total;
  const rounded = (absolute + rateScale / BigInt(2)) / rateScale;
  return `${total < zero && rounded !== zero ? "-" : ""}${rounded / amountScale}.${(rounded % amountScale).toString().padStart(4, "0")}`;
}
