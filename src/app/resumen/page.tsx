import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { bankReferenceToday } from "@/domain/bank-balances";
import { classificationReady, listTags } from "@/server/classification";
import { isInstallmentPeriod } from "@/domain/installments";
import { displayCurrency, exchangeRatesReady } from "@/server/exchange-rates";
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
import { summaryFlowFx, summaryReferenceDates } from "@/server/statistics";
import { summaryPeriods } from "@/domain/summary-period";
import {
  summaryBudgets,
  summaryRecurrenceNotices,
} from "@/server/summary-panels";
import { withGoogleOwner } from "@/server/google-auth";
import {
  installmentsReady,
  listMonthlyInstallments,
} from "@/server/installments";
import {
  listMovementTotals,
  listSummaryRecentExpenses,
  movementAvailability,
} from "@/server/movements";
import { listCatalogCategories } from "@/server/categories";

export const metadata = { title: "Resumen | Finanzas personales" };
export const dynamic = "force-dynamic";

// SIMP-03 — Resumen de gastos. Solo lee gastos, cuotas, presupuestos y
// recurrentes de gasto; nada de saldos, ingresos, tarjetas ni fondos.
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
    const currency = await displayCurrency(client, ownerId);
    const { readable, writable } = await movementAvailability(client);
    if (!readable)
      return {
        currency,
        movementReadable: false,
        movementRegistrationReady: false,
        categories: [],
        monthlyInstallments: [],
        totals: [],
        recent: [],
      };
    const plansReady = await installmentsReady(client);
    return {
      currency,
      movementReadable: true,
      movementRegistrationReady: writable,
      tags:
        writable && (await classificationReady(client))
          ? await listTags(client, ownerId)
          : null,
      categories: writable ? await listCatalogCategories(client, ownerId) : [],
      monthlyInstallments: plansReady
        ? await listMonthlyInstallments(client, ownerId, monthStart)
        : [],
      totals: await listMovementTotals(client, ownerId, monthStart),
      recent: await listSummaryRecentExpenses(client, ownerId, plansReady),
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

  const widgets = withGoogleOwner(request, async (client, ownerId) => ({
    budgets: await summaryBudgets(client, ownerId, period),
    notices: await summaryRecurrenceNotices(client, ownerId, today),
  })).catch(() => null);
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
