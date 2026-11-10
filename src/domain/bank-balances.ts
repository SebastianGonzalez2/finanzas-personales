import { Money, type Currency } from "./money.ts";

export const bankCurrencies = ["UYU", "USD", "EUR"] as const;

export type BankBalance = {
  currency: Currency;
  amount: string;
  asOfDate: string;
  calculatedAmount?: string;
};

export type BankAvailability = BankBalance & {
  reservedAmount: string;
  availableAmount: string;
};

export const adjustmentNoteLimit = 500;

export type BalanceAdjustment = Omit<BankBalance, "calculatedAmount"> & {
  idempotencyKey: string;
  note: string | null;
};

export type BankCheckpoint = Omit<BankBalance, "calculatedAmount"> & {
  id: string;
  note: string | null;
  originalProjection: string | null;
  originalDifference: string | null;
  projection: string | null;
  difference: string | null;
  projectionChanged: boolean;
};

const montevideoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function bankReferenceToday(now = new Date()): string {
  const parts = montevideoDate.formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isBankReferenceDate(
  value: unknown,
  today: string,
): value is string {
  if (
    typeof value !== "string" ||
    value.length !== 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000") ||
    value > today
  )
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

export function parseOpeningBalance(
  input: unknown,
  today: string,
): BankBalance | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Solicitud inválida." };
  if (
    Object.keys(input).some(
      (key) => !["currency", "amount", "asOfDate"].includes(key),
    )
  )
    return { error: "Solicitud inválida." };
  const { currency, amount, asOfDate } = input as Record<string, unknown>;
  if (currency !== "UYU" && currency !== "USD" && currency !== "EUR")
    return { error: "Elegí una moneda válida." };

  let money: Money;
  try {
    money = Money.parse(
      typeof amount === "string" ? amount.trim().replace(",", ".") : amount,
      currency,
    );
  } catch {
    return {
      error:
        "Ingresá un importe sin separador de miles y con hasta 4 decimales.",
    };
  }

  if (!isBankReferenceDate(asOfDate, today))
    return { error: "Ingresá una fecha válida que no sea posterior a hoy." };

  return { currency, amount: money.toDecimal(), asOfDate };
}

export function parseBalanceAdjustment(
  input: unknown,
  today: string,
): BalanceAdjustment | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Solicitud inválida." };
  const { idempotencyKey, note, ...fields } = input as Record<string, unknown>;
  if (
    typeof idempotencyKey !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      idempotencyKey,
    )
  )
    return { error: "Solicitud inválida." };
  if (
    note != null &&
    (typeof note !== "string" ||
      note.length > adjustmentNoteLimit ||
      note.includes("\0"))
  )
    return { error: "Ingresá una nota válida de hasta 500 caracteres." };

  const balance = parseOpeningBalance(fields, today);
  if ("error" in balance) return balance;
  return {
    currency: balance.currency,
    amount: balance.amount,
    asOfDate: balance.asOfDate,
    idempotencyKey: idempotencyKey.toLowerCase(),
    note: (typeof note === "string" && note.trim()) || null,
  };
}

const wholeAmount = new Intl.NumberFormat("es-UY", { useGrouping: "always" });

export function formatBankAmount(
  balance: Pick<BankBalance, "amount" | "currency">,
): string {
  const [whole, fraction] = balance.amount.split(".");
  const negative = whole.startsWith("-");
  const grouped = wholeAmount.format(BigInt(negative ? whole.slice(1) : whole));
  const decimals = (fraction ?? "").replace(/0+$/, "").padEnd(2, "0");
  return `${negative ? "−" : ""}${grouped},${decimals} ${balance.currency}`;
}

export function formatBankReference(asOfDate: string): string {
  return asOfDate.split("-").reverse().join("/");
}
