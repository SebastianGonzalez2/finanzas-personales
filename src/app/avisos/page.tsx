import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { ContributionNotice } from "@/components/fund-contributions";
import {
  BudgetThresholdNotice,
  GoalDueNotice,
  NoticeCard,
} from "@/components/notices";
import { bankReferenceToday } from "@/domain/bank-balances";
import { contributionPending } from "@/domain/contribution-plans";
import { budgetAlerts, goalAlerts } from "@/domain/notices";
import { withGoogleOwner } from "@/server/google-auth";
import { budgetsReady, listBudgets } from "@/server/budgets";
import { savingsFundsReady } from "@/server/bank-balances";
import { listSavingsFunds } from "@/server/savings-funds";
import {
  contributionPlansReady,
  listContributionPeriods,
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
      if (await contributionPlansReady(client)) {
        await processDueContributions(client, ownerId);
        periods = (await listContributionPeriods(client, ownerId)).filter(
          ({ reason }) => reason,
        );
      }
      return {
        today,
        periods,
        budgets: (await budgetsReady(client))
          ? await listBudgets(client, ownerId, month)
          : null,
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
  const budgets = result ? (result.budgets ?? []) : [];
  const funds = result ? (result.funds ?? []) : [];
  const thresholdAlerts = result
    ? budgetAlerts(budgets, result.today.slice(0, 7))
    : [];
  const overdueGoals = result ? goalAlerts(funds, result.today) : [];
  const quiet =
    pending.length === 0 &&
    thresholdAlerts.length === 0 &&
    overdueGoals.length === 0;

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
            {thresholdAlerts.length > 0 && (
              <section
                aria-labelledby="avisos-presupuestos"
                className="grid gap-2"
              >
                <h2 id="avisos-presupuestos" className="font-semibold">
                  Presupuestos
                </h2>
                <ul className="grid gap-2">
                  {thresholdAlerts.map(({ budget, state, percent }) => (
                    <li key={budget.id}>
                      <NoticeCard
                        level={state}
                        href="/presupuestos"
                        linkLabel="Ver presupuestos"
                      >
                        <p className="font-medium">
                          {budget.categoryName} · {budget.currency}
                        </p>
                        <BudgetThresholdNotice
                          categoryName={budget.categoryName}
                          percent={percent}
                          state={state}
                        />
                      </NoticeCard>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {overdueGoals.length > 0 && (
              <section aria-labelledby="avisos-metas" className="grid gap-2">
                <h2 id="avisos-metas" className="font-semibold">
                  Metas de fondos
                </h2>
                <ul className="grid gap-2">
                  {overdueGoals.map(({ fund }) => (
                    <li key={fund.id}>
                      <NoticeCard
                        level="danger"
                        href="/fondos"
                        linkLabel="Ver fondos"
                      >
                        <p className="font-medium">
                          {fund.name} · {fund.currency}
                        </p>
                        <GoalDueNotice fund={fund} />
                      </NoticeCard>
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
