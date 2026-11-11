import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { RecurrenceSettlementForm } from "@/components/recurrence-settlement-form";
import { historyButton } from "@/components/history-fields";
import { RecurrenceForm } from "@/components/recurrence-form";
import { RecurrenceLifecycleForm } from "@/components/recurrence-lifecycle-form";
import { Card } from "@/components/ui/card";
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
import { listMovementCategories } from "@/server/movements";
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
      const recurrences = [];
      for (const series of definitions) {
        const latestIndex = tracking ? latestTrackedIndex(series, today) : -1;
        const start =
          series.id === focus && offset !== null
            ? Math.min(offset, latestIndex)
            : latestIndex;
        const { indices, next } = trackedPeriodPage(series, start);
        const dueDay =
          series.changes.findLast((change) => change.action === "due-day")
            ?.dueDay ?? series.dueDay;
        recurrences.push({
          ...series,
          dueDay,
          latestIndex,
          start,
          next,
          periods: await trackedPeriods(client, ownerId, series, indices),
        });
      }
      return {
        recurrences,
        tracking,
        controls,
        cards,
        people: sharing ? await listPeople(client, ownerId) : null,
        categories: await listMovementCategories(client, ownerId),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      message: "No pudimos cargar tus recurrencias. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="recurrentes">
      <div className="grid gap-4">
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Recurrentes
        </h1>
        {"recurrences" in result && result.recurrences ? (
          <>
            <RecurrenceForm
              today={today}
              categories={result.categories}
              frequencies={frequencies}
              people={result.people}
            />
            {!result.tracking && result.recurrences.length > 0 && (
              <p role="status" className="text-sm">
                El seguimiento estará disponible cuando se actualice la base de
                datos.
              </p>
            )}
            {result.recurrences.length ? (
              <ul aria-label="Recurrencias guardadas" className="grid gap-3">
                {result.recurrences.map((series) => (
                  <li key={series.id} id={`serie-${series.id}`}>
                    <Card className="gap-2 p-4 break-words">
                      <h2 className="text-lg font-semibold">
                        {series.concept}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {series.kind === "income" ? "Ingreso" : "Gasto"} ·{" "}
                        {frequencies[series.frequency]} ·{" "}
                        {statuses[series.status]}
                      </p>
                      {result.controls && series.status !== "finished" && (
                        <RecurrenceLifecycleForm
                          seriesId={series.id}
                          paused={series.status === "paused"}
                          dueDay={series.dueDay}
                          effectiveMonth={followingRecurrenceMonth(today)}
                          version={series.version}
                        />
                      )}
                      {series.status === "paused" && (
                        <p role="status" className="text-sm">
                          Serie pausada. Podés gestionar los períodos previos.
                          Al reanudarla, se programarán los próximos períodos.
                        </p>
                      )}
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt>Primer período</dt>
                          <dd>
                            {series.first.key} · Comienza el{" "}
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
                        {!result.tracking && series.latest && (
                          <div>
                            <dt>Último período previsto</dt>
                            <dd>
                              {series.latest.key} ·{" "}
                              {series.kind === "income"
                                ? "Sin cobro confirmado"
                                : "Sin pago confirmado"}
                              {series.latest.dueOn &&
                                ` · Vence el ${formatBankReference(series.latest.dueOn)}`}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {series.note && (
                        <p className="text-sm whitespace-pre-wrap">
                          {series.note}
                        </p>
                      )}
                      {series.periods.length > 0 && (
                        <section
                          className="mt-2 grid gap-3 border-t pt-3"
                          aria-label={`Períodos de ${series.concept}`}
                        >
                          <h3 className="font-semibold">
                            Seguimiento por período
                          </h3>
                          <ul className="grid gap-3">
                            {series.periods.map((period) => (
                              <li
                                key={period.index}
                                id={`periodo-${series.id}-${period.index}`}
                                className="grid scroll-mt-4 gap-3 rounded-lg border p-3"
                              >
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
                                      (status === "expected" ||
                                        status === "partial"),
                                  )}
                                  currency={series.currency}
                                  kind={series.kind}
                                  today={today}
                                  usualShares={series.usualShares}
                                  people={result.people ?? []}
                                  cards={result.cards
                                    .filter(({ currencies }) =>
                                      currencies.some(
                                        ({ currency }) =>
                                          currency === series.currency,
                                      ),
                                    )
                                    .map(({ id, name }) => ({ id, name }))}
                                />
                              </li>
                            ))}
                          </ul>
                          <div className="flex flex-wrap gap-2">
                            {series.start < series.latestIndex && (
                              <Link
                                className={historyButton}
                                href={`/recurrentes#serie-${series.id}`}
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
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">Todavía no tenés recurrencias.</p>
            )}
          </>
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
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
  const labels = income
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
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">{period.key}</h4>
        <p className="text-sm font-medium">{labels[period.status]}</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
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
        <ul className="grid gap-1 text-sm" aria-label="Movimientos vinculados">
          {period.events.map(({ id, amount, effectiveOn, method, shared }) => (
            <li key={id}>
              <Link className="underline" href={`/historial/movimientos/${id}`}>
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
