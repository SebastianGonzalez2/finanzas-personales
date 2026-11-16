import { recurrencePeriodLabel } from "@/lib/recurrence-period-label";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { RecurrenceSettlementForm } from "@/components/recurrence-settlement-form";
import { historyButton } from "@/components/history-fields";
import { RecurrenceForm } from "@/components/recurrence-form";
import { RecurrenceLifecycleForm } from "@/components/recurrence-lifecycle-form";
import {
  EmptyState,
  PageHead,
  PageNotice,
  Screen,
  StateTag,
} from "@/components/glaciar/screen";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  bankReferenceToday,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import {
  movementDisplayMethods,
  movementUuid,
  type MovementKind,
} from "@/domain/movements";
import type { Currency } from "@/domain/money";
import {
  followingRecurrenceMonth,
  latestTrackedIndex,
} from "@/domain/recurrence-plan";
import type { TrackedPeriod } from "@/domain/recurrence-settlements";
import { listPeople, recurringSharesReady } from "@/server/recurring-shares";
import { listCards } from "@/server/cards";
import { recurrenceTrackingReady } from "@/server/recurrence-links";
import {
  trackedPeriodPage,
  trackedPeriods,
} from "@/server/recurrence-settlements";
import { withGoogleOwner } from "@/server/google-auth";
import { listCatalogCategories } from "@/server/categories";
import {
  listRecurrences,
  recurrencesReady,
  recurrenceSeriesControlsReady,
} from "@/server/recurrences";

export const metadata = { title: "Recurrentes | Finanzas personales" };
export const dynamic = "force-dynamic";

const frequencies = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};
const statuses = {
  active: "Activa",
  paused: "Pausada",
  finished: "Finalizada",
};

type PeriodStatus = TrackedPeriod["status"];
const periodTones: Record<PeriodStatus, "good" | "warning" | "neutral"> = {
  expected: "neutral",
  partial: "warning",
  completed: "good",
  skipped: "neutral",
};
const periodDots: Record<PeriodStatus, string> = {
  expected: "",
  partial: "is-warning",
  completed: "is-good",
  skipped: "",
};

function periodLabels(kind: MovementKind): Record<PeriodStatus, string> {
  return kind === "income"
    ? {
        expected: "Sin cobro confirmado",
        partial: "Cobro parcial",
        completed: "Cobrado completo",
        skipped: "No corresponde cobrar",
      }
    : {
        expected: "Sin pago confirmado",
        partial: "Pago parcial",
        completed: "Pagado",
        skipped: "No corresponde pagar",
      };
}

type Definition = Awaited<ReturnType<typeof listRecurrences>>[number];
type Loaded = Definition & {
  latestIndex: number;
  start: number;
  next: number;
  periods: TrackedPeriod[];
  latestPeriod: TrackedPeriod | null;
};

const description =
  "Gastos e ingresos que se repiten, con seguimiento de cada período.";

export default async function RecurrencesPage({
  searchParams,
}: PageProps<"/recurrentes">) {
  const today = bankReferenceToday();
  const { serie, hasta } = await searchParams;
  const focus =
    typeof serie === "string" && movementUuid.test(serie)
      ? serie.toLowerCase()
      : null;
  const offset =
    typeof hasta === "string" && /^\d{1,6}$/.test(hasta) ? Number(hasta) : null;
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await recurrencesReady(client)))
        return {
          message:
            "Las recurrencias estarán disponibles cuando se actualice la base de datos.",
        };
      const tracking = await recurrenceTrackingReady(client);
      const sharing = tracking && (await recurringSharesReady(client));
      const definitions = await listRecurrences(
        client,
        ownerId,
        today,
        tracking,
        sharing,
      );
      const controls =
        tracking && (await recurrenceSeriesControlsReady(client));
      const cards =
        tracking && definitions.some(({ kind }) => kind === "expense")
          ? (await listCards(client, ownerId)).filter(
              ({ archived, kind }) => !archived && kind === "credit",
            )
          : [];
      // P-06: el detalle muestra una sola serie: la indicada por `serie` o, si
      // no hay una válida, la primera de la lista. Las demás solo cargan su
      // último período (para la etiqueta de estado de la lista).
      const selectedId = definitions.some(({ id }) => id === focus)
        ? focus
        : (definitions[0]?.id ?? null);
      const recurrences: Loaded[] = [];
      for (const series of definitions) {
        const selected = series.id === selectedId;
        const latestIndex = tracking ? latestTrackedIndex(series, today) : -1;
        const start =
          selected && offset !== null && series.id === focus
            ? Math.min(offset, latestIndex)
            : latestIndex;
        const latestPage = trackedPeriodPage(series, latestIndex);
        const { indices, next } = selected
          ? trackedPeriodPage(series, start)
          : { indices: latestPage.indices.slice(0, 1), next: latestPage.next };
        const dueDay =
          series.changes.findLast((change) => change.action === "due-day")
            ?.dueDay ?? series.dueDay;
        const periods = await trackedPeriods(client, ownerId, series, indices);
        const latestPeriod =
          !selected || start === latestIndex
            ? (periods[0] ?? null)
            : ((
                await trackedPeriods(
                  client,
                  ownerId,
                  series,
                  latestPage.indices.slice(0, 1),
                )
              )[0] ?? null);
        recurrences.push({
          ...series,
          dueDay,
          latestIndex,
          start,
          next,
          periods,
          latestPeriod,
        });
      }
      return {
        recurrences,
        selectedId,
        tracking,
        controls,
        cards,
        people: sharing ? await listPeople(client, ownerId) : null,
        categories: await listCatalogCategories(client, ownerId),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      message: "No pudimos cargar tus recurrencias. Volvé a intentarlo.",
      retry: true,
    };
  });

  const data = "recurrences" in result && result.recurrences ? result : null;
  const selected =
    data?.recurrences.find(({ id }) => id === data.selectedId) ?? null;

  return (
    <FinanceShell current="recurrentes">
      <Screen>
        <PageHead
          eyebrow="Planificación"
          title="Recurrentes"
          description={description}
        />
        {data ? (
          <>
            <details className="gs-creator" open={!data.recurrences.length}>
              <summary className={buttonClass("primary")}>
                <Icon name="plus" duotone={false} className="size-4" />
                Nueva recurrencia
              </summary>
              <RecurrenceForm
                today={today}
                categories={data.categories}
                frequencies={frequencies}
                people={data.people}
              />
            </details>
            {!data.tracking && data.recurrences.length > 0 && (
              <PageNotice
                tone="info"
                message="El seguimiento estará disponible cuando se actualice la base de datos."
              />
            )}
            {selected ? (
              <div className="gs-grid">
                <div className="gs-span-5 gs-sticky">
                  <SeriesList
                    recurrences={data.recurrences}
                    selectedId={selected.id}
                    today={today}
                  />
                </div>
                <div className="gs-span-7">
                  <SeriesDetail
                    key={selected.id}
                    series={selected}
                    tracking={data.tracking}
                    controls={data.controls}
                    people={data.people}
                    cards={data.cards}
                    today={today}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                icon="recurring"
                title="Todavía no tenés recurrencias"
              >
                Para conceptos que se repiten, como alquiler o sueldo. Cada
                período se confirma con un movimiento real; nada se registra
                solo.
              </EmptyState>
            )}
          </>
        ) : (
          <PageNotice
            tone={"retry" in result ? "critical" : "info"}
            message={("message" in result && result.message) || ""}
            retryHref={"retry" in result ? "/recurrentes" : undefined}
          />
        )}
      </Screen>
    </FinanceShell>
  );
}

function dateSummary(series: Loaded, today: string) {
  const mode =
    series.dateMode === "none"
      ? "Sin fecha"
      : series.dateMode === "approximate"
        ? "Fecha aproximada"
        : series.dueDay === null
          ? "Cada siete días"
          : `vence el día ${series.dueDay}`;
  return series.firstPeriod > today
    ? `${mode} · Comienza el ${formatBankReference(series.firstPeriod)}`
    : mode;
}

function SeriesList({
  recurrences,
  selectedId,
  today,
}: {
  recurrences: Loaded[];
  selectedId: string;
  today: string;
}) {
  return (
    <section className="lab-panel" aria-labelledby="recurrencias">
      <header className="lab-panel__head">
        <h2 id="recurrencias" className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="recurring" className="size-4.5" />
          </span>
          Recurrencias
        </h2>
        <span className="lab-tag lab-tag--neutral">{recurrences.length}</span>
      </header>
      <ul aria-label="Recurrencias guardadas" className="gs-rows gs-pick">
        {recurrences.map((series) => {
          const income = series.kind === "income";
          const detail = [
            frequencies[series.frequency],
            dateSummary(series, today),
            series.category,
            series.usualShares.length > 0 ? "compartida" : null,
          ].filter(Boolean);
          return (
            <li
              key={series.id}
              aria-current={series.id === selectedId ? "true" : undefined}
            >
              <span
                className={`lab-kind lab-kind--${series.kind}`}
                aria-hidden="true"
              >
                <Icon name={series.kind} duotone={false} className="size-4" />
              </span>
              <div className="gs-row__main">
                <p className="gs-row__title">
                  <Link
                    href={`/recurrentes?serie=${series.id}#serie-${series.id}`}
                  >
                    {series.concept}
                  </Link>
                </p>
                <p className="gs-row__sub">{detail.join(" · ")}</p>
              </div>
              <div className="gs-row__aside">
                <span
                  className={`gs-row__amount ${series.referenceAmount ? (income ? "is-positive" : "is-negative") : ""}`}
                >
                  {series.referenceAmount
                    ? `${income ? "+" : "−"}${formatBankAmount({
                        amount: series.referenceAmount,
                        currency: series.currency,
                      })}`
                    : `Sin importe · ${series.currency}`}
                </span>
                <span className="gs-row__tags">
                  {series.status !== "active" && (
                    <StateTag tone="neutral">
                      {statuses[series.status]}
                    </StateTag>
                  )}
                  {series.latestPeriod && (
                    <StateTag tone={periodTones[series.latestPeriod.status]}>
                      {periodLabels(series.kind)[series.latestPeriod.status]}
                    </StateTag>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SeriesDetail({
  series,
  tracking,
  controls,
  people,
  cards,
  today,
}: {
  series: Loaded;
  tracking: boolean;
  controls: boolean;
  people: Awaited<ReturnType<typeof listPeople>> | null;
  cards: Awaited<ReturnType<typeof listCards>>;
  today: string;
}) {
  const title = `detalle-${series.id}`;
  return (
    <section
      id={`serie-${series.id}`}
      className="lab-panel gs-series"
      aria-labelledby={title}
    >
      <header className="gs-series__head">
        <h2 id={title} className="gs-series__title">
          <span
            className={`lab-kind lab-kind--${series.kind}`}
            aria-hidden="true"
          >
            <Icon name={series.kind} duotone={false} className="size-4" />
          </span>
          {series.concept}
        </h2>
        <span className="flex flex-wrap items-center gap-2">
          <span className="lab-muted text-xs">
            {series.kind === "income" ? "Ingreso" : "Gasto"} ·{" "}
            {frequencies[series.frequency]}
          </span>
          <StateTag tone={series.status === "active" ? "good" : "neutral"}>
            {statuses[series.status]}
          </StateTag>
        </span>
      </header>
      {controls && series.status !== "finished" && (
        <RecurrenceLifecycleForm
          seriesId={series.id}
          paused={series.status === "paused"}
          dueDay={series.dueDay}
          effectiveMonth={followingRecurrenceMonth(today)}
          version={series.version}
        />
      )}
      {series.status === "paused" && (
        <p role="status" className="b-notice b-notice--info">
          Serie pausada. Podés gestionar los períodos previos. Al reanudarla, se
          programarán los próximos períodos.
        </p>
      )}
      <dl className="gs-review">
        <div>
          <dt>Primer período</dt>
          <dd>
            {recurrencePeriodLabel(series.first.key)} · Comienza el{" "}
            {formatBankReference(series.firstPeriod)}
          </dd>
        </div>
        {series.endDate && (
          <div>
            <dt>Fecha final</dt>
            <dd>{formatBankReference(series.endDate)}</dd>
          </div>
        )}
        <div>
          <dt>Importe de referencia</dt>
          <dd>
            {series.referenceAmount
              ? formatBankAmount({
                  amount: series.referenceAmount,
                  currency: series.currency,
                })
              : `Sin importe · ${series.currency}`}
          </dd>
        </div>
        <div>
          <dt>Vencimiento habitual</dt>
          <dd>
            {series.dateMode === "none"
              ? "Sin fecha"
              : series.dateMode === "approximate"
                ? "Fecha aproximada"
                : series.dueDay === null
                  ? "Cada siete días desde el inicio"
                  : `Día ${series.dueDay}`}
          </dd>
        </div>
        {series.usualShares.length > 0 && (
          <div>
            <dt>Compartida · reparto habitual</dt>
            <dd>
              {series.usualShares
                .map(
                  ({ name, percentage }) =>
                    `${name} · ${percentage.replace(/\.?0+$/, "").replace(".", ",")} %`,
                )
                .join(" · ")}
            </dd>
          </div>
        )}
        {series.category && (
          <div>
            <dt>Categoría</dt>
            <dd>{series.category}</dd>
          </div>
        )}
        {!tracking && series.latest && (
          <div>
            <dt>Último período previsto</dt>
            <dd>
              {recurrencePeriodLabel(series.latest.key)} ·{" "}
              {series.kind === "income"
                ? "Sin cobro confirmado"
                : "Sin pago confirmado"}
              {series.latest.dueOn &&
                ` · Vence el ${formatBankReference(series.latest.dueOn)}`}
            </dd>
          </div>
        )}
      </dl>
      {series.note && <p className="gs-series__note">{series.note}</p>}
      {series.periods.length > 0 && (
        <section
          className="grid gap-3"
          aria-label={`Períodos de ${series.concept}`}
        >
          <h3 className="gs-series__section">Seguimiento por período</h3>
          <ul className="gs-timeline">
            {series.periods.map((period) => (
              <li
                key={period.index}
                id={`periodo-${series.id}-${period.index}`}
              >
                <span
                  className={`gs-timeline__dot ${periodDots[period.status]}`}
                  aria-hidden="true"
                />
                <div className="gs-period">
                  <PeriodSummary
                    period={period}
                    kind={series.kind}
                    currency={series.currency}
                  />
                  <RecurrenceSettlementForm
                    seriesId={series.id}
                    olderCursor={
                      series.start === series.latestIndex
                        ? series.next
                        : series.latestIndex
                    }
                    period={period}
                    others={series.periods.filter(
                      ({ index, status }) =>
                        index !== period.index &&
                        (status === "expected" || status === "partial"),
                    )}
                    currency={series.currency}
                    kind={series.kind}
                    today={today}
                    usualShares={series.usualShares}
                    people={people ?? []}
                    cards={cards
                      .filter(({ currencies }) =>
                        currencies.some(
                          ({ currency }) => currency === series.currency,
                        ),
                      )
                      .map(({ id, name }) => ({ id, name }))}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="gs-pager">
            {series.start < series.latestIndex && (
              <Link
                className={historyButton}
                href={`/recurrentes?serie=${series.id}#serie-${series.id}`}
              >
                Períodos más recientes
              </Link>
            )}
            {series.next >= 0 && (
              <Link
                className={historyButton}
                href={`/recurrentes?serie=${series.id}&hasta=${series.next}#serie-${series.id}`}
              >
                Períodos anteriores
              </Link>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

function PeriodSummary({
  period,
  kind,
  currency,
}: {
  period: TrackedPeriod;
  kind: MovementKind;
  currency: Currency;
}) {
  const income = kind === "income";
  return (
    <>
      <div className="gs-period__head">
        <h4 className="gs-period__title">
          {recurrencePeriodLabel(period.key)}
        </h4>
        <StateTag tone={periodTones[period.status]}>
          {periodLabels(kind)[period.status]}
        </StateTag>
      </div>
      <dl className="gs-facts">
        {period.dueOn && (
          <div>
            <dt>Vencimiento previsto</dt>
            <dd>{formatBankReference(period.dueOn)}</dd>
          </div>
        )}
        {period.referenceAmount && (
          <div>
            <dt>Referencia del período</dt>
            <dd>
              {formatBankAmount({ amount: period.referenceAmount, currency })}
            </dd>
          </div>
        )}
        <div>
          <dt>{income ? "Recibido" : "Pagado a la fecha"}</dt>
          <dd>{formatBankAmount({ amount: period.recorded, currency })}</dd>
        </div>
        {period.status !== "skipped" && period.confirmedTotal && (
          <div>
            <dt>
              {period.finalized ? "Total definitivo" : "Total confirmado"}
            </dt>
            <dd>
              {formatBankAmount({ amount: period.confirmedTotal, currency })}
            </dd>
          </div>
        )}
        {period.remaining && period.remaining !== "0.0000" && (
          <div>
            <dt>Restante</dt>
            <dd>{formatBankAmount({ amount: period.remaining, currency })}</dd>
          </div>
        )}
      </dl>
      {period.events.length > 0 && (
        <ul className="gs-linked" aria-label="Movimientos vinculados">
          {period.events.map(({ id, amount, effectiveOn, method, shared }) => (
            <li key={id}>
              <Link className="lab-link" href={`/historial/movimientos/${id}`}>
                {formatBankReference(effectiveOn)} ·{" "}
                {formatBankAmount({ amount, currency })} ·{" "}
                {movementDisplayMethods[method]}
                {shared && " · Ver reparto y cobros"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
