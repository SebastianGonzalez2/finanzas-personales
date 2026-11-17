import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { bankCurrencies, bankReferenceToday } from "@/domain/bank-balances";
import { classificationReady, listTags } from "@/server/classification";
import { listRefundTotals } from "@/server/refund-totals";
import { isInstallmentPeriod } from "@/domain/installments";
import { displayCurrency, exchangeRatesReady } from "@/server/exchange-rates";
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
    return data.movementReadable
      ? summaryReferenceDates(
          client,
          ownerId,
          periods.selected ?? periods.history,
          periods.history,
          periods.comparison,
          data.currency,
        )
      : [];
  }).catch(() => []);
  await refreshOwnerReferences(request, fxDates, today).catch(() => undefined);

  const fx = withGoogleOwner(request, async (client, ownerId) => {
    if (!data.movementReadable || !(await exchangeRatesReady(client)))
      return null;
    return summaryFlowFx(
      client,
      ownerId,
      periods.selected ?? periods.history,
      data.currency,
      today,
      periods.history,
      periods.comparison,
    );
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
  const [flowFx, panels] = await Promise.all([fx, widgets]);

  return (
    <FinanceShell current="resumen">
      <FinanceSummary
        {...data}
        today={today}
        period={period}
        periods={periods}
        fx={flowFx}
        panels={panels}
      />
    </FinanceShell>
  );
}
