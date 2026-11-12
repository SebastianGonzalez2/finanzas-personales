import "server-only";
import { fxKey, sumFx, type FxQuote } from "../domain/exchange-rates.ts";
import type { Currency } from "../domain/money.ts";
import type { StatisticsPosition } from "../domain/statistics.ts";

const amounts = [
  "bank",
  "reserved",
  "available",
  "cardDebt",
  "loanDebt",
  "receivables",
  "cardCredit",
  "netWorth",
] as const;

export function positionKeys(positions: StatisticsPosition[]) {
  return positions
    .filter((row) =>
      amounts.some((field) => row[field] !== null && /[1-9]/.test(row[field])),
    )
    .map(({ date, currency }) => ({ date, base: currency }));
}

export function consolidatePositions(
  positions: StatisticsPosition[],
  quotes: Map<string, FxQuote>,
  target: Currency,
): StatisticsPosition[] {
  const dates = Map.groupBy(positions, ({ date }) => date);
  return [...dates].map(([date, rows]) => {
    const total = (field: (typeof amounts)[number]) => {
      const values = rows.map((row) => ({
        amount: row[field],
        rate:
          row.currency === target
            ? "1"
            : quotes.get(fxKey({ date, base: row.currency }))?.rate,
      }));
      return sumFx(values);
    };
    const bank = total("bank");
    return {
      date,
      currency: target,
      bank,
      bankStatus:
        bank === null
          ? "unknown"
          : rows.every(({ bankStatus }) => bankStatus === "confirmed")
            ? "confirmed"
            : "calculated",
      adjustment: rows.some(({ adjustment }) => adjustment),
      reserved: total("reserved") ?? "0",
      available: total("available"),
      cardDebt: total("cardDebt") ?? "0",
      loanDebt: total("loanDebt") ?? "0",
      receivables: total("receivables") ?? "0",
      cardCredit: total("cardCredit") ?? "0",
      netWorth: total("netWorth"),
    };
  });
}
