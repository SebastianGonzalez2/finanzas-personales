import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { HistorySelection } from "@/components/history-selection";
import { SavedHistoryFilters } from "@/components/saved-history-filters";
import { historyButton } from "@/components/history-fields";
import { HistoryFilters } from "@/components/history-filters";
import { Card } from "@/components/ui/card";
import {
  historyPeriodFilter,
  historyPeriodRange,
  historySearch,
  historyToday,
  parseHistoryParams,
} from "@/domain/history";
import { classificationReady, listTags } from "@/server/classification";
import { withGoogleOwner } from "@/server/google-auth";
import { listHistory, listHistoryCategories } from "@/server/history";
import { listSavedFilters, savedFiltersReady } from "@/server/history-filters";
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
      // El rango relativo se resuelve en cada consulta: un filtro guardado
      // «mes actual» consulta el mes vigente, no el de su creación (CA-058).
      const period = historyPeriodFilter(query.filters.period);
      const range = period ? historyPeriodRange(period, historyToday()) : null;
      const page = await listHistory(client, ownerId, {
        ...query,
        filters: range
          ? { ...query.filters, from: range.from, to: range.to }
          : query.filters,
      });
      return {
        ...page,
        categories: await listHistoryCategories(client, ownerId),
        savedFilters: (await savedFiltersReady(client))
          ? await listSavedFilters(client, ownerId)
          : [],
        tags: (await classificationReady(client))
          ? await listTags(client, ownerId)
          : [],
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
              tags={data.tags}
            />
            {"savedFilters" in data && (
              <SavedHistoryFilters
                values={query.filters}
                saved={data.savedFilters}
                categories={data.categories}
              />
            )}
            <HistorySelection
              entries={entries}
              filters={query.filters}
              cursor={query.cursor}
              categories={data.categories}
            />
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
          </>
        )}
      </div>
    </FinanceShell>
  );
}
