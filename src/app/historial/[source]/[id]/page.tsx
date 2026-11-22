import { recurrencePeriodLabel } from "@/lib/recurrence-period-label";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { MovementClassification } from "@/components/movement-classification";
import {
  classificationReady,
  classificationTarget,
  listTags,
  emptyClassification,
  listClassificationVersions,
} from "@/server/classification";
import { HistoryEditor } from "@/components/history-editor";
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
import { movementUuid } from "@/domain/movements";
import { recurrenceEventPeriods } from "@/server/recurrence-links";
import { withGoogleOwner } from "@/server/google-auth";
import { findEventMerchant } from "@/server/catalog";
import {
  installmentsReady,
  listInstallmentVersions,
} from "@/server/installments";
import { findHistoryEntry, historyRevisions } from "@/server/history";
import { historyReady } from "@/server/movements";
import { listCatalogCategories } from "@/server/categories";

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
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (
        source !== "movimientos" ||
        !movementUuid.test(id) ||
        !(await historyReady(client))
      )
        return null;
      const entry = await findHistoryEntry(client, ownerId, id);
      if (!entry) return null;
      const recurrence = await recurrenceEventPeriods(client, ownerId, id);
      const revisions = await historyRevisions(client, ownerId, id);
      const plans = (await installmentsReady(client))
        ? await listInstallmentVersions(client, ownerId, id)
        : [];
      const versions = (await classificationReady(client))
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
      const canAllocate = !!classificationTargetData?.amount;
      // Los registros heredados de otros módulos (tarjetas, reparto) se
      // conservan solo para consulta.
      const editable =
        entry.kind === "expense" &&
        !entry.cardAmounts &&
        entry.status === "confirmed";
      const categories =
        editable || canAllocate
          ? (await listCatalogCategories(client, ownerId)).filter(
              ({ kind }) => kind === "expense",
            )
          : [];
      return {
        entry,
        recurrence,
        classification,
        previousClassifications: versions?.slice(1) ?? [],
        tags,
        canAllocate,
        merchant: await findEventMerchant(client, ownerId, id),
        revisions,
        editable,
        categories,
        plans,
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
    revisions,
    editable,
    categories,
    plans,
  } = data;
  const today = bankReferenceToday();
  const plan = plans[0];
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
                {plan ? "Total de la compra" : "Importe"}
              </dt>
              <dd>
                <HistoryAmount entry={entry} />
              </dd>
            </div>
            {!classification?.allocations.length && (
              <div>
                <dt className="text-sm text-muted-foreground">Categoría</dt>
                <dd className="wrap-anywhere">
                  {entry.category ?? "Sin categorizar"}
                </dd>
              </div>
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
          {plan && (
            <InstallmentHistory
              versions={plans}
              currency={entry.currency}
              today={today}
              status={entry.status}
            />
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
          {editable && (
            <HistoryEditor
              classification={classification}
              entry={entry}
              plan={plan}
              categories={categories}
              today={today}
            />
          )}
        </Card>
      </div>
    </FinanceShell>
  );
}
