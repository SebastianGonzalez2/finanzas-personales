import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { StatisticsDashboard } from "@/components/statistics-dashboard";
import { StatisticsAnnualCard } from "@/components/statistics-annual";
import { StatisticsFiltersForm } from "@/components/statistics-filters";
import {
  EmptyState,
  PageHead,
  PageNotice,
  Screen,
} from "@/components/glaciar/screen";
import { buttonClass } from "@/components/ui/button";
import { ExchangeRateDetails } from "@/components/exchange-rate-details";
import { bankReferenceToday } from "@/domain/bank-balances";
import {
  parseStatisticsParams,
  statisticsAnnualRange,
  statisticsHistoryRange,
  statisticsSearch,
  retiredStatisticsCharts,
} from "@/domain/statistics";
import { withGoogleOwner } from "@/server/google-auth";
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
import { displayCurrency, exchangeRatesReady } from "@/server/exchange-rates";
import { listTags } from "@/server/classification";
import { listHistoryCategories } from "@/server/history";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";
import {
  listStatisticsFavorites,
  loadStatistics,
  loadStatisticsAnnual,
  prepareStatisticsFx,
  statisticsReady,
  statisticsReferenceDates,
} from "@/server/statistics";

export const metadata = { title: "Estadísticas | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function StatisticsPage(
  props: PageProps<"/estadisticas">,
) {
  await requireGoogleOwnerPage();
  const today = bankReferenceToday();
  const raw = parseStatisticsParams(await props.searchParams, today);
  // SIMP-03: las estadísticas solo consideran gastos; el tipo, el medio de
  // pago y la tarjeta ya no se filtran.
  const parsed =
    "error" in raw
      ? raw
      : {
          ...raw,
          filters: {
            ...raw.filters,
            kind: undefined,
            method: undefined,
            card: undefined,
          },
        };
  if ("error" in parsed)
    return (
      <FinanceShell current="estadisticas">
        <Screen>
          <PageHead eyebrow="General" title="Estadísticas" />
          <section className="lab-panel">
            <div className="b-notice b-notice--critical" role="alert">
              <p className="min-w-0 font-medium">{parsed.error}</p>
            </div>
            <div className="gs-actions">
              <Link href="/estadisticas" className={buttonClass("outline")}>
                Volver a estadísticas
              </Link>
            </div>
          </section>
        </Screen>
      </FinanceShell>
    );

  const scoped = { ...parsed.filters, kind: "expense" } as const;
  const historyRange = statisticsHistoryRange(parsed.range, today);
  const annualRange = statisticsAnnualRange(today, parsed.filters.annualEnd);
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  // Import public observations and commit historical pins before the report's
  // repeatable-read snapshot. Every aggregation sees the same pinned rates.
  const conversion =
    parsed.filters.display === "original"
      ? undefined
      : await withGoogleOwner(request, async (client, ownerId) => {
          if (!(await exchangeRatesReady(client))) return undefined;
          const schema = await statisticsReady(client);
          if (!schema.ready) return undefined;
          const currency =
            parsed.filters.display || (await displayCurrency(client, ownerId));
          if (currency === "original") return undefined;
          const showAnnual =
            parsed.filters.view === "todas" ||
            (!parsed.filters.view &&
              (!schema.favorites ||
                (await listStatisticsFavorites(client, ownerId)).length === 0));
          const dates = await statisticsReferenceDates(
            client,
            ownerId,
            parsed.range,
            parsed.previous,
            historyRange,
            scoped,
            schema,
            currency,
            showAnnual ? annualRange : undefined,
          );
          return { currency, dates, showAnnual };
        }).catch(() => undefined);
  const target = conversion?.currency;
  if (conversion) {
    await refreshOwnerReferences(request, conversion.dates, today).catch(
      () => undefined,
    );
    await withGoogleOwner(request, async (client, ownerId) => {
      const schema = await statisticsReady(client);
      if (schema.ready)
        await prepareStatisticsFx(
          client,
          ownerId,
          parsed.range,
          parsed.previous,
          historyRange,
          scoped,
          schema,
          conversion.currency,
          today,
          conversion.showAnnual ? annualRange : undefined,
        );
    }).catch(() => undefined);
  }
  const data = await withGoogleOwner(
    request,
    async (client, ownerId) => {
      const ready = await statisticsReady(client);
      if (!ready.ready) return { ready: false as const };
      const favoritesReady = ready.favorites;
      const favorites = favoritesReady
        ? (await listStatisticsFavorites(client, ownerId)).filter(
            (id) => !retiredStatisticsCharts.includes(id),
          )
        : [];
      const view =
        parsed.filters.view ?? (favorites.length > 0 ? "favoritos" : "todas");
      const categories = await listHistoryCategories(client, ownerId);
      const selectedCategory = parsed.filters.category;
      const annualCategoryAvailable =
        !selectedCategory ||
        selectedCategory === "none" ||
        categories.some(
          ({ id, kind }) => id === selectedCategory && kind === "expense",
        );
      const annual =
        view === "todas" && annualCategoryAvailable
          ? await loadStatisticsAnnual(
              client,
              ownerId,
              annualRange,
              scoped,
              ready,
              target,
            )
          : undefined;
      const tags = ready.tags ? await listTags(client, ownerId) : [];
      const snapshot = await loadStatistics(
        client,
        ownerId,
        parsed.range,
        parsed.previous,
        historyRange,
        scoped,
        ready,
        target,
      );
      return {
        ready: true as const,
        favorites,
        favoritesReady,
        categories,
        tags,
        snapshot,
        annual,
        annualCategoryAvailable,
        view,
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
        <Screen>
          <PageHead eyebrow="General" title="Estadísticas" />
          {"message" in data ? (
            <PageNotice
              tone="critical"
              message={data.message}
              retryHref="/estadisticas"
            />
          ) : (
            <PageNotice
              tone="info"
              message="Las estadísticas estarán disponibles cuando se actualice la base de datos."
            />
          )}
          <div className="gs-actions">
            <Link href="/resumen" className={buttonClass("outline")}>
              Volver al resumen
            </Link>
          </div>
        </Screen>
      </FinanceShell>
    );

  const view = data.view;
  const filters = { ...parsed.filters, view };
  const favoriteSearch = statisticsSearch(filters, { view: "favoritos" });
  const allSearch = statisticsSearch(filters, { view: "todas" });

  return (
    <FinanceShell current="estadisticas">
      <Screen>
        <PageHead
          eyebrow="General"
          title="Estadísticas"
          actions={
            <nav
              aria-label="Vistas de estadísticas"
              className="ui-segment gs-viewtabs"
            >
              <Link
                href={`/estadisticas${favoriteSearch}`}
                aria-current={view === "favoritos" ? "page" : undefined}
                className="ui-segment__option"
              >
                Mis favoritos
              </Link>
              <Link
                href={`/estadisticas${allSearch}`}
                aria-current={view === "todas" ? "page" : undefined}
                className="ui-segment__option"
              >
                Todas las estadísticas
              </Link>
            </nav>
          }
        />
        <StatisticsFiltersForm
          key={statisticsSearch(filters)}
          filters={filters}
          display={target ?? "original"}
          categories={data.categories}
          tags={data.tags}
        />
        {data.snapshot.fx ? (
          <section className="lab-panel lab-panel--dense">
            <ExchangeRateDetails
              target={data.snapshot.fx.target}
              quotes={data.snapshot.fx.quotes}
              missing={data.snapshot.fx.missingFlows}
            />
          </section>
        ) : (
          filters.display !== "original" && (
            <PageNotice
              tone="info"
              message="La conversión no está disponible. Se muestran importes en su moneda original."
            />
          )
        )}
        {!data.favoritesReady && (
          <PageNotice
            tone="info"
            message="Los favoritos estarán disponibles cuando se actualice la base de datos. Mientras tanto podés explorar todas las estadísticas."
          />
        )}
        {view === "todas" &&
          data.favoritesReady &&
          data.favorites.length === 0 && (
            <p className="lab-muted text-sm">
              Marcá con una estrella las estadísticas que querés ver al entrar.
            </p>
          )}
        {view === "favoritos" && data.favorites.length === 0 ? (
          <EmptyState
            icon="stats"
            title="Todavía no elegiste estadísticas favoritas"
            labelId="favoritos-vacios"
            actions={
              <Link
                href={`/estadisticas${allSearch}`}
                className={buttonClass("primary")}
              >
                Explorar estadísticas
              </Link>
            }
          >
            Marcá una tarjeta con la estrella para verla acá.
          </EmptyState>
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
        {view === "todas" && (
          <StatisticsAnnualCard
            filters={filters}
            categories={data.categories}
            categoryAvailable={data.annualCategoryAvailable}
            result={data.annual}
            range={annualRange}
            today={today}
          />
        )}
      </Screen>
    </FinanceShell>
  );
}
