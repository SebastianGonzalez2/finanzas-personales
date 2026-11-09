import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { HistoryEditor } from "@/components/history-editor";
import { HistoryAmount } from "@/components/history-entry";
import { historyButton } from "@/components/history-fields";
import { Card } from "@/components/ui/card";
import {
  bankReferenceToday,
  formatBankReference,
} from "@/domain/bank-balances";
import {
  historyKinds,
  historySearch,
  historyStates,
  parseHistoryParams,
} from "@/domain/history";
import { movementMethods, movementUuid } from "@/domain/movements";
import { withGoogleOwner } from "@/server/google-auth";
import {
  findHistoryEntry,
  historyRevisions,
  listHistoryCurrencies,
} from "@/server/history";
import { historyReady, listMovementCategories } from "@/server/movements";

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
      const editable = !checkpoint && entry.status === "confirmed";
      const categories =
        editable && entry.kind !== "bank_transfer"
          ? (await listMovementCategories(client, ownerId)).filter(
              ({ kind }) => kind === entry.kind,
            )
          : [];
      const currencies = editable
        ? await listHistoryCurrencies(client, ownerId)
        : [];
      return { entry, revisions, editable, categories, currencies };
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

  const { entry, revisions, editable, categories, currencies } = data;
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
                  <dd>{movementMethods[entry.method]}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Categoría</dt>
                  <dd className="wrap-anywhere">
                    {entry.category ?? "Sin categorizar"}
                  </dd>
                </div>
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
          {editable && (
            <HistoryEditor
              entry={entry}
              categories={categories}
              currencies={currencies}
              today={bankReferenceToday()}
            />
          )}
        </Card>
      </div>
    </FinanceShell>
  );
}
