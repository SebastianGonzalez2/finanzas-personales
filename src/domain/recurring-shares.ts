import { coverageDecimal, coverageUnits } from "./fund-coverage.ts";
import { normalizeDecimalAmount } from "./money.ts";
import { movementUuid } from "./movements.ts";
import { maxFriends, sharedPersonName } from "./shared-expenses.ts";

export type Person = { id: string; name: string };
export type UsualShare = Person & { percentage: string };
export type ShareInput = { percentage: string } & (
  { personId: string } | { name: string }
);

const whole = BigInt(1000000);

export function parseUsualShares(value: unknown): ShareInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxFriends)
    throw new Error();
  const shares = value.map((item: unknown): ShareInput => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error();
    const { personId, name, percentage } = item as Record<string, unknown>;
    if (
      Object.keys(item).some(
        (key) => !["personId", "name", "percentage"].includes(key),
      )
    )
      throw new Error();
    const exact = normalizeDecimalAmount(
      typeof percentage === "string"
        ? percentage.trim().replace(",", ".")
        : percentage,
    );
    if (coverageUnits(exact) <= BigInt(0)) throw new Error();
    if (
      name === undefined &&
      typeof personId === "string" &&
      movementUuid.test(personId)
    )
      return { personId: personId.toLowerCase(), percentage: exact };
    if (personId === undefined)
      return { name: sharedPersonName(name), percentage: exact };
    throw new Error();
  });
  if (
    shares.reduce(
      (sum, share) => sum + coverageUnits(share.percentage),
      BigInt(0),
    ) > whole
  )
    throw new Error();
  return shares;
}

// Assign any residual 0.0001 units by largest remainder, with ties in display
// order, so even a fully shared payment retains its exact total.
export function suggestShares(amount: string, shares: UsualShare[]) {
  try {
    const total = coverageUnits(
      normalizeDecimalAmount(amount.trim().replace(",", ".")),
    );
    if (total <= BigInt(0)) return null;
    const percentages = shares.map(({ percentage }) =>
      coverageUnits(percentage),
    );
    const own =
      whole - percentages.reduce((sum, percent) => sum + percent, BigInt(0));
    const parts = [own, ...percentages].map((percent, index) => {
      const numerator = total * percent;
      return { index, units: numerator / whole, remainder: numerator % whole };
    });
    let remaining =
      total - parts.reduce((sum, part) => sum + part.units, BigInt(0));
    const ranked = [...parts].sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
    for (const part of ranked) {
      if (remaining === BigInt(0)) break;
      part.units += BigInt(1);
      remaining -= BigInt(1);
    }
    return parts.map(({ units }) => coverageDecimal(units));
  } catch {
    return null;
  }
}
