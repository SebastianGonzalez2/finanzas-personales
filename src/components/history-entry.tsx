import { formatBankAmount } from "@/domain/bank-balances";
import type { HistoryEntry, HistoryKind } from "@/domain/history";

// M-06: tono visual del importe según el tipo de movimiento (no su signo).
// Solo presentación: entradas en verde, salidas en rojo; cambios de moneda,
// deudas, préstamos y ajustes quedan neutros. Un pago de tarjeta es salida
// bancaria, pero no se contabiliza como gasto (eso no cambia aquí).
export type AmountTone = "positive" | "negative";
export const historyAmountTones: Partial<Record<HistoryKind, AmountTone>> = {
  income: "positive",
  purchase_refund: "positive",
  card_credit_return: "positive",
  bank_benefit: "positive",
  expense: "negative",
  card_purchase: "negative",
  card_payment: "negative",
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
