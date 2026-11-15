import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import {
  EmptyState,
  FormPanel,
  PageHead,
  PageNotice,
  Screen,
  StateTag,
} from "@/components/glaciar/screen";
import { LoanForm } from "@/components/loan-form";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import { loanDirections, loanFrequencies, type Loan } from "@/domain/loans";
import { listBankBalances } from "@/server/bank-balances";
import { findLoanPerson } from "@/server/catalog";
import { withGoogleOwner } from "@/server/google-auth";
import { listLoans } from "@/server/loans";
import { loansReady } from "@/server/movements";

export const metadata = { title: "Deudas y préstamos | Finanzas personales" };
export const dynamic = "force-dynamic";

const description =
  "Lo que debés y lo que te deben, con el historial de cada obligación.";

function LoanColumn({
  direction,
  loans,
  contacts,
}: {
  direction: Loan["direction"];
  loans: Loan[];
  contacts: Record<string, string>;
}) {
  const icon = direction === "payable" ? "expense" : "income";
  return (
    <section className="lab-panel" aria-labelledby={`columna-${direction}`}>
      <header className="lab-panel__head">
        <h2 id={`columna-${direction}`} className="lab-panel__title">
          <span className={`lab-kind lab-kind--${icon}`} aria-hidden="true">
            <Icon name={icon} duotone={false} className="size-4" />
          </span>
          {loanDirections[direction]}
        </h2>
        <span className="lab-tag lab-tag--neutral">{loans.length}</span>
      </header>
      {loans.length ? (
        <ul className="gs-rows gs-pick">
          {loans.map((loan) => {
            const settled = loan.outstanding === "0.0000";
            const detail = [
              contacts[loan.id],
              loan.dueOn &&
                !settled &&
                `Vence ${formatBankReference(loan.dueOn)}`,
            ].filter(Boolean);
            return (
              <li key={loan.id}>
                <Link href={`/deudas/${loan.id}`} className="gs-row__link">
                  <div className="gs-row__main">
                    <p className="gs-row__title">{loan.concept}</p>
                    {detail.length > 0 && (
                      <p className="gs-row__sub">{detail.join(" · ")}</p>
                    )}
                    {loan.installmentLoan && loan.installmentAmount && (
                      <p className="gs-row__sub">
                        Cuota habitual{" "}
                        {formatBankAmount({
                          currency: loan.currency,
                          amount: loan.installmentAmount,
                        })}
                        {loan.frequency &&
                          ` · ${loanFrequencies[loan.frequency]}`}
                      </p>
                    )}
                  </div>
                  <div className="gs-row__aside">
                    <span className="gs-row__amount">
                      {formatBankAmount({
                        currency: loan.currency,
                        amount: loan.outstanding,
                      })}
                    </span>
                    {loan.needsReconciliation ? (
                      <StateTag tone="warning">
                        Pendiente de conciliación
                      </StateTag>
                    ) : settled ? (
                      <StateTag tone="good">Saldada</StateTag>
                    ) : (
                      <StateTag tone="neutral">Pendiente</StateTag>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="lab-muted py-6 text-center text-sm">
          Todavía no hay registros.
        </p>
      )}
    </section>
  );
}

export default async function LoansPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await loansReady(client)))
        return {
          ok: false,
          tone: "info",
          message:
            "Las deudas estarán disponibles cuando se actualice la base de datos.",
        } as const;
      const loans = await listLoans(client, ownerId);
      const contacts: Record<string, string> = {};
      for (const { id } of loans) {
        const person = await findLoanPerson(client, ownerId, id);
        if (person) contacts[id] = person.name;
      }
      return {
        ok: true,
        loans,
        contacts,
        currencies: (await listBankBalances(client, ownerId)).map(
          ({ currency }) => currency,
        ),
      } as const;
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      ok: false,
      tone: "critical",
      message: "No pudimos cargar tus deudas. Volvé a intentarlo.",
    } as const;
  });

  return (
    <FinanceShell current="deudas">
      <Screen>
        <PageHead
          eyebrow="Crédito"
          title="Deudas y préstamos"
          description={description}
        />
        {result.ok ? (
          <>
            <details className="gs-creator" open={!result.loans.length}>
              <summary className={buttonClass("primary")}>
                <Icon name="plus" duotone={false} className="size-4" />
                Nueva obligación
              </summary>
              <FormPanel
                labelId="form-obligacion"
                title="Nueva obligación"
                description="Registrá un préstamo recibido o entregado, o una deuda que ya existía."
              >
                <LoanForm
                  today={bankReferenceToday()}
                  currencies={result.currencies}
                />
              </FormPanel>
            </details>
            {result.loans.length ? (
              <div className="gs-grid">
                {(["payable", "receivable"] as const).map((direction) => (
                  <div key={direction} className="gs-span-6">
                    <LoanColumn
                      direction={direction}
                      loans={result.loans.filter(
                        (loan) => loan.direction === direction,
                      )}
                      contacts={result.contacts}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="debts" title="Todavía no hay registros">
                Registrá préstamos recibidos o entregados y deudas existentes.
                Los gastos compartidos también crean obligaciones
                automáticamente.
              </EmptyState>
            )}
          </>
        ) : (
          <PageNotice
            tone={result.tone}
            message={result.message}
            retryHref={result.tone === "critical" ? "/deudas" : undefined}
          />
        )}
      </Screen>
    </FinanceShell>
  );
}
