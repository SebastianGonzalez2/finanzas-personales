import { normalizeDecimalAmount, type Currency } from "./money.ts";

export type FundPortion = { fundId: string; amount: string };
export type FundSource = {
  id: string;
  name: string;
  currency: Currency;
  availableAmount: string;
  committedAmount: string;
};
export type FundUse = FundPortion & {
  name: string;
  currency: Currency;
  purpose: "expense" | "commitment" | "payment";
  purchaseId: string | null;
  purchaseConcept: string | null;
};

export function coverageUnits(amount: string) {
  const [whole, fraction = ""] = amount.replace(/^-/, "").split(".");
  return (
    (BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"))) *
    (amount.startsWith("-") ? -BigInt(1) : BigInt(1))
  );
}

export function coverageDecimal(units: bigint) {
  const value = units < BigInt(0) ? -units : units;
  return (
    (units < BigInt(0) ? "-" : "") +
    value / BigInt(10000) +
    "." +
    (value % BigInt(10000)).toString().padStart(4, "0")
  );
}

export function coverageSum(portions: readonly FundPortion[]) {
  return portions.reduce(
    (sum, part) => sum + coverageUnits(part.amount),
    BigInt(0),
  );
}

export const fundPortionsError =
  "Revisá los fondos elegidos y sus importes. Usá hasta cuatro decimales.";

export function parseFundPortions(input: unknown, max = 20): FundPortion[] {
  if (!Array.isArray(input) || input.length > max)
    throw new Error(fundPortionsError);
  const used = new Set<string>();
  return input
    .map((part: unknown) => {
      if (
        !part ||
        typeof part !== "object" ||
        Array.isArray(part) ||
        Object.keys(part).length !== 2 ||
        !("fundId" in part) ||
        !("amount" in part) ||
        typeof part.fundId !== "string" ||
        typeof part.amount !== "string" ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
          part.fundId,
        )
      )
        throw new Error(fundPortionsError);
      const fundId = part.fundId.toLowerCase();
      const amount = normalizeDecimalAmount(
        part.amount.trim().replace(",", "."),
      );
      if (used.has(fundId) || coverageUnits(amount) <= BigInt(0))
        throw new Error(fundPortionsError);
      used.add(fundId);
      return { fundId, amount };
    })
    .sort((a, b) => a.fundId.localeCompare(b.fundId));
}
