import { formatBankAmount } from "@/domain/bank-balances";
import type { HistoryEntry } from "@/domain/history";

export function HistoryAmount({ entry }: { entry: HistoryEntry }) {
  if (entry.cardAmounts)
    return (
      <span className="flex flex-wrap gap-x-3 tabular-nums">
        {entry.cardAmounts.map((line) => (
          <span key={line.currency}>{formatBankAmount(line)}</span>
        ))}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-x-2 tabular-nums">
      <span>
        {entry.kind === "loan_operation" && entry.otherCurrency && "Acuerdo "}
        {formatBankAmount(entry)}
      </span>
      {entry.otherCurrency && entry.otherAmount && (
        <>
          {entry.kind !== "loan_operation" && (
            <>
              <span aria-hidden="true">→</span>
              <span className="sr-only">cambiados por</span>
            </>
          )}
          <span>
            {entry.kind === "loan_operation" && "· Bancos "}
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
