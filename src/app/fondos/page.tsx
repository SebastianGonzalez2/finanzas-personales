import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FinanceShell } from "@/components/finance-shell";
import { SavingsFundCatalog } from "@/components/savings-fund-catalog";
import type { CurrentCurrencyValue } from "@/components/current-currency-value";
import { ExchangeRateDetails } from "@/components/exchange-rate-details";
import { Kpi, PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
import { buttonClass } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import {
  bankCurrencies,
  bankReferenceToday,
  formatBankAmount,
} from "@/domain/bank-balances";
import { isCurrency } from "@/domain/exchange-rates";
import type { Currency } from "@/domain/money";
import type { FundAvailability } from "@/domain/savings-funds";
import {
  currentCurrencyValue,
  displayCurrency,
  exchangeRatesReady,
} from "@/server/exchange-rates";
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
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

const fundsDescription =
  "Organizá reservas virtuales por moneda sin mover el saldo bancario.";

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
    return {
      message: "No pudimos cargar tus fondos. Volvé a intentarlo.",
      retry: true,
    };
  });
  const fundsData = "funds" in result && result.funds ? result : null;
  const amounts = (fundsData?.funds ?? [])
    .filter(({ status }) => status !== "closed")
    .map(({ currency, reservedAmount }) => ({
      currency,
      amount: reservedAmount,
    }));
  const today = fundsData?.today ?? bankReferenceToday();
  const currency = amounts.length
    ? await withGoogleOwner(request, async (client, ownerId) => {
        if (!(await exchangeRatesReady(client))) return null;
        return isCurrency(display) ? display : displayCurrency(client, ownerId);
      }).catch(() => null)
    : null;
  if (
    currency &&
    amounts.some(
      (item) => item.currency !== currency && /[1-9]/.test(item.amount),
    )
  )
    await refreshOwnerReferences(request, [today], today).catch(
      () => undefined,
    );

  const equivalence = currency
    ? await withGoogleOwner(request, async (client) => ({
        currency,
        value: await currentCurrencyValue(client, amounts, currency, today),
      })).catch(() => null)
    : null;

  return (
    <FinanceShell current="fondos">
      <Screen>
        {fundsData ? (
          <SavingsFundCatalog
            funds={fundsData.funds}
            closures={fundsData.closures}
            availability={fundsData.availability}
            contributions={fundsData.contributions}
            lifecycleReady={fundsData.lifecycleReady}
            today={fundsData.today}
            kpis={
              <FundKpis
                availability={fundsData.availability}
                equivalence={
                  equivalence && (
                    <EquivalenceKpi
                      currency={equivalence.currency}
                      value={equivalence.value}
                    />
                  )
                }
              />
            }
          />
        ) : (
          <>
            <PageHead
              eyebrow="Planificación"
              title="Fondos de ahorro"
              description={fundsDescription}
            />
            <PageNotice
              tone={"retry" in result ? "critical" : "info"}
              message={("message" in result && result.message) || ""}
              retryHref={"retry" in result ? "/fondos" : undefined}
            />
          </>
        )}
      </Screen>
    </FinanceShell>
  );
}

const currencyNames: Record<Currency, string> = {
  UYU: "pesos uruguayos",
  USD: "dólares",
  EUR: "euros",
};

// M-01 — Los textos de ayuda se contrastaron con los cálculos reales.
// «Disponible libre» = saldo bancario calculado − suma de lo reservado en los
// fondos, por moneda (no descuenta obligaciones pendientes). La equivalencia
// suma lo reservado en fondos no cerrados con cotizaciones de referencia y se
// expresa en la moneda de visualización elegida, no siempre en UYU.
function EquivalenceKpi({
  currency,
  value,
}: {
  currency: Currency;
  value: CurrentCurrencyValue;
}) {
  return (
    <Kpi
      hero
      icon="funds"
      label="Equivalencia del total reservado"
      value={
        value.amount === null
          ? value.missing.length
            ? "Equivalencia no disponible"
            : "Sin datos"
          : `≈ ${formatBankAmount({ currency, amount: value.amount })}`
      }
      sub="Cotizaciones de referencia · no convierte tu dinero"
      help={{
        label: "Ayuda: Equivalencia del total reservado",
        text: `Es el valor aproximado, en ${currencyNames[currency]}, de todo el dinero reservado en tus fondos de ahorro vigentes (activos o pausados), incluyendo pesos, dólares y euros. Se calcula con las cotizaciones de referencia; no convierte tu dinero.`,
      }}
      extra={
        <div className="gs-kpi__extra">
          <form action="/fondos" method="get" className="gs-kpi__form">
            <Field label="Moneda de visualización">
              <Select name="display" defaultValue={currency}>
                {bankCurrencies.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </Select>
            </Field>
            <button type="submit" className={buttonClass("outline")}>
              Ver equivalencia
            </button>
          </form>
          <ExchangeRateDetails
            target={currency}
            quotes={value.quotes}
            missing={value.missing}
            live
          />
        </div>
      }
    />
  );
}

function FundKpis({
  availability,
  equivalence,
}: {
  availability: FundAvailability[] | null;
  equivalence: ReactNode;
}) {
  if (!availability && !equivalence) return null;
  return (
    <div className="gs-kpis" role="group" aria-label="Totales de tus fondos">
      {equivalence}
      {availability &&
        bankCurrencies.map((currency) => {
          const balance = availability.find(
            (entry) => entry.currency === currency,
          );
          return (
            <Kpi
              key={currency}
              label={`Disponible libre · ${currency}`}
              value={balance ? formatBankAmount(balance) : "Sin saldo bancario"}
              sub={
                balance
                  ? undefined
                  : "Todavía no configuraste el saldo bancario"
              }
              help={{
                label: `Ayuda: Disponible libre en ${currencyNames[currency]}`,
                text: `Es el dinero en ${currencyNames[currency]} que tenés en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro.`,
              }}
            />
          );
        })}
    </div>
  );
}
