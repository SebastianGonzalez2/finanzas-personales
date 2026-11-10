import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { bankCurrencies, bankReferenceToday } from "@/domain/bank-balances";
import { listRefundTotals } from "@/server/refund-totals";
import { isInstallmentPeriod } from "@/domain/installments";
import {
  bankReconciliationReady,
  listBankBalances,
  listBankCheckpoints,
} from "@/server/bank-balances";
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
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      const reconciliationReady = await bankReconciliationReady(client);
      const bankData = {
        balances: await listBankBalances(
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
        categories: writable
          ? await listMovementCategories(client, ownerId)
          : [],
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
    },
  ).catch(() => redirect("/auth/sign-in"));

  return (
    <FinanceShell current="resumen">
      <FinanceSummary {...data} today={today} period={period} />
    </FinanceShell>
  );
}
