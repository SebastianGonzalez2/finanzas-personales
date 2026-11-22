import { formatBankAmount } from "@/domain/bank-balances";
import type { HistoryEntry, HistoryKind } from "@/domain/history";

// Tono visual del importe: los gastos se muestran en rojo (solo presentación).
export type AmountTone = "positive" | "negative";
export const historyAmountTones: Partial<Record<HistoryKind, AmountTone>> = {
  expense: "negative",
  card_purchase: "negative",
};

export function HistoryAmount({ entry }: { entry: HistoryEntry }) {
  const tone = historyAmountTones[entry.kind];
  const toneClass = tone ? ` is-${tone}` : "";
  if (entry.cardAmounts)
    return (
      <span
        className={`flex flex-wrap gap-x-3 tabular-nums amount-tone${toneClass}`}
      >
        {entry.cardAmounts.map((line) => (
          <span key={line.currency}>{formatBankAmount(line)}</span>
        ))}
      </span>
    );
  return (
    <span
      className={`flex flex-wrap items-center gap-x-2 tabular-nums amount-tone${toneClass}`}
    >
      <span>{formatBankAmount(entry)}</span>
    </span>
  );
}
