import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { CreditHistoryDetail } from "@/components/credit-history-detail";
import { CreditVoidForm } from "@/components/credit-void-form";
import { MixedPurchaseEditor } from "@/components/mixed-purchase-editor";
import { HistoryEditor } from "@/components/history-editor";
import { LoanOperationDetail } from "@/components/loan-operation-detail";
import { InstallmentEditor } from "@/components/installment-editor";
import { InstallmentHistory } from "@/components/installment-history";
import { HistoryAmount } from "@/components/history-entry";
import { historyButton } from "@/components/history-fields";
import { Card } from "@/components/ui/card";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import {
  historyKinds,
  historySearch,
  historyStates,
  parseHistoryParams,
} from "@/domain/history";
import { movementDisplayMethods, movementUuid } from "@/domain/movements";
import { installmentTotal } from "@/domain/installments";
import { withGoogleOwner } from "@/server/google-auth";
import {
  installmentsReady,
  listInstallmentVersions,
} from "@/server/installments";
import {
  creditHistoryDetail,
  findHistoryEntry,
  historyRevisions,
  listHistoryCurrencies,
} from "@/server/history";
import { historyReady, listMovementCategories } from "@/server/movements";
import { listCards } from "@/server/cards";
import { mixedPurchaseDetail } from "@/server/mixed-purchases";
import { listLoanOperations } from "@/server/loans";

export const metadata = { title: "Detalle del registro | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function HistoryDetail({
  params,
  searchParams,
}: PageProps<"/historial/[source]/[id]">) {
  const { source, id } = await params;
  const query = parseHistoryParams(await searchParams);
  const search =
    "error" in query ? "" : historySearch(query.filters, query.cursor);
  const checkpoint = source === "saldos";
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (
        (!checkpoint && source !== "movimientos") ||
        !movementUuid.test(id) ||
        !(await historyReady(client))
      )
        return null;
      const entry = await findHistoryEntry(client, ownerId, id, checkpoint);
      if (!entry) return null;
      const revisions = checkpoint
        ? []
        : await historyRevisions(client, ownerId, id);
      const cardLines = entry.cardAmounts
        ? await creditHistoryDetail(client, ownerId, id)
        : [];
      const loan =
        entry.kind === "loan_operation"
          ? (await listLoanOperations(client, ownerId, { eventId: id }))[0]
          : undefined;
      const plans =
        entry.kind === "card_purchase" && (await installmentsReady(client))
          ? await listInstallmentVersions(client, ownerId, id)
          : [];
      const mixed =
        entry.method === "mixed"
          ? await mixedPurchaseDetail(client, ownerId, id)
          : undefined;
      const mixedEditable =
        !!mixed &&
        entry.status === "confirmed" &&
        (!plans[0] || plans[0].count === plans[0].activeCount);
      const mixedCards = mixedEditable
        ? (await listCards(client, ownerId)).filter(
            ({ id, archived }) =>
              !archived ||
              id === mixed.creditCardId ||
              id === mixed.debitCardId,
          )
        : [];
      const editable =
        !checkpoint &&
        !entry.cardAmounts &&
        !loan &&
        entry.status === "confirmed";
      const categories =
        (editable && entry.kind !== "bank_transfer") || mixedEditable
          ? (await listMovementCategories(client, ownerId)).filter(
              ({ kind }) => kind === (mixedEditable ? "expense" : entry.kind),
            )
          : [];
      const currencies =
        editable || mixedEditable
          ? await listHistoryCurrencies(client, ownerId)
          : [];
      return {
        entry,
        revisions,
        editable,
        categories,
        currencies,
        cardLines,
        plans,
        mixed,
        mixedCards,
        loan,
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { unavailable: true } as const;
  });

  if (!data) notFound();
  const back = (
    <a href={`/historial${search}#resultados`} className={historyButton}>
      Volver al historial
    </a>
  );
  if ("unavailable" in data)
    return (
      <FinanceShell current="historial">
        <Card className="items-start p-4">
          <p role="status">No pudimos cargar el registro.</p>
          {back}
        </Card>
      </FinanceShell>
    );

  const {
    entry,
    revisions,
    editable,
    categories,
    currencies,
    cardLines,
    plans,
    mixed,
    mixedCards,
    loan,
  } = data;
  const today = bankReferenceToday();
  const plan = plans[0];
  const credit = cardLines[0];
  const mixedCreditCards = mixedCards.filter(({ kind }) => kind === "credit");
  return (
    <FinanceShell current="historial">
      <div className="grid max-w-3xl gap-4">
        <div>{back}</div>
        <Card className="gap-4 p-4 sm:p-5">
          <header>
            <p className="text-sm text-muted-foreground">
              {historyKinds[entry.kind]} · {historyStates[entry.status]}
            </p>
            <h1
              id="titulo-pagina"
              tabIndex={-1}
              className="mt-1 text-2xl font-semibold wrap-anywhere"
            >
              {entry.concept}
            </h1>
          </header>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Fecha</dt>
              <dd>{formatBankReference(entry.effectiveOn)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {entry.kind === "bank_transfer"
                  ? "Entregado → Recibido"
                  : mixed
                    ? "Total de la compra"
                    : plan
                      ? "Total financiado"
                      : "Importe"}
              </dt>
              <dd>
                <HistoryAmount entry={entry} />
              </dd>
            </div>
            {entry.method && (
              <>
                <div>
                  <dt className="text-sm text-muted-foreground">Medio</dt>
                  <dd>{movementDisplayMethods[entry.method]}</dd>
                </div>
                {entry.kind !== "card_payment" && !mixed?.categories.length && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Categoría</dt>
                    <dd className="wrap-anywhere">
                      {entry.category ?? "Sin categorizar"}
                    </dd>
                  </div>
                )}
              </>
            )}
            {entry.note && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Nota</dt>
                <dd className="whitespace-pre-wrap wrap-anywhere">
                  {entry.note}
                </dd>
              </div>
            )}
          </dl>
          {loan && <LoanOperationDetail operation={loan} linkToLoan />}
          {mixed && credit && (
            <section className="grid gap-2 border-t pt-4">
              <h2 className="font-semibold">Medios de la compra</h2>
              <p className="text-sm wrap-anywhere">
                Débito de Bancos{mixed.debitCard && ` · ${mixed.debitCard}`} ·{" "}
                {formatBankAmount({
                  currency: entry.currency,
                  amount: mixed.debitAmount,
                })}
              </p>
              <p className="text-sm wrap-anywhere">
                Porción de crédito ·{" "}
                {formatBankAmount({
                  currency: entry.currency,
                  amount: plan
                    ? installmentTotal(plan, entry.currency)
                    : credit.amount,
                })}
              </p>
              {mixed.categories.length > 0 && (
                <ul
                  aria-label="Reparto por categorías"
                  className="grid gap-1 text-sm"
                >
                  {mixed.categories.map(
                    ({ method, categoryId, category, amount }) => (
                      <li
                        className="wrap-anywhere"
                        key={`${method}-${categoryId}`}
                      >
                        {method === "debit" ? "Débito" : "Crédito"} ·{" "}
                        {category ?? "Sin categorizar"} ·{" "}
                        {formatBankAmount({ currency: entry.currency, amount })}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          )}
          {cardLines.length > 0 && (
            <CreditHistoryDetail
              lines={cardLines}
              payment={entry.kind === "card_payment"}
              installmentPurchase={!!plan}
            />
          )}
          {plan && cardLines[0] && (
            <>
              <InstallmentHistory
                versions={plans}
                currency={cardLines[0].currency}
                today={today}
                status={entry.status}
              />
              {entry.status === "confirmed" && (
                <InstallmentEditor
                  eventId={entry.id}
                  plan={plan}
                  currency={cardLines[0].currency}
                  today={today}
                />
              )}
            </>
          )}
          {revisions.length > 0 && (
            <section
              className="grid gap-2 border-t pt-4"
              aria-label="Traza del registro"
            >
              <h2 className="font-semibold">Traza del registro</h2>
              <ul className="grid gap-2 text-sm">
                {revisions.map(({ type, incoming, related, recordedOn }) => (
                  <li key={`${type}-${incoming}`}>
                    {formatBankReference(recordedOn)} · {historyStates[type]}
                    {related && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline"
                          href={`/historial/movimientos/${related}${search}#titulo-pagina`}
                        >
                          {incoming ? "Ver registro anterior" : "Ver reemplazo"}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {checkpoint && (
            <p className="border-t pt-4 text-sm text-muted-foreground">
              Este importe es una referencia bancaria confirmada. Podés
              consultar las diferencias en{" "}
              <a className="underline" href="/resumen">
                Conciliación en Resumen
              </a>
              .
            </p>
          )}
          {entry.status === "confirmed" &&
            (entry.kind === "card_purchase" ||
              entry.kind === "card_payment") && (
              <CreditVoidForm
                eventId={entry.id}
                payment={entry.kind === "card_payment"}
              />
            )}
          {mixed && credit && mixedCreditCards.length > 0 && (
            <MixedPurchaseEditor
              cards={mixedCreditCards}
              debitCards={mixedCards.filter(({ kind }) => kind === "debit")}
              banks={currencies}
              categories={categories}
              today={today}
              initialCurrency={entry.currency}
              correction={{
                ...mixed,
                cardId: mixed.creditCardId,
                eventId: entry.id,
                total: entry.amount,
                amount: credit.amount,
                effectiveOn: entry.effectiveOn,
                categoryId: entry.categoryId,
                concept: entry.concept,
                note: entry.note,
                plan,
              }}
            />
          )}
          {editable && (
            <HistoryEditor
              entry={entry}
              categories={categories}
              currencies={currencies}
              today={today}
            />
          )}
        </Card>
      </div>
    </FinanceShell>
  );
}
