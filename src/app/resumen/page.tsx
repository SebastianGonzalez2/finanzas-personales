import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { CurrencyValue } from "@/components/current-currency-value";
import { ExchangeRateDetails } from "@/components/exchange-rate-details";
import { Card } from "@/components/ui/card";
import {
  bankCurrencies,
  bankReferenceToday,
  formatBankAmount,
} from "@/domain/bank-balances";
import { classificationReady, listTags } from "@/server/classification";
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
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
import { summaryFlowFx, summaryReferenceDates } from "@/server/statistics";
import { summaryPeriods } from "@/domain/summary-period";
import {
  summaryBudgets,
  summaryCards,
  summaryFunds,
  summaryNotices,
} from "@/server/summary-panels";
import {
  bankReconciliationReady,
  listBankAvailability,
  listBankCheckpoints,
} from "@/server/bank-balances";
import { listFundSources } from "@/server/fund-coverage";
import { listHistory } from "@/server/history";
import { cardsReady, listCards } from "@/server/cards";
import { sharedExpensesReady } from "@/server/shared-expense-schema";
import { mixedPurchasesReady } from "@/server/mixed-purchases";
import { withGoogleOwner } from "@/server/google-auth";
import {
  installmentsReady,
  listMonthlyInstallments,
} from "@/server/installments";
import {
  creditOperationsReady,
  historyReady,
  listMovementTotals,
  listRecentBankTransfers,
  listSummaryRecentMovements,
  movementAvailability,
} from "@/server/movements";
import { listCatalogCategories } from "@/server/categories";

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
  const periods = summaryPeriods(period, today);
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
        movementReadable: false,
        cardsReady: false,
        movementRegistrationReady: false,
        bankTransfersReady: false,
        bankTransfers: [],
        categories: [],
        creditCards: [],
        registrationCards: [],
        installmentsReady: false,
        sharedExpensesReady: false,
        monthlyInstallments: [],
        totals: [],
        refundTotals: [],
        recent: [],
        activity: [],
      };
    const plansReady = await installmentsReady(client);
    const catalogReady = await cardsReady(client);
    const cards = catalogReady
      ? (await listCards(client, ownerId)).filter(({ archived }) => !archived)
      : [];
    const creditReady = catalogReady && (await creditOperationsReady(client));
    return {
      ...bankData,
      movementReadable: true,
      cardsReady: catalogReady,
      movementRegistrationReady: writable,
      bankTransfersReady: transfers,
      bankTransfers: transfers
        ? await listRecentBankTransfers(client, ownerId)
        : [],
      fundSources: writable ? await listFundSources(client, ownerId) : null,
      tags:
        writable && (await classificationReady(client))
          ? await listTags(client, ownerId)
          : null,
      categories: writable ? await listCatalogCategories(client, ownerId) : [],
      creditCards: cards.filter(({ kind }) => kind === "credit"),
      registrationCards: creditReady
        ? cards.filter(({ kind }) => kind === "credit")
        : [],
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
      recent: await listSummaryRecentMovements(client, ownerId, plansReady),
      activity: (await historyReady(client))
        ? (
            await listHistory(client, ownerId, {
              filters: { status: "confirmed", to: today },
              minimum: null,
              maximum: null,
              cursor: undefined,
            })
          ).entries
        : [],
    };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    throw error;
  });

  const fxDates = await withGoogleOwner(request, async (client, ownerId) => {
    if (!(await exchangeRatesReady(client))) return [];
    const dates = data.movementReadable
      ? await summaryReferenceDates(
          client,
          ownerId,
          periods.selected ?? periods.history,
          periods.history,
          periods.comparison,
          data.currency,
        )
      : [];
    if (
      data.balances.some(
        ({ currency, availableAmount, calculatedAmount, amount }) =>
          currency !== data.currency &&
          [availableAmount, calculatedAmount ?? amount].some((value) =>
            /[1-9]/.test(value),
          ),
      )
    )
      dates.push(today);
    return dates;
  }).catch(() => []);
  await refreshOwnerReferences(request, fxDates, today).catch(() => undefined);

  const fx = withGoogleOwner(request, async (client, ownerId) => {
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
    const flows = data.movementReadable
      ? await summaryFlowFx(
          client,
          ownerId,
          periods.selected ?? periods.history,
          data.currency,
          today,
          periods.history,
          periods.comparison,
        )
      : null;
    return { available, bank, flows };
  }).catch(() => null);

  const widgets = withGoogleOwner(request, async (client, ownerId) => {
    const cards = await summaryCards(client, ownerId, data.creditCards, today);
    const funds = await summaryFunds(client, ownerId);
    const budgets = await summaryBudgets(client, ownerId, period);
    const notices = await summaryNotices(
      client,
      ownerId,
      data.creditCards,
      today,
    );
    return { cards, funds, budgets, notices };
  }).catch(() => null);
  const [conversion, panels] = await Promise.all([fx, widgets]);

  return (
    <FinanceShell current="resumen">
      <FinanceSummary
        {...data}
        today={today}
        period={period}
        periods={periods}
        fx={conversion?.flows ?? null}
        panels={panels}
        currencySummary={
          <Card className="mt-4 min-w-0 gap-3 rounded-2xl p-4 shadow-none">
            {/* UI-02: la moneda se elige en la barra superior del shell. */}
            {conversion ? (
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
                    value={conversion.available}
                  />
                  {conversion.bank.amount !== null && (
                    <p className="text-sm text-muted-foreground">
                      Saldo bancario registrado{" "}
                      {formatBankAmount({
                        currency: data.currency,
                        amount: conversion.bank.amount,
                      })}
                    </p>
                  )}
                </section>
                {periods.selected &&
                  conversion.flows &&
                  conversion.flows.rows.length > 0 && (
                    <section
                      aria-label="Equivalencia del flujo mensual"
                      className="grid content-start gap-1"
                    >
                      <h2 className="text-sm font-medium">
                        Flujo registrado · {formatInstallmentPeriod(period)}
                      </h2>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                        {conversion.flows.rows.map(({ kind, amount }) => (
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
                    </section>
                  )}
                {conversion.flows &&
                  (conversion.flows.quotes.length > 0 ||
                    conversion.flows.missing.length > 0) && (
                    <section
                      aria-label="Cotizaciones del flujo"
                      className="grid gap-1 sm:col-span-2"
                    >
                      <h2 className="text-sm font-medium">
                        Cotizaciones del flujo
                      </h2>
                      <ExchangeRateDetails
                        target={data.currency}
                        quotes={conversion.flows.quotes}
                        missing={conversion.flows.missing}
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
