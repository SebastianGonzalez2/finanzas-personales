import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { SavingsFundCatalog } from "@/components/savings-fund-catalog";
import { Card } from "@/components/ui/card";
import { bankReferenceToday } from "@/domain/bank-balances";
import { savingsFundsReady } from "@/server/bank-balances";
import {
  listFundAvailability,
  listSavingsFunds,
  reserveEffectsReady,
} from "@/server/savings-funds";
import { withGoogleOwner } from "@/server/google-auth";
import {
  contributionPlansReady,
  listContributionChanges,
  listContributionPeriods,
  listContributionPlans,
  processDueContributions,
} from "@/server/scheduled-contributions";

export const metadata = { title: "Fondos de ahorro | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function SavingsFundsPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await savingsFundsReady(client)))
        return {
          message:
            "Los fondos estarán disponibles cuando se actualice la base de datos.",
        };
      const contributions = await contributionPlansReady(client);
      if (contributions) await processDueContributions(client, ownerId);
      return {
        funds: await listSavingsFunds(client, ownerId),
        availability: (await reserveEffectsReady(client))
          ? await listFundAvailability(client, ownerId)
          : null,
        contributions: contributions
          ? {
              plans: await listContributionPlans(client, ownerId),
              periods: await listContributionPeriods(client, ownerId),
              changes: await listContributionChanges(client, ownerId),
              today: bankReferenceToday(),
            }
          : null,
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { message: "No pudimos cargar tus fondos. Volvé a intentarlo." };
  });

  return (
    <FinanceShell current="fondos">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Fondos de ahorro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organizá reservas virtuales por moneda sin mover el saldo bancario.
          </p>
        </header>
        {"funds" in result && result.funds ? (
          <SavingsFundCatalog
            funds={result.funds}
            availability={result.availability}
            contributions={result.contributions}
          />
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
