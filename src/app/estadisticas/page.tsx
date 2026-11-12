import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { StatisticsDashboard } from "@/components/statistics-dashboard";
import { StatisticsFiltersForm } from "@/components/statistics-filters";
import { Card } from "@/components/ui/card";
import { historyButton } from "@/components/history-fields";
import { bankReferenceToday } from "@/domain/bank-balances";
import { parseHistoryParams, type HistoryEntry } from "@/domain/history";
import {
  parseStatisticsParams,
  statisticsHistoryRange,
  statisticsSearch,
} from "@/domain/statistics";
import { withGoogleOwner } from "@/server/google-auth";
import { listHistory, listHistoryCategories } from "@/server/history";
import { historyReady } from "@/server/movements";
import {
  listStatisticsFavorites,
  loadStatistics,
  statisticsFavoritesReady,
  statisticsReady,
} from "@/server/statistics";

export const metadata = { title: "Estadísticas | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function StatisticsPage({
  searchParams,
}: PageProps<"/estadisticas">) {
  const today = bankReferenceToday();
  const parsed = parseStatisticsParams(await searchParams, today);
  if ("error" in parsed)
    return (
      <FinanceShell current="estadisticas">
        <Card className="items-start gap-3 p-4">
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Estadísticas
          </h1>
          <p role="alert">{parsed.error}</p>
          <Link href="/estadisticas" className={historyButton}>
            Volver a estadísticas
          </Link>
        </Card>
      </FinanceShell>
    );

  const historyRange = statisticsHistoryRange(parsed.range, today);
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      const ready = await statisticsReady(client);
      if (!ready.ready) return { ready: false as const };
      const favoritesReady = await statisticsFavoritesReady(client);
      const favorites = favoritesReady
        ? await listStatisticsFavorites(client, ownerId)
        : [];
      const categories = await listHistoryCategories(client, ownerId);
      const snapshot = await loadStatistics(
        client,
        ownerId,
        parsed.range,
        parsed.previous,
        historyRange,
        parsed.filters,
      );
      let entries: HistoryEntry[] = [];
      let hasNextPage = false;
      if (parsed.filters.category && (await historyReady(client))) {
        const drillQuery = parseHistoryParams({
          from: parsed.range.from,
          to: parsed.range.to,
          ...(parsed.filters.currency
            ? { currency: parsed.filters.currency }
            : {}),
          category: parsed.filters.category,
          ...(parsed.filters.method ? { method: parsed.filters.method } : {}),
        });
        if (!("error" in drillQuery)) {
          const page = await listHistory(client, ownerId, drillQuery);
          entries = page.entries;
          hasNextPage = page.hasNextPage;
        }
      }
      return {
        ready: true as const,
        favorites,
        favoritesReady,
        categories,
        snapshot,
        entries,
        hasNextPage,
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      ready: false as const,
      message: "No pudimos cargar las estadísticas.",
    };
  });

  if (!data.ready)
    return (
      <FinanceShell current="estadisticas">
        <div className="grid gap-4">
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Estadísticas
          </h1>
          <Card className="items-start gap-3 p-4">
            <p role="status">
              {"message" in data
                ? data.message
                : "Las estadísticas estarán disponibles cuando se actualice la base de datos."}
            </p>
            <Link href="/resumen" className={historyButton}>
              Volver al resumen
            </Link>
          </Card>
        </div>
      </FinanceShell>
    );

  const view =
    parsed.filters.view ?? (data.favorites.length > 0 ? "favoritos" : "todas");
  const filters = { ...parsed.filters, view };
  const favoriteSearch = statisticsSearch(filters, { view: "favoritos" });
  const allSearch = statisticsSearch(filters, { view: "todas" });

  return (
    <FinanceShell current="estadisticas">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Estadísticas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Análisis de los movimientos que registraste, con comparaciones,
            desgloses y detalle hasta cada movimiento. El dashboard principal
            mantiene su diseño fijo.
          </p>
        </header>
        <nav
          aria-label="Vistas de estadísticas"
          className="flex flex-wrap gap-2"
        >
          <Link
            href={`/estadisticas${favoriteSearch}`}
            aria-current={view === "favoritos" ? "page" : undefined}
            className={`${historyButton} ${view === "favoritos" ? "bg-muted font-bold" : ""}`}
          >
            Mis favoritos
          </Link>
          <Link
            href={`/estadisticas${allSearch}`}
            aria-current={view === "todas" ? "page" : undefined}
            className={`${historyButton} ${view === "todas" ? "bg-muted font-bold" : ""}`}
          >
            Todas las estadísticas
          </Link>
        </nav>
        <StatisticsFiltersForm filters={filters} categories={data.categories} />
        {!data.favoritesReady && (
          <p role="status" className="text-sm text-muted-foreground">
            Los favoritos estarán disponibles cuando se actualice la base de
            datos. Mientras tanto podés explorar todas las estadísticas.
          </p>
        )}
        {view === "favoritos" && data.favorites.length === 0 ? (
          <Card className="items-start gap-3 p-4">
            <h2 className="font-semibold">Mis favoritos</h2>
            <p className="text-sm text-muted-foreground">
              Todavía no elegiste estadísticas favoritas. Marcá una tarjeta con
              la estrella para verla acá; la preferencia es personal y no cambia
              el dashboard ni los movimientos.
            </p>
            <Link href={`/estadisticas${allSearch}`} className={historyButton}>
              Explorar estadísticas
            </Link>
          </Card>
        ) : (
          <StatisticsDashboard
            snapshot={data.snapshot}
            filters={filters}
            favorites={data.favorites}
            view={view}
            entries={data.entries}
            hasNextPage={data.hasNextPage}
          />
        )}
      </div>
    </FinanceShell>
  );
}
