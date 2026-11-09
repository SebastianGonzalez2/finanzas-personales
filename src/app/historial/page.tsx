import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { HistoryAmount } from "@/components/history-entry";
import { historyButton } from "@/components/history-fields";
import { HistoryFilters } from "@/components/history-filters";
import { Card } from "@/components/ui/card";
import { formatBankReference } from "@/domain/bank-balances";
import {
  historyKinds,
  historySearch,
  historyStates,
  parseHistoryParams,
} from "@/domain/history";
import { withGoogleOwner } from "@/server/google-auth";
import { listHistory, listHistoryCategories } from "@/server/history";
import { historyReady } from "@/server/movements";

export const metadata = { title: "Historial | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: PageProps<"/historial">) {
  const query = parseHistoryParams(await searchParams);
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await historyReady(client)))
        return {
          message:
            "El historial estará disponible cuando se actualice la base de datos.",
        };
      if ("error" in query) return { message: query.error };
      const page = await listHistory(client, ownerId, query);
      return {
        ...page,
        categories: await listHistoryCategories(client, ownerId),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { message: "No pudimos cargar el historial. Volvé a intentarlo." };
  });

  const entries = "entries" in data ? data.entries : [];
  const last = entries.at(-1);
  return (
    <FinanceShell current="historial">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Historial
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Movimientos y saldos confirmados de todas las fechas, ordenados del
            más reciente al más antiguo.
          </p>
        </header>
        {"message" in data || "error" in query ? (
          <Card className="items-start gap-3 p-4">
            <p role="status">
              {"message" in data ? data.message : query.error}
            </p>
            <Link href="/historial" prefetch={false} className={historyButton}>
              Volver al inicio del historial
            </Link>
          </Card>
        ) : (
          <>
            <HistoryFilters
              values={query.filters}
              categories={data.categories}
            />
            <Card className="gap-3 p-4 sm:p-5">
              <h2 id="resultados" tabIndex={-1} className="font-semibold">
                Registros
              </h2>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay registros que coincidan.
                </p>
              ) : (
                <ul className="divide-y">
                  {entries.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`}>
                      <a
                        href={`/historial/${entry.kind === "checkpoint" ? "saldos" : "movimientos"}/${entry.id}${historySearch(query.filters, query.cursor)}#titulo-pagina`}
                        className="grid gap-2 rounded-md px-2 py-3 hover:bg-muted sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="font-medium wrap-anywhere">
                            {entry.concept}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatBankReference(entry.effectiveOn)} ·{" "}
                            {historyKinds[entry.kind]} ·{" "}
                            {historyStates[entry.status]}
                          </p>
                        </div>
                        <HistoryAmount entry={entry} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {(query.cursor || data.hasNextPage) && (
                <nav
                  aria-label="Páginas del historial"
                  className="flex flex-wrap gap-2"
                >
                  {query.cursor && (
                    <a
                      href={`/historial${historySearch(query.filters)}#resultados`}
                      className={historyButton}
                    >
                      Primera página
                    </a>
                  )}
                  {data.hasNextPage && last && (
                    <a
                      href={`/historial${historySearch(query.filters, { date: last.effectiveOn, id: last.id, kind: last.kind })}#resultados`}
                      className={historyButton}
                    >
                      Página siguiente
                    </a>
                  )}
                </nav>
              )}
            </Card>
          </>
        )}
      </div>
    </FinanceShell>
  );
}
