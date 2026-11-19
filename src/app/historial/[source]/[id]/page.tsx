import { recurrencePeriodLabel } from "@/lib/recurrence-period-label";
import Link from "next/link";
import { listEventFundUses, listFundSources } from "@/server/fund-coverage";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PurchaseRefundPanel, RefundRecord } from "@/components/refund-form";
import { BankBenefitRecord } from "@/components/bank-benefit-form";
import { getBankBenefit } from "@/server/bank-benefits";
import { getPurchaseRefunds, getRefundEntry } from "@/server/refunds";
import { FinanceShell } from "@/components/finance-shell";
import { CreditHistoryDetail } from "@/components/credit-history-detail";
import { CreditVoidForm } from "@/components/credit-void-form";
import { MixedPurchaseEditor } from "@/components/mixed-purchase-editor";
import { RecurringSplitCorrection } from "@/components/recurring-split-correction";
import { SharedExpenseForm } from "@/components/shared-expense-form";
import { MovementClassification } from "@/components/movement-classification";
import {
  classificationReady,
  classificationTarget,
  listTags,
  emptyClassification,
  listClassificationVersions,
} from "@/server/classification";
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
import { recurrenceEventPeriods } from "@/server/recurrence-links";
import { withGoogleOwner } from "@/server/google-auth";
import { findEventMerchant } from "@/server/catalog";
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
import { historyReady } from "@/server/movements";
import { listCatalogCategories } from "@/server/categories";
import { listCards } from "@/server/cards";
import { mixedPurchaseDetail } from "@/server/mixed-purchases";
import { sharedExpenseDetail } from "@/server/shared-expenses";
import { sharedExpensesReady } from "@/server/shared-expense-schema";
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
      const recurrence = checkpoint
        ? []
        : await recurrenceEventPeriods(client, ownerId, id);
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
        (entry.kind === "card_purchase" || entry.kind === "expense") &&
        (await installmentsReady(client))
          ? await listInstallmentVersions(client, ownerId, id)
          : [];
      const mixed =
        entry.method === "mixed"
          ? await mixedPurchaseDetail(client, ownerId, id)
          : undefined;
      const sharingReady = !checkpoint && (await sharedExpensesReady(client));
      const shared =
        sharingReady &&
        (entry.kind === "expense" || entry.kind === "card_purchase")
          ? await sharedExpenseDetail(
              client,
              ownerId,
              id,
              recurrence.length > 0,
            )
          : undefined;
      const refund =
        entry.kind === "purchase_refund" || entry.kind === "card_credit_return"
          ? await getRefundEntry(client, ownerId, id)
          : undefined;
      const benefit =
        entry.kind === "bank_benefit"
          ? await getBankBenefit(client, ownerId, id)
          : undefined;
      const purchaseRefunds =
        !shared &&
        entry.status === "confirmed" &&
        (entry.kind === "card_purchase" ||
          (entry.kind === "expense" && entry.method === "debit"))
          ? await getPurchaseRefunds(client, ownerId, id)
          : undefined;
      const refundLinked = purchaseRefunds?.entries.some(
        ({ status }) => status !== "voided",
      );
      const versions =
        !checkpoint && (await classificationReady(client))
          ? await listClassificationVersions(client, ownerId, id)
          : null;
      const classification = versions
        ? (versions[0] ?? emptyClassification)
        : null;
      const tags = classification ? await listTags(client, ownerId) : [];
      const classificationTargetData =
        classification && entry.status === "confirmed"
          ? await classificationTarget(client, ownerId, id)
          : null;
      const canAllocate = !!classificationTargetData?.amount && !refundLinked;
      const canSplit =
        sharingReady &&
        !recurrence.length &&
        !classification?.allocations.length &&
        !refundLinked &&
        !shared &&
        !mixed &&
        entry.status === "confirmed" &&
        ((entry.kind === "expense" && !plans[0]) ||
          (entry.kind === "card_purchase" &&
            (!plans[0] || plans[0].count === plans[0].activeCount)));
      const mixedEditable =
        !!mixed &&
        !refundLinked &&
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
        !refund &&
        !benefit &&
        !refundLinked &&
        !loan &&
        !shared &&
        entry.status === "confirmed";
      const categories =
        (editable && entry.kind !== "bank_transfer") ||
        mixedEditable ||
        shared ||
        canAllocate
          ? (await listCatalogCategories(client, ownerId)).filter(
              ({ kind }) =>
                kind === (entry.kind === "income" ? "income" : "expense"),
            )
          : [];
      const currencies =
        editable || mixedEditable
          ? await listHistoryCurrencies(client, ownerId)
          : [];
      const fundUses = checkpoint
        ? []
        : await listEventFundUses(client, ownerId, id);
      const fundSources =
        (editable && entry.kind === "expense") || mixedEditable
          ? await listFundSources(client, ownerId)
          : null;
      return {
        entry,
        recurrence,
        classification,
        previousClassifications: versions?.slice(1) ?? [],
        tags,
        canAllocate,
        merchant:
          entry.kind === "expense" || entry.kind === "card_purchase"
            ? await findEventMerchant(client, ownerId, id)
            : null,
        fundUses,
        fundSources,
        revisions,
        editable,
        categories,
        currencies,
        cardLines,
        plans,
        mixed,
        mixedCards,
        loan,
        shared,
        canSplit,
        refund,
        benefit,
        purchaseRefunds,
        refundLinked,
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
    recurrence,
    classification,
    previousClassifications,
    tags,
    canAllocate,
    merchant,
    fundUses,
    fundSources,
    revisions,
    editable,
    categories,
    currencies,
    cardLines,
    plans,
    mixed,
    mixedCards,
    loan,
    shared,
    canSplit,
    refund,
    benefit,
    purchaseRefunds,
    refundLinked,
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
            {merchant && (
              <div>
                <dt className="text-sm text-muted-foreground">Comercio</dt>
                <dd>
                  <Link
                    className="underline"
                    href={`/historial?merchant=${merchant.id}`}
                  >
                    {merchant.name}
                  </Link>
                </dd>
              </div>
            )}
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
                      ? entry.kind === "expense"
                        ? "Total de la compra"
                        : "Total financiado"
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
                {entry.kind !== "card_payment" &&
                  !mixed?.categories.length &&
                  !classification?.allocations.length && (
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        Categoría
                      </dt>
                      <dd className="wrap-anywhere">
                        {entry.category ?? "Sin categorizar"}
                      </dd>
                    </div>
                  )}
              </>
            )}
            {recurrence.length > 0 && (
              <div>
                <dt className="text-sm text-muted-foreground">
                  Período al que corresponde
                </dt>
                <dd className="flex flex-wrap gap-2">
                  {recurrence.map(({ seriesId, key, index }) => (
                    <Link
                      className="underline"
                      key={key}
                      href={`/recurrentes?serie=${seriesId}&hasta=${index}#periodo-${seriesId}-${index}`}
                    >
                      {recurrencePeriodLabel(key)}
                    </Link>
                  ))}
                </dd>
              </div>
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
          {classification && (
            <MovementClassification
              key={entry.id}
              eventId={entry.id}
              {...classification}
              tags={tags}
              categories={categories}
              currency={entry.currency}
              editable={entry.status === "confirmed"}
              allocatable={canAllocate}
            />
          )}
          {previousClassifications.length > 0 && (
            <details className="border-t pt-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Últimas clasificaciones anteriores
              </summary>
              <ul className="mt-2 grid gap-2">
                {previousClassifications.map((previous) => (
                  <li
                    key={previous.version}
                    className="grid gap-1 rounded-md border p-3"
                  >
                    <p className="font-medium">
                      Versión {previous.version} ·{" "}
                      {formatBankReference(previous.recordedOn)}
                    </p>
                    {previous.allocations.map(
                      ({ categoryId, category, amount }) => (
                        <p key={categoryId ?? "none"}>
                          {category ?? "Sin categorizar"} ·{" "}
                          {formatBankAmount({
                            currency: entry.currency,
                            amount,
                          })}
                        </p>
                      ),
                    )}
                    {previous.tagIds.length > 0 && (
                      <p>
                        Etiquetas ·{" "}
                        {tags
                          .filter(({ id }) => previous.tagIds.includes(id))
                          .map(({ name }) => name)
                          .join(", ")}
                      </p>
                    )}
                    {!previous.allocations.length &&
                      !previous.tagIds.length && (
                        <p>Sin desglose ni etiquetas.</p>
                      )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {fundUses.length > 0 && (
            <section
              className="grid gap-2 border-t pt-4"
              aria-label="Fondos vinculados"
            >
              <h2 className="font-semibold">Fondos vinculados</h2>
              <ul className="grid gap-1 text-sm">
                {fundUses.map((use) => (
                  <li
                    key={`${use.purpose}-${use.fundId}-${use.purchaseId ?? ""}`}
                    className="wrap-anywhere"
                  >
                    {use.purpose === "commitment"
                      ? "Compromiso original"
                      : use.purpose === "payment"
                        ? "Aplicado al pago"
                        : "Usado para el gasto"}
                    : {use.name} · {formatBankAmount(use)}
                    {use.purchaseId && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline"
                          href={`/historial/movimientos/${use.purchaseId}`}
                        >
                          {use.purchaseConcept}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {refund && <RefundRecord entry={refund} linkPurchase />}
          {benefit && <BankBenefitRecord entry={benefit} />}
          {purchaseRefunds && (
            <PurchaseRefundPanel purchase={purchaseRefunds} today={today} />
          )}
          {loan && <LoanOperationDetail operation={loan} linkToLoan />}
          {shared && (
            <section
              className="grid gap-3 border-t pt-4"
              aria-label="Obligaciones del gasto"
            >
              <h2 className="font-semibold">
                {shared.method === "third_party"
                  ? "Gasto pendiente de pago"
                  : "Reparto del gasto"}
              </h2>
              <p className="text-sm">
                Gasto propio ·{" "}
                {formatBankAmount({
                  currency: shared.currency,
                  amount: shared.ownAmount,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {shared.method === "third_party"
                  ? "El gasto se registró sin salida de Bancos."
                  : shared.method === "credit"
                    ? "El cargo de tarjeta figura en el detalle del medio de pago."
                    : `Salida registrada en Bancos · ${formatBankAmount(shared)}`}
              </p>
              <ul className="divide-y">
                {shared.loans.map((obligation) => (
                  <li
                    key={obligation.id}
                    className="grid gap-1 py-2 text-sm wrap-anywhere"
                  >
                    <p className="font-medium">{obligation.concept}</p>
                    <p>
                      {obligation.outstanding === "0.0000"
                        ? "Saldada"
                        : `Pendiente · ${formatBankAmount({ currency: obligation.currency, amount: obligation.outstanding })}`}
                    </p>
                    {obligation.dueOn && (
                      <p>
                        Fecha prevista · {formatBankReference(obligation.dueOn)}
                      </p>
                    )}
                    <Link
                      className="w-fit font-medium underline"
                      href={`/deudas/${obligation.id}`}
                    >
                      {obligation.outstanding === "0.0000"
                        ? "Ver obligación saldada"
                        : obligation.direction === "payable"
                          ? "Ver deuda y registrar pago"
                          : "Ver saldo y registrar cobro"}
                      <span className="sr-only"> · {obligation.concept}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
          {plan && entry.kind === "expense" && (
            <InstallmentHistory
              versions={plans}
              currency={entry.currency}
              today={today}
              status={entry.status}
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
              {entry.status === "confirmed" && !refundLinked && (
                <InstallmentEditor
                  eventId={entry.id}
                  plan={plan}
                  currency={cardLines[0].currency}
                  today={today}
                  allowCancellation={!shared}
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
          {!shared &&
            entry.status === "confirmed" &&
            !refundLinked &&
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
              fundSources={fundSources}
              correction={{
                ...mixed,
                cardId: mixed.creditCardId,
                eventId: entry.id,
                total: entry.amount,
                amount: credit.amount,
                originalPurchase: credit.originalPurchase,
                covered: mixed.covered && !credit.creditApplied,
                effectiveOn: entry.effectiveOn,
                categoryId: entry.categoryId,
                category: entry.category,
                concept: entry.concept,
                note: entry.note,
                plan,
                fundCommitment: fundUses.find(
                  ({ purpose }) => purpose === "commitment",
                ),
                fundPortions: fundUses.filter(
                  ({ purpose }) => purpose === "expense",
                ),
              }}
            />
          )}
          {shared && (
            <details className="grid gap-3 border-t pt-4">
              <summary className="cursor-pointer font-semibold">
                Corregir datos del gasto
              </summary>
              <div className="mt-3">
                <SharedExpenseForm
                  key={shared.version}
                  target={{
                    id: entry.id,
                    amount: shared.amount,
                    currency: shared.currency,
                    concept: shared.concept,
                    note: shared.note,
                    categoryId: shared.categoryId,
                    version: shared.version,
                  }}
                  categories={categories}
                  today={today}
                />
              </div>
            </details>
          )}
          {shared && shared.portions.length > 0 && (
            <details className="border-t pt-4">
              <summary className="cursor-pointer font-semibold">
                Corregir reparto del pago
              </summary>
              <RecurringSplitCorrection
                key={shared.version}
                eventId={entry.id}
                version={shared.version}
                currency={shared.currency}
                ownAmount={shared.ownAmount}
                parties={shared.portions}
              />
            </details>
          )}
          {shared && shared.revisions.length > 1 && (
            <section
              className="grid gap-2 border-t pt-4"
              aria-label="Versiones de los datos"
            >
              <h2 className="font-semibold">Versiones de los datos</h2>
              <ul className="grid gap-2 text-sm wrap-anywhere">
                {shared.revisions.map(
                  ({
                    version,
                    concept,
                    category,
                    note,
                    recordedOn,
                    correctedOwn,
                  }) => (
                    <li key={version}>
                      <p>
                        Versión {version} ·{" "}
                        {formatBankReference(recordedOn.slice(0, 10))}
                        {recordedOn.slice(10)}
                      </p>
                      <p>
                        {concept} · {category ?? "Sin categorizar"}
                      </p>
                      {correctedOwn !== null && (
                        <p>
                          Reparto corregido · Gasto propio{" "}
                          {formatBankAmount({
                            currency: shared.currency,
                            amount: correctedOwn,
                          })}
                        </p>
                      )}
                      {note && <p className="whitespace-pre-wrap">{note}</p>}
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
          {canSplit && (
            <details className="border-t pt-4">
              <summary className="cursor-pointer font-semibold">
                Repartir este gasto
              </summary>
              <div className="mt-3">
                <SharedExpenseForm
                  target={entry}
                  categories={[]}
                  today={today}
                />
              </div>
            </details>
          )}
          {editable && (
            <HistoryEditor
              classification={classification}
              entry={entry}
              fundSources={fundSources}
              fundPortions={fundUses}
              plan={entry.kind === "expense" ? plan : undefined}
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
