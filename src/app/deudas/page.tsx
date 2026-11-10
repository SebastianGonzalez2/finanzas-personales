import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { LoanForm } from "@/components/loan-form";
import { Card } from "@/components/ui/card";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import { loanDirections } from "@/domain/loans";
import { listBankBalances } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import { listLoans } from "@/server/loans";
import { loansReady } from "@/server/movements";

export const metadata = { title: "Deudas y préstamos | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) =>
      (await loansReady(client))
        ? {
            loans: await listLoans(client, ownerId),
            currencies: (await listBankBalances(client, ownerId)).map(
              ({ currency }) => currency,
            ),
          }
        : {
            message:
              "Las deudas estarán disponibles cuando se actualice la base de datos.",
          },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { message: "No pudimos cargar tus deudas. Volvé a intentarlo." };
  });

  return (
    <FinanceShell current="deudas">
      <div className="grid gap-4">
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Deudas y préstamos
        </h1>
        {"loans" in result && result.loans ? (
          <>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {(["payable", "receivable"] as const).map((direction) => {
                const loans = result.loans.filter(
                  (loan) => loan.direction === direction,
                );
                return (
                  <Card key={direction} className="gap-3 p-4">
                    <h2 className="text-lg font-semibold">
                      {loanDirections[direction]}
                    </h2>
                    {loans.length ? (
                      <ul className="grid gap-2">
                        {loans.map((loan) => (
                          <li key={loan.id}>
                            <Link
                              href={`/deudas/${loan.id}`}
                              className="grid gap-1 rounded-lg border p-3 hover:bg-muted wrap-anywhere"
                            >
                              <span className="font-medium">
                                {loan.concept}
                              </span>
                              <span className="text-sm">
                                {formatBankAmount({
                                  currency: loan.currency,
                                  amount: loan.outstanding,
                                })}{" "}
                                ·{" "}
                                {loan.needsReconciliation
                                  ? "Pendiente de conciliación"
                                  : loan.outstanding === "0.0000"
                                    ? "Saldada"
                                    : "Pendiente"}
                              </span>
                              {loan.dueOn && loan.outstanding !== "0.0000" && (
                                <span className="text-sm text-muted-foreground">
                                  Vencimiento registrado ·{" "}
                                  {formatBankReference(loan.dueOn)}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Todavía no hay registros.
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
            <Card className="max-w-2xl gap-4 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Nueva obligación</h2>
              <LoanForm
                today={bankReferenceToday()}
                currencies={result.currencies}
              />
            </Card>
          </>
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
