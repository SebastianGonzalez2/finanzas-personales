import Link from "next/link";
import { formatBankAmount } from "@/domain/bank-balances";
import { loanActionLabel, type LoanOperation } from "@/domain/loans";
import { Money } from "@/domain/money";

export function LoanOperationDetail({
  operation,
  linkToLoan = false,
}: {
  operation: LoanOperation;
  linkToLoan?: boolean;
}) {
  const {
    action,
    direction,
    currency,
    bankDelta,
    outstanding,
    previousOutstanding,
    principalPaid,
    accruedPaid,
    expense,
    accruedInterest,
  } = operation;
  const show = (amount: string) => formatBankAmount({ currency, amount });
  const zero = "0.0000";
  const capital = Money.parse(outstanding, currency)
    .add(Money.parse(accruedInterest, currency).negate())
    .toDecimal();
  return (
    <div className="grid gap-1 text-sm wrap-anywhere">
      <p className="font-medium">{loanActionLabel(action, direction)}</p>
      {bankDelta && (
        <p>
          Bancos {bankDelta.startsWith("-") ? "−" : "+"}
          {show(bankDelta.replace("-", ""))}
        </p>
      )}
      {action === "settle" &&
        (principalPaid === null ? (
          <p>
            Pago sin desglose. Pendiente de conciliación al registrar el pago.
          </p>
        ) : (
          <p>
            {direction === "payable"
              ? "Capital aplicado"
              : "Aplicado al saldo acordado"}{" "}
            · {show(principalPaid)}
          </p>
        ))}
      {accruedPaid !== zero && (
        <p>Intereses ya registrados abonados · {show(accruedPaid)}</p>
      )}
      {expense !== zero && <p>Gasto financiero registrado · {show(expense)}</p>}
      <p>
        Pendiente{" "}
        {previousOutstanding !== null && <>{show(previousOutstanding)} → </>}
        {show(outstanding)}
      </p>
      {accruedInterest !== zero && (
        <p>
          Capital {show(capital)} · Interés devengado pendiente{" "}
          {show(accruedInterest)}
        </p>
      )}
      {linkToLoan && (
        <Link
          className="font-medium underline"
          href={`/deudas/${operation.loanId}`}
        >
          Ver obligación e historial
        </Link>
      )}
    </div>
  );
}
