import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { HistoryExplorer } from "@/components/history-explorer";
import { HistorySelection } from "@/components/history-selection";
import { SavedHistoryFilters } from "@/components/saved-history-filters";
import { HistoryFilters } from "@/components/history-filters";
import {
  historyPeriodFilter,
  historyPeriodRange,
  historySearch,
  historyToday,
  parseHistoryParams,
} from "@/domain/history";
import { historyChips, historyPeriodLabel } from "@/domain/history-chips";
import { classificationReady, listTags } from "@/server/classification";
import { withGoogleOwner } from "@/server/google-auth";
import { listNameCatalog, nameCatalogReady } from "@/server/catalog";
import { listHistory, listHistoryCategories } from "@/server/history";
import { listSavedFilters, savedFiltersReady } from "@/server/history-filters";
import { bulkClassificationReady } from "@/server/history-bulk";
import { historyReady } from "@/server/movements";

export const metadata = { title: "Historial | Finanzas personales" };
export const dynamic = "force-dynamic";

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default async function HistoryPage({
  searchParams,
}: PageProps<"/historial">) {
  const parsed = parseHistoryParams(await searchParams);
  // SIMP-03: el historial muestra solo gastos; el tipo y el medio ya no se filtran.
  const query =
    "error" in parsed
      ? parsed
      : {
          ...parsed,
          filters: { ...parsed.filters, kind: undefined, method: undefined },
        };
  const today = historyToday();
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
      const range = period ? historyPeriodRange(period, today) : null;
      const page = await listHistory(client, ownerId, {
        ...query,
        filters: range
          ? { ...query.filters, from: range.from, to: range.to }
          : query.filters,
      });
      return {
        ...page,
        categories: (await listHistoryCategories(client, ownerId)).filter(
          ({ kind }) => kind === "expense",
        ),
        savedFilters: (await savedFiltersReady(client))
          ? await listSavedFilters(client, ownerId)
          : null,
        bulkReady: await bulkClassificationReady(client),
        tags: (await classificationReady(client))
          ? await listTags(client, ownerId)
          : [],
        merchants: (await nameCatalogReady(client))
          ? (await listNameCatalog(client, ownerId)).filter(
              ({ kind }) => kind === "merchant",
            )
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
  const [year, month] = today.split("-");
  return (
    <FinanceShell current="historial">
      <div className="glaciar-history">
        <div className="f-pagehead">
          <div>
            <p className="c-eyebrow">
              <span className="c-eyebrow__line" aria-hidden="true" />
              <time dateTime={`${year}-${month}`}>
                {monthNames[Number(month) - 1]} {year}
              </time>
            </p>
            <h1 id="titulo-pagina" tabIndex={-1} className="f-title">
              Historial
            </h1>
          </div>
        </div>
        {"message" in data || "error" in query ? (
          <section className="lab-panel items-start">
            <p role="status">
              {"message" in data ? data.message : query.error}
            </p>
            <Link
              href="/historial"
              prefetch={false}
              className="ui-btn ui-btn--outline"
            >
              Volver al inicio del historial
            </Link>
          </section>
        ) : (
          <>
            <HistoryExplorer>
              <HistoryFilters
                values={query.filters}
                categories={data.categories}
                tags={data.tags}
                merchants={data.merchants}
                saved={data.savedFilters}
              />
              <HistorySelection
                entries={entries}
                filters={query.filters}
                cursor={query.cursor}
                categories={data.categories.filter(({ archived }) => !archived)}
                tags={data.tags.filter(({ archived }) => !archived)}
                enabled={data.bulkReady}
                paged={Boolean(query.cursor || data.hasNextPage)}
                periodLabel={historyPeriodLabel(query.filters)}
                chips={historyChips(query.filters, {
                  categories: data.categories,
                  tags: data.tags,
                  merchants: data.merchants,
                })}
                filtered={Object.values(query.filters).some(Boolean)}
              />
              {(query.cursor || data.hasNextPage) && (
                <nav aria-label="Páginas del historial" className="lab-pager">
                  {query.cursor && (
                    <a
                      href={`/historial${historySearch(query.filters)}#resultados`}
                      className="ui-btn ui-btn--outline"
                    >
                      Primera página
                    </a>
                  )}
                  {data.hasNextPage && last && (
                    <a
                      href={`/historial${historySearch(query.filters, { date: last.effectiveOn, id: last.id, kind: last.kind })}#resultados`}
                      className="ui-btn ui-btn--outline"
                    >
                      Página siguiente
                    </a>
                  )}
                </nav>
              )}
            </HistoryExplorer>
            {data.savedFilters && (
              <SavedHistoryFilters
                values={query.filters}
                saved={data.savedFilters}
                categories={data.categories}
                tags={data.tags}
                canUpdateCriteria={data.bulkReady}
              />
            )}
          </>
        )}
      </div>
    </FinanceShell>
  );
}
