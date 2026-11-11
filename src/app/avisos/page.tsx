import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { ContributionNotice } from "@/components/fund-contributions";
import { FundTargetMessage } from "@/components/fund-target-notice";
import { Card } from "@/components/ui/card";
import { bankReferenceToday } from "@/domain/bank-balances";
import { contributionPending } from "@/domain/contribution-plans";
import { fundTargetNotices } from "@/domain/savings-funds";
import { withGoogleOwner } from "@/server/google-auth";
import {
  contributionPlansReady,
  listContributionPeriods,
  listContributionPlans,
  processDueContributions,
} from "@/server/scheduled-contributions";
import { listSavingsFunds } from "@/server/savings-funds";

export const metadata = { title: "Avisos | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const today = bankReferenceToday();
  const notices = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await contributionPlansReady(client)))
        return { periods: [], funds: [], plans: [] };
      await processDueContributions(client, ownerId);
      return {
        periods: (await listContributionPeriods(client, ownerId)).filter(
          ({ reason }) => reason,
        ),
        funds: await listSavingsFunds(client, ownerId),
        plans: await listContributionPlans(client, ownerId),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });
  const periods = notices?.periods;
  const planIds = new Set(notices?.plans.map(({ fundId }) => fundId));
  const pending = periods?.filter(contributionPending) ?? [];
  const resolved =
    periods?.filter((period) => !contributionPending(period)) ?? [];
  return (
    <FinanceShell current="avisos">
      <section className="grid gap-4">
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Avisos
        </h1>
        {!periods && (
          <p role="status">No pudimos cargar tus avisos. Volvé a intentarlo.</p>
        )}
        {periods && pending.length === 0 && (
          <p>No tenés aportaciones pendientes.</p>
        )}
        {notices?.funds.flatMap((fund) => {
          const { pausedByTarget, reached, overdue } = fundTargetNotices(
            fund,
            today,
          );
          return [
            pausedByTarget && (
              <Card key={`meta-${fund.id}`} className="gap-2 p-4 text-sm">
                <FundTargetMessage fund={fund} today={today} kind="pause" />
                <a
                  className="min-h-11 content-center font-semibold underline"
                  href={`/fondos#${reached ? "fondo" : "plan"}-${fund.id}`}
                >
                  {reached
                    ? "Aumentar meta"
                    : planIds.has(fund.id)
                      ? "Reactivar aportaciones"
                      : "Programar aportaciones"}
                </a>
              </Card>
            ),
            overdue && (
              <Card
                key={`plazo-${fund.id}`}
                className="gap-2 border-amber-500/70 p-4 text-sm"
              >
                <p>{fund.name}</p>
                <FundTargetMessage fund={fund} today={today} kind="deadline" />
                <a
                  className="min-h-11 content-center font-semibold underline"
                  href={`/fondos#fondo-${fund.id}`}
                >
                  Revisar meta, fecha y aportaciones
                </a>
              </Card>
            ),
          ];
        })}
        {pending.length > 0 && (
          <ul className="grid gap-2">
            {pending.map((period) => (
              <li key={period.id}>
                <Card className="gap-2 border-amber-500/70 p-4 text-sm">
                  <ContributionNotice period={period} />
                  <a
                    className="min-h-11 content-center font-semibold underline"
                    href={`/fondos#aporte-${period.id}`}
                  >
                    Ver aportación de {period.fundName}
                  </a>
                </Card>
              </li>
            ))}
          </ul>
        )}
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
      </section>
    </FinanceShell>
  );
}
