import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import {
  FormPanel,
  Kpi,
  PageHead,
  PageNotice,
  Screen,
  StateTag,
} from "@/components/glaciar/screen";
import { LoanForm } from "@/components/loan-form";
import { LoanOperationDetail } from "@/components/loan-operation-detail";
import { Icon } from "@/components/ui/icon";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import { loanDirections, loanFrequencies } from "@/domain/loans";
import { movementUuid } from "@/domain/movements";
import { listBankBalances } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import { findLoanPerson } from "@/server/catalog";
import { findLoan, listLoanOperations } from "@/server/loans";
import { sourceExpenseId } from "@/server/shared-expenses";
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
        person: await findLoanPerson(client, ownerId, id),
        expenseId: await sourceExpenseId(client, ownerId, id),
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
    <Link className="gs-back" href="/deudas">
      <Icon name="chevronLeft" duotone={false} className="size-4" />
      Volver a deudas y préstamos
    </Link>
  );
  if ("message" in result)
    return (
      <FinanceShell current="deudas">
        <Screen>
          {back}
          <PageNotice
            tone="critical"
            message={result.message}
            retryHref={`/deudas/${id}`}
          />
        </Screen>
      </FinanceShell>
    );

  const { loan, operations, currencies, expenseId, person } = result;
  const { currency, outstanding, needsReconciliation } = loan;
  const settled = outstanding === "0.0000";
  return (
    <FinanceShell current="deudas">
      <Screen>
        {back}
        <PageHead
          eyebrow={`${loanDirections[loan.direction]} · ${loan.installmentLoan ? "Con cuotas" : "Simple"}`}
          title={loan.concept}
        />
        {needsReconciliation && (
          <section className="lab-panel">
            <div className="b-notice b-notice--warning" role="status">
              <Icon name="alert" className="size-4.5 shrink-0" />
              <p className="font-medium">
                Consultá el saldo real y actualizá el pendiente para conciliar
                los pagos sin desglose.
              </p>
            </div>
          </section>
        )}
        <div className="gs-kpis">
          <Kpi
            hero
            icon="debts"
            label="Importe pendiente"
            value={formatBankAmount({ currency, amount: outstanding })}
            sub={
              loan.accruedInterest !== "0.0000"
                ? `Incluye intereses devengados: ${formatBankAmount({ currency, amount: loan.accruedInterest })}`
                : undefined
            }
          />
          {loan.installmentLoan && (
            <Kpi
              label="Cuota habitual"
              value={
                loan.installmentAmount
                  ? formatBankAmount({
                      currency,
                      amount: loan.installmentAmount,
                    })
                  : "Sin importe registrado"
              }
              sub={loan.frequency ? loanFrequencies[loan.frequency] : undefined}
            />
          )}
          {loan.dueOn && (
            <Kpi
              label="Vencimiento registrado"
              value={formatBankReference(loan.dueOn)}
              sub={
                loan.noticeLeadDays > 0
                  ? `Aviso ${loan.noticeLeadDays} ${loan.noticeLeadDays === 1 ? "día" : "días"} antes`
                  : "Aviso el mismo día"
              }
            />
          )}
          <Kpi
            label="Estado"
            value={
              needsReconciliation ? (
                <StateTag tone="warning">Pendiente de conciliación</StateTag>
              ) : settled ? (
                <StateTag tone="good">Saldada</StateTag>
              ) : (
                <StateTag tone="neutral">Pendiente</StateTag>
              )
            }
          />
        </div>
        <div className="gs-grid">
          <div className="gs-span-7 gs-stack">
            <FormPanel
              labelId="form-operacion"
              title="Registrar operación"
              description="Elegí la acción y revisá qué cambia antes de confirmar."
            >
              <LoanForm
                loan={loan}
                linkedExpense={!!expenseId}
                today={bankReferenceToday()}
                currencies={currencies}
              />
            </FormPanel>
            <section
              className="lab-panel"
              aria-labelledby="historial-obligacion"
            >
              <header className="lab-panel__head">
                <h2 id="historial-obligacion" className="lab-panel__title">
                  <span className="lab-panel__icon">
                    <Icon name="history" className="size-4.5" />
                  </span>
                  Historial de la obligación
                </h2>
                <span className="lab-tag lab-tag--neutral">
                  {operations.length}
                </span>
              </header>
              <ol className="gs-timeline">
                {operations.map((operation) => (
                  <li key={operation.id}>
                    <span
                      className={`gs-timeline__dot ${
                        operation.needsReconciliation ||
                        operation.action === "interest"
                          ? "is-warning"
                          : operation.action === "settle"
                            ? "is-good"
                            : ""
                      }`}
                      aria-hidden="true"
                    />
                    <div className="gs-period">
                      <p className="gs-hint">
                        {formatBankReference(operation.effectiveOn)}
                      </p>
                      <LoanOperationDetail operation={operation} />
                      {operation.note && (
                        <p className="text-sm wrap-anywhere">
                          {operation.note}
                        </p>
                      )}
                      <Link
                        className="justify-self-start text-sm font-medium underline"
                        href={`/historial/movimientos/${operation.id}`}
                      >
                        Ver registro en Historial
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <aside
            className="gs-span-5 gs-sticky lab-panel"
            aria-labelledby="datos-obligacion"
          >
            <header className="lab-panel__head">
              <h2 id="datos-obligacion" className="lab-panel__title">
                <span className="lab-panel__icon">
                  <Icon name="debts" className="size-4.5" />
                </span>
                Datos de la obligación
              </h2>
            </header>
            <dl className="gs-review">
              <div>
                <dt>Contacto</dt>
                <dd>
                  {person ? (
                    <Link
                      className="underline"
                      href={`/catalogo?contact=${person.id}#contacto-${person.id}`}
                    >
                      {person.name}
                    </Link>
                  ) : (
                    "Sin contacto registrado"
                  )}
                </dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{loan.installmentLoan ? "Con cuotas" : "Simple"}</dd>
              </div>
              <div>
                <dt>Moneda</dt>
                <dd>{currency}</dd>
              </div>
              {expenseId && (
                <div>
                  <dt>Origen</dt>
                  <dd>
                    <Link
                      className="underline"
                      href={`/historial/movimientos/${expenseId}`}
                    >
                      Ver gasto de origen
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </Screen>
    </FinanceShell>
  );
}
