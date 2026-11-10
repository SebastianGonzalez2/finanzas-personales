import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { historyButton } from "@/components/history-fields";
import { LoanForm } from "@/components/loan-form";
import { LoanOperationDetail } from "@/components/loan-operation-detail";
import { Card } from "@/components/ui/card";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import { loanDirections, loanFrequencies } from "@/domain/loans";
import { movementUuid } from "@/domain/movements";
import { listBankBalances } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import { findLoan, listLoanOperations } from "@/server/loans";
import { loansReady } from "@/server/movements";

export const metadata = {
  title: "Detalle de obligación | Finanzas personales",
};
export const dynamic = "force-dynamic";

export default async function LoanPage({ params }: PageProps<"/deudas/[id]">) {
  const { id } = await params;
  if (!movementUuid.test(id)) notFound();
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await loansReady(client))) return null;
      const loan = await findLoan(client, ownerId, id);
      if (!loan) return null;
      return {
        loan,
        operations: await listLoanOperations(client, ownerId, { loanId: id }),
        currencies:
          loan.outstanding === "0.0000"
            ? []
            : (await listBankBalances(client, ownerId)).map(
                ({ currency }) => currency,
              ),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { message: "No pudimos cargar la obligación. Volvé a intentarlo." };
  });
  if (!result) notFound();
  const back = (
    <Link className={historyButton} href="/deudas">
      Volver a deudas y préstamos
    </Link>
  );
  if ("message" in result)
    return (
      <FinanceShell current="deudas">
        <div>{back}</div>
        <p role="status">{result.message}</p>
      </FinanceShell>
    );

  const { loan, operations, currencies } = result;
  const { currency, outstanding, needsReconciliation } = loan;
  return (
    <FinanceShell current="deudas">
      <div className="grid max-w-3xl gap-4">
        <div>{back}</div>
        <Card className="gap-3 p-4 sm:p-5">
          <header>
            <p className="text-sm text-muted-foreground">
              {loanDirections[loan.direction]} ·{" "}
              {loan.installmentLoan ? "Con cuotas" : "Simple"}
            </p>
            <h1
              id="titulo-pagina"
              tabIndex={-1}
              className="mt-1 text-2xl font-semibold wrap-anywhere"
            >
              {loan.concept}
            </h1>
          </header>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">
                Importe pendiente
              </dt>
              <dd className="font-semibold wrap-anywhere">
                {formatBankAmount({ currency, amount: outstanding })}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Estado</dt>
              <dd>
                {needsReconciliation
                  ? "Pendiente de conciliación"
                  : outstanding === "0.0000"
                    ? "Saldada"
                    : "Pendiente"}
              </dd>
            </div>
            {loan.accruedInterest !== "0.0000" && (
              <div>
                <dt className="text-sm text-muted-foreground">
                  Intereses devengados incluidos
                </dt>
                <dd>
                  {formatBankAmount({ currency, amount: loan.accruedInterest })}
                </dd>
              </div>
            )}
            {loan.installmentLoan && (
              <div>
                <dt className="text-sm text-muted-foreground">
                  Cuota habitual
                </dt>
                <dd>
                  {loan.installmentAmount
                    ? formatBankAmount({
                        currency,
                        amount: loan.installmentAmount,
                      })
                    : "Sin importe registrado"}
                  {loan.frequency && ` · ${loanFrequencies[loan.frequency]}`}
                </dd>
              </div>
            )}
            {loan.dueOn && (
              <div>
                <dt className="text-sm text-muted-foreground">
                  Vencimiento registrado
                </dt>
                <dd>{formatBankReference(loan.dueOn)}</dd>
              </div>
            )}
          </dl>
          {needsReconciliation && (
            <p className="text-sm">
              Consultá el saldo real y actualizá el pendiente para conciliar los
              pagos sin desglose.
            </p>
          )}
        </Card>
        <Card className="gap-4 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Registrar operación</h2>
          <LoanForm
            loan={loan}
            today={bankReferenceToday()}
            currencies={currencies}
          />
        </Card>
        <Card className="gap-4 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Historial de la obligación</h2>
          <ol className="grid gap-3">
            {operations.map((operation) => (
              <li key={operation.id} className="grid gap-1 border-t pt-3">
                <p className="text-sm text-muted-foreground">
                  {formatBankReference(operation.effectiveOn)}
                </p>
                <LoanOperationDetail operation={operation} />
                {operation.note && (
                  <p className="text-sm wrap-anywhere">{operation.note}</p>
                )}
                <Link
                  className="justify-self-start text-sm font-medium underline"
                  href={`/historial/movimientos/${operation.id}`}
                >
                  Ver registro en Historial
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </FinanceShell>
  );
}
