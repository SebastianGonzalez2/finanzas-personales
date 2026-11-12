import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { SavingsFundCatalog } from "@/components/savings-fund-catalog";
import { Card } from "@/components/ui/card";
import { CurrencyValue } from "@/components/current-currency-value";
import {
  HistoryField,
  historyButton,
  historyControl,
} from "@/components/history-fields";
import { bankCurrencies, bankReferenceToday } from "@/domain/bank-balances";
import { isCurrency } from "@/domain/exchange-rates";
import {
  currentCurrencyValue,
  displayCurrency,
  exchangeRatesReady,
} from "@/server/exchange-rates";
import { savingsFundsReady } from "@/server/bank-balances";
import {
  fundLifecycleReady,
  listFundAvailability,
  listFundClosures,
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

export default async function SavingsFundsPage({
  searchParams,
}: PageProps<"/fondos">) {
  const { display } = await searchParams;
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  const result = await withGoogleOwner(request, async (client, ownerId) => {
    if (!(await savingsFundsReady(client)))
      return {
        message:
          "Los fondos estarán disponibles cuando se actualice la base de datos.",
      };
    const contributions = await contributionPlansReady(client);
    if (contributions) await processDueContributions(client, ownerId);
    const funds = await listSavingsFunds(client, ownerId);
    return {
      funds,
      closures: funds.some(({ status }) => status === "closed")
        ? await listFundClosures(client, ownerId)
        : [],
      lifecycleReady: await fundLifecycleReady(client),
      today: bankReferenceToday(),
      availability: (await reserveEffectsReady(client))
        ? await listFundAvailability(client, ownerId)
        : null,
      contributions: contributions
        ? {
            plans: await listContributionPlans(client, ownerId),
            periods: await listContributionPeriods(client, ownerId),
            changes: await listContributionChanges(client, ownerId),
          }
        : null,
    };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { message: "No pudimos cargar tus fondos. Volvé a intentarlo." };
  });
  const fundsData = "funds" in result && result.funds ? result : null;
  const equivalence = fundsData?.funds.some(({ status }) => status !== "closed")
    ? await withGoogleOwner(request, async (client, ownerId) => {
        if (!(await exchangeRatesReady(client))) return null;
        const currency = isCurrency(display)
          ? display
          : await displayCurrency(client, ownerId);
        const amounts = fundsData.funds
          .filter(({ status }) => status !== "closed")
          .map(({ currency, reservedAmount }) => ({
            currency,
            amount: reservedAmount,
          }));
        return {
          currency,
          value: await currentCurrencyValue(
            client,
            amounts,
            currency,
            fundsData.today,
          ),
        };
      }).catch(() => null)
    : null;

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
        {equivalence && (
          <Card className="items-start gap-3 p-4">
            <h2 className="font-medium">Equivalencia del total reservado</h2>
            <form
              action="/fondos"
              method="get"
              className="flex flex-wrap items-end gap-2"
            >
              <HistoryField label="Moneda de visualización">
                <select
                  name="display"
                  defaultValue={equivalence.currency}
                  className={historyControl}
                >
                  {bankCurrencies.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </HistoryField>
              <button type="submit" className={historyButton}>
                Ver equivalencia
              </button>
            </form>
            <CurrencyValue
              currency={equivalence.currency}
              value={equivalence.value}
            />
          </Card>
        )}
        {"funds" in result && result.funds ? (
          <SavingsFundCatalog
            funds={result.funds}
            closures={result.closures}
            availability={result.availability}
            contributions={result.contributions}
            lifecycleReady={result.lifecycleReady}
            today={result.today}
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
