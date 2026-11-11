import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { CardCycleAlerts } from "@/components/card-cycle-alerts";
import { ContributionNotice } from "@/components/fund-contributions";
import { FundTargetMessage } from "@/components/fund-target-notice";
import { BudgetThresholdNotice, NoticeCard } from "@/components/notices";
import { DueNoticeList } from "@/components/due-notices";
import { PushPreference } from "@/components/card-push-preference";
import { bankReferenceToday } from "@/domain/bank-balances";
import { contributionPending } from "@/domain/contribution-plans";
import { fundTargetNotices } from "@/domain/savings-funds";
import { withGoogleOwner } from "@/server/google-auth";
import { listBudgetNotices } from "@/server/budgets";
import { cardCyclesReady, listCardCycleAlerts } from "@/server/card-cycles";
import { cardPushConfig, cardPushReady } from "@/server/card-push";
import { savingsFundsReady } from "@/server/bank-balances";
import {
  listLoanDueNotices,
  listRecurrenceDueNotices,
} from "@/server/due-notices";
import { cardsReady, listCards } from "@/server/cards";
import { listSavingsFunds } from "@/server/savings-funds";
import {
  contributionPlansReady,
  listContributionPeriods,
  listContributionPlans,
  processDueContributions,
} from "@/server/scheduled-contributions";

export const metadata = { title: "Avisos | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      const today = bankReferenceToday();
      const month = today.slice(0, 7);
      let periods: Awaited<ReturnType<typeof listContributionPeriods>> = [];
      let plans: Awaited<ReturnType<typeof listContributionPlans>> = [];
      if (await contributionPlansReady(client)) {
        await processDueContributions(client, ownerId);
        periods = (await listContributionPeriods(client, ownerId)).filter(
          ({ reason }) => reason,
        );
        plans = await listContributionPlans(client, ownerId);
      }
      return {
        today,
        periods,
        plans,
        pushReady: await cardPushReady(client),
        budgetNotices: await listBudgetNotices(client, ownerId, month),
        cardAlerts:
          (await cardsReady(client)) && (await cardCyclesReady(client))
            ? await listCardCycleAlerts(
                client,
                ownerId,
                await listCards(client, ownerId),
                today,
              )
            : [],
        debtNotices: await listLoanDueNotices(client, ownerId, today),
        recurrenceNotices: await listRecurrenceDueNotices(
          client,
          ownerId,
          today,
        ),
        funds: (await savingsFundsReady(client))
          ? await listSavingsFunds(client, ownerId)
          : null,
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });

  const periods = result?.periods ?? [];
  const pending = periods.filter(contributionPending);
  const resolved = periods.filter((period) => !contributionPending(period));
  const funds = result ? (result.funds ?? []) : [];
  const thresholdAlerts = result?.budgetNotices ?? [];
  const cardAlerts = result?.cardAlerts ?? [];
  const debtNotices = result?.debtNotices ?? [];
  const recurrenceNotices = result?.recurrenceNotices ?? [];
  const today = result?.today ?? "";
  const planIds = new Set(result?.plans.map(({ fundId }) => fundId));
  const goals = funds
    .map((fund) => ({ fund, ...fundTargetNotices(fund, today) }))
    .filter(({ pausedByTarget, overdue }) => pausedByTarget || overdue);
  const quiet =
    pending.length === 0 &&
    thresholdAlerts.length === 0 &&
    goals.length === 0 &&
    cardAlerts.length === 0 &&
    debtNotices.length === 0 &&
    recurrenceNotices.length === 0;

  return (
    <FinanceShell current="avisos">
      <section className="grid gap-4">
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Avisos
        </h1>
        {!result && (
          <p role="status">No pudimos cargar tus avisos. Volvé a intentarlo.</p>
        )}
        {result && (
          <>
            {cardAlerts.length > 0 && (
              <CardCycleAlerts alerts={cardAlerts} today={today} />
            )}
            <DueNoticeList
              headingId="avisos-deudas"
              title="Deudas y préstamos"
              notices={debtNotices}
              emptyText="No hay vencimientos de deudas dentro de los próximos días según tus registros."
            />
            <DueNoticeList
              headingId="avisos-recurrentes"
              title="Recurrentes"
              notices={recurrenceNotices}
              emptyText="No hay vencimientos de recurrentes dentro de los próximos días según tu configuración."
            />
            {thresholdAlerts.length > 0 && (
              <section
                aria-labelledby="avisos-presupuestos"
                className="grid gap-2"
              >
                <h2 id="avisos-presupuestos" className="font-semibold">
                  Presupuestos
                </h2>
                <ul className="grid gap-2">
                  {thresholdAlerts.map(
                    ({
                      budgetId,
                      categoryName,
                      currency,
                      threshold,
                      percent,
                    }) => (
                      <li key={`${budgetId}-${threshold}`}>
                        <NoticeCard
                          level={threshold === 100 ? "danger" : "warning"}
                          href="/presupuestos"
                          linkLabel="Ver presupuestos"
                        >
                          <p className="font-medium">
                            {categoryName} · {currency}
                          </p>
                          <BudgetThresholdNotice
                            categoryName={categoryName}
                            percent={percent}
                            state={threshold === 100 ? "danger" : "warning"}
                          />
                        </NoticeCard>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            )}
            {goals.length > 0 && (
              <section aria-labelledby="avisos-metas" className="grid gap-2">
                <h2 id="avisos-metas" className="font-semibold">
                  Metas de fondos
                </h2>
                <ul className="grid gap-2">
                  {goals.map(({ fund, pausedByTarget, reached, overdue }) => (
                    <li key={fund.id} className="grid gap-2">
                      {pausedByTarget && (
                        <NoticeCard
                          level="warning"
                          href={`/fondos#${reached ? "fondo" : "plan"}-${fund.id}`}
                          linkLabel={
                            reached
                              ? "Aumentar meta"
                              : planIds.has(fund.id)
                                ? "Reactivar aportaciones"
                                : "Programar aportaciones"
                          }
                        >
                          <FundTargetMessage
                            fund={fund}
                            today={today}
                            kind="pause"
                          />
                        </NoticeCard>
                      )}
                      {overdue && (
                        <NoticeCard
                          level="warning"
                          href={`/fondos#fondo-${fund.id}`}
                          linkLabel="Revisar meta, fecha y aportaciones"
                        >
                          <p className="font-medium">
                            {fund.name} · {fund.currency}
                          </p>
                          <FundTargetMessage
                            fund={fund}
                            today={today}
                            kind="deadline"
                          />
                        </NoticeCard>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {pending.length > 0 && (
              <section
                aria-labelledby="avisos-aportaciones"
                className="grid gap-2"
              >
                <h2 id="avisos-aportaciones" className="font-semibold">
                  Aportaciones
                </h2>
                <ul className="grid gap-2">
                  {pending.map((period) => (
                    <li key={period.id}>
                      <NoticeCard
                        level="warning"
                        href={`/fondos#aporte-${period.id}`}
                        linkLabel={`Ver aportación de ${period.fundName}`}
                      >
                        <ContributionNotice period={period} />
                      </NoticeCard>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {quiet && <p>No tenés avisos nuevos.</p>}
            <PushPreference
              storageReady={result.pushReady}
              publicKey={
                result.pushReady ? (cardPushConfig()?.publicKey ?? null) : null
              }
            />
            {resolved.length > 0 && (
              <details className="space-y-3 rounded-lg border p-4">
                <summary className="cursor-pointer font-semibold">
                  Avisos resueltos
                </summary>
                <ul className="grid gap-3 text-sm">
                  {resolved.map((period) => (
                    <li key={period.id}>
                      <ContributionNotice period={period} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </FinanceShell>
  );
}
