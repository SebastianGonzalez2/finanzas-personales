import { formatBankAmount } from "@/domain/bank-balances";
import type { CreditHistoryLine } from "@/domain/credit-operations";
import { formatInstallmentPeriod } from "@/domain/installments";

export function CreditHistoryDetail({
  lines,
  payment,
  installmentPurchase,
}: {
  lines: (CreditHistoryLine & { card: string; effectiveRate: string | null })[];
  payment: boolean;
  installmentPurchase: boolean;
}) {
  return (
    <section className="grid gap-3 border-t pt-4">
      <h2 className="font-semibold">Tarjeta · {lines[0].card}</h2>
      <ul className="grid gap-3">
        {lines.map((line) => (
          <li
            key={line.currency}
            className="min-w-0 rounded-lg border p-3 text-sm wrap-anywhere"
          >
            <p className="font-semibold">{line.currency}</p>
            {payment ? (
              <>
                <p>Deuda cancelada · {formatBankAmount(line)}</p>
                {line.statementPeriod && (
                  <p>
                    Ciclo de resumen ·{" "}
                    {formatInstallmentPeriod(line.statementPeriod)}
                  </p>
                )}
                {line.bankCurrency && line.bankAmount && (
                  <p>
                    Salida de Bancos ·{" "}
                    {formatBankAmount({
                      currency: line.bankCurrency,
                      amount: line.bankAmount,
                    })}
                    {/[1-9]/.test(line.fee) &&
                      ` + ${formatBankAmount({ currency: line.bankCurrency, amount: line.fee })} de comisión bancaria`}
                  </p>
                )}
                {line.effectiveRate && (
                  <p>
                    Tasa efectiva aproximada ·{" "}
                    {line.effectiveRate.replace(".", ",")} {line.bankCurrency}{" "}
                    por {line.currency}
                  </p>
                )}
                {line.allocations.length > 0 && (
                  <ul
                    aria-label="Asignaciones a compras"
                    className="my-2 list-disc ps-5"
                  >
                    {line.allocations.map(({ purchaseId, concept, amount }) => (
                      <li key={purchaseId}>
                        <a
                          className="underline"
                          href={`/historial/movimientos/${purchaseId}`}
                        >
                          {concept}
                        </a>{" "}
                        ·{" "}
                        {formatBankAmount({ currency: line.currency, amount })}
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  {/[1-9]/.test(line.debtAfter)
                    ? "Pago parcial"
                    : "Deuda saldada"}{" "}
                  según los registros al confirmar.
                </p>
              </>
            ) : (
              <>
                {installmentPurchase && (
                  <p>
                    {/[1-9]/.test(line.amount)
                      ? `Cargo confirmado por el emisor · ${formatBankAmount(line)}`
                      : "Sin cargo del emisor informado al registrar la compra."}
                  </p>
                )}
                <p>
                  Variación de deuda ·{" "}
                  {formatBankAmount({
                    currency: line.currency,
                    amount: line.debtDelta,
                  })}
                </p>
              </>
            )}
            <p>
              Deuda registrada después de guardar ·{" "}
              {formatBankAmount({
                currency: line.currency,
                amount: line.debtAfter,
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
