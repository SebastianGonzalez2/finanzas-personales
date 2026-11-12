import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { StatisticsDashboard } from "@/components/statistics-dashboard";
import { StatisticsFiltersForm } from "@/components/statistics-filters";
import { Card } from "@/components/ui/card";
import { historyButton } from "@/components/history-fields";
import { bankReferenceToday } from "@/domain/bank-balances";
import {
  parseStatisticsParams,
  statisticsHistoryRange,
  statisticsSearch,
} from "@/domain/statistics";
import { withGoogleOwner } from "@/server/google-auth";
import { listHistoryCategories } from "@/server/history";
import {
  listStatisticsFavorites,
  loadStatistics,
  listStatisticsCards,
  listStatisticsTags,
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
      const favoritesReady = ready.favorites;
      const favorites = favoritesReady
        ? await listStatisticsFavorites(client, ownerId)
        : [];
      const categories = await listHistoryCategories(client, ownerId);
      const cards = await listStatisticsCards(client, ownerId);
      const tags = ready.tags ? await listStatisticsTags(client, ownerId) : [];
      const snapshot = await loadStatistics(
        client,
        ownerId,
        parsed.range,
        parsed.previous,
        historyRange,
        parsed.filters,
        ready,
      );
      return {
        ready: true as const,
        favorites,
        favoritesReady,
        categories,
        cards,
        tags,
        snapshot,
      };
    },
    { repeatableRead: true },
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
        <StatisticsFiltersForm
          key={statisticsSearch(filters)}
          filters={filters}
          categories={data.categories}
          cards={data.cards}
          tags={data.tags}
        />
        {!data.favoritesReady && (
          <p role="status" className="text-sm text-muted-foreground">
            Los favoritos estarán disponibles cuando se actualice la base de
            datos. Mientras tanto podés explorar todas las estadísticas.
          </p>
        )}
        {view === "todas" &&
          data.favoritesReady &&
          data.favorites.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Marcá con una estrella las estadísticas que querés ver al entrar.
            </p>
          )}
        {view === "favoritos" && data.favorites.length === 0 ? (
          <Card className="items-start gap-3 p-4">
            <h2 className="font-semibold">Mis favoritos</h2>
            <p className="text-sm text-muted-foreground">
              Todavía no elegiste estadísticas favoritas. Marcá una tarjeta con
              la estrella para verla acá.
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
            favoritesReady={data.favoritesReady}
            view={view}
            categoryName={
              data.categories.find(({ id }) => id === filters.category)?.name
            }
          />
        )}
      </div>
    </FinanceShell>
  );
}
