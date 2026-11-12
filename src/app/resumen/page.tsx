import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { DisplayCurrencySelector } from "@/components/display-currency-selector";
import { CurrencyValue } from "@/components/current-currency-value";
import { ExchangeRateDetails } from "@/components/exchange-rate-details";
import { Card } from "@/components/ui/card";
import {
  bankCurrencies,
  bankReferenceToday,
  formatBankAmount,
} from "@/domain/bank-balances";
import { listRefundTotals } from "@/server/refund-totals";
import {
  formatInstallmentPeriod,
  isInstallmentPeriod,
} from "@/domain/installments";
import {
  currentCurrencyValue,
  displayCurrency,
  exchangeRatesReady,
} from "@/server/exchange-rates";
import { summaryFlowFx } from "@/server/statistics";
import {
  bankReconciliationReady,
  listBankAvailability,
  listBankCheckpoints,
} from "@/server/bank-balances";
import { listFundSources } from "@/server/fund-coverage";
import { listCards } from "@/server/cards";
import { sharedExpensesReady } from "@/server/shared-expense-schema";
import { mixedPurchasesReady } from "@/server/mixed-purchases";
import { withGoogleOwner } from "@/server/google-auth";
import {
  installmentsReady,
  listMonthlyInstallments,
} from "@/server/installments";
import {
  creditOperationsReady,
  listMovementCategories,
  listMovementTotals,
  listRecentBankTransfers,
  listRecentMovements,
  movementAvailability,
} from "@/server/movements";

export const metadata = { title: "Resumen | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function SummaryPage({
  searchParams,
}: PageProps<"/resumen">) {
  const today = bankReferenceToday();
  const { month } = await searchParams;
  const period = isInstallmentPeriod(month) ? month : today.slice(0, 7);
  const monthStart = `${period}-01`;
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  const data = await withGoogleOwner(request, async (client, ownerId) => {
    const reconciliationReady = await bankReconciliationReady(client);
    const bankData = {
      currency: await displayCurrency(client, ownerId),
      balances: await listBankAvailability(
        client,
        ownerId,
        bankCurrencies,
        reconciliationReady,
      ),
      checkpoints: reconciliationReady
        ? await listBankCheckpoints(client, ownerId)
        : [],
      reconciliationReady,
    };
    const { readable, writable, transfers } =
      await movementAvailability(client);
    if (!readable)
      return {
        ...bankData,
        movementRegistrationReady: false,
        bankTransfersReady: false,
        bankTransfers: [],
        categories: [],
        creditCards: [],
        installmentsReady: false,
        sharedExpensesReady: false,
        monthlyInstallments: [],
        totals: [],
        refundTotals: [],
        expenses: [],
        incomes: [],
      };
    const plansReady = await installmentsReady(client);
    const cards = (await creditOperationsReady(client))
      ? (await listCards(client, ownerId)).filter(({ archived }) => !archived)
      : [];
    return {
      ...bankData,
      movementRegistrationReady: writable,
      bankTransfersReady: transfers,
      bankTransfers: transfers
        ? await listRecentBankTransfers(client, ownerId)
        : [],
      fundSources: writable ? await listFundSources(client, ownerId) : null,
      categories: writable ? await listMovementCategories(client, ownerId) : [],
      creditCards: cards.filter(({ kind }) => kind === "credit"),
      debitCards: (await mixedPurchasesReady(client))
        ? cards.filter(({ kind }) => kind === "debit")
        : undefined,
      installmentsReady: plansReady,
      sharedExpensesReady: await sharedExpensesReady(client),
      monthlyInstallments: plansReady
        ? await listMonthlyInstallments(client, ownerId, monthStart)
        : [],
      totals: await listMovementTotals(client, ownerId, monthStart),
      refundTotals: await listRefundTotals(client, ownerId, monthStart),
      expenses: await listRecentMovements(
        client,
        ownerId,
        "expense",
        plansReady,
      ),
      incomes: await listRecentMovements(client, ownerId, "income"),
    };
  }).catch(() => redirect("/auth/sign-in"));

  const fx = await withGoogleOwner(request, async (client, ownerId) => {
    if (!(await exchangeRatesReady(client))) return null;
    const available = await currentCurrencyValue(
      client,
      data.balances.map(({ currency, availableAmount }) => ({
        currency,
        amount: availableAmount,
      })),
      data.currency,
      today,
    );
    const bank = await currentCurrencyValue(
      client,
      data.balances.map(({ currency, calculatedAmount, amount }) => ({
        currency,
        amount: calculatedAmount ?? amount,
      })),
      data.currency,
      today,
    );
    const endDate = new Date(`${monthStart}T00:00:00Z`);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1, 0);
    const lastDay = endDate.toISOString().slice(0, 10);
    const flows =
      monthStart > today
        ? null
        : await summaryFlowFx(
            client,
            ownerId,
            {
              from: monthStart,
              to: today < lastDay ? today : lastDay,
              label: formatInstallmentPeriod(period),
              complete: lastDay < today,
            },
            data.currency,
            today,
          );
    return { available, bank, flows };
  }).catch(() => null);

  return (
    <FinanceShell current="resumen">
      <FinanceSummary
        {...data}
        today={today}
        period={period}
        currencySummary={
          <Card className="mt-4 min-w-0 gap-3 rounded-2xl p-4 shadow-none">
            <DisplayCurrencySelector
              key={data.currency}
              currency={data.currency}
              ready={fx !== null}
            />
            {fx ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <section
                  aria-label="Equivalencia del disponible libre"
                  className="grid content-start gap-1"
                >
                  <h2 className="text-sm font-medium">
                    Saldo disponible equivalente
                  </h2>
                  <CurrencyValue
                    currency={data.currency}
                    value={fx.available}
                  />
                  {fx.bank.amount !== null && (
                    <p className="text-sm text-muted-foreground">
                      Saldo bancario registrado{" "}
                      {formatBankAmount({
                        currency: data.currency,
                        amount: fx.bank.amount,
                      })}
                    </p>
                  )}
                </section>
                {fx.flows && fx.flows.rows.length > 0 && (
                  <section
                    aria-label="Equivalencia del flujo mensual"
                    className="grid content-start gap-1"
                  >
                    <h2 className="text-sm font-medium">
                      Flujo registrado · {formatInstallmentPeriod(period)}
                    </h2>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                      {fx.flows.rows.map(({ kind, amount }) => (
                        <div key={kind} className="contents">
                          <dt>
                            {
                              {
                                income: "Ingresos",
                                expense: "Gastos",
                                refund: "Devoluciones",
                              }[kind]
                            }
                          </dt>
                          <dd className="text-right font-semibold wrap-anywhere tabular-nums">
                            {amount === null
                              ? "Equivalencia no disponible"
                              : formatBankAmount({
                                  currency: data.currency,
                                  amount,
                                })}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <ExchangeRateDetails
                      target={data.currency}
                      quotes={fx.flows.quotes}
                      missing={fx.flows.missing}
                    />
                  </section>
                )}
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                La conversión no está disponible. Se muestran importes en su
                moneda original.
              </p>
            )}
          </Card>
        }
      />
    </FinanceShell>
  );
}
