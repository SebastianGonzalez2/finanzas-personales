import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { ContributionNotice } from "@/components/fund-contributions";
import { Card } from "@/components/ui/card";
import { contributionPending } from "@/domain/contribution-plans";
import { withGoogleOwner } from "@/server/google-auth";
import {
  contributionPlansReady,
  listContributionPeriods,
  processDueContributions,
} from "@/server/scheduled-contributions";

export const metadata = { title: "Avisos | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const periods = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await contributionPlansReady(client))) return [];
      await processDueContributions(client, ownerId);
      return (await listContributionPeriods(client, ownerId)).filter(
        ({ reason }) => reason,
      );
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });
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
