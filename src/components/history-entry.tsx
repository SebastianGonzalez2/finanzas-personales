import { formatBankAmount } from "@/domain/bank-balances";
import type { HistoryEntry } from "@/domain/history";

export function HistoryAmount({ entry }: { entry: HistoryEntry }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 tabular-nums">
      <span>{formatBankAmount(entry)}</span>
      {entry.otherCurrency && entry.otherAmount && (
        <>
          <span aria-hidden="true">→</span>
          <span className="sr-only">cambiados por</span>
          <span>
            {formatBankAmount({
              currency: entry.otherCurrency,
              amount: entry.otherAmount,
            })}
          </span>
        </>
      )}
    </span>
  );
}
