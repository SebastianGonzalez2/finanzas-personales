import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { bankCurrencies, bankReferenceToday } from "@/domain/bank-balances";
import {
  bankReconciliationReady,
  listBankBalances,
  listBankCheckpoints,
} from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import {
  listMovementCategories,
  listMovementTotals,
  listRecentBankTransfers,
  listRecentMovements,
  movementAvailability,
} from "@/server/movements";

export const metadata = { title: "Resumen | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const today = bankReferenceToday();
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
          totals: [],
          expenses: [],
          incomes: [],
        };
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
        totals: await listMovementTotals(
          client,
          ownerId,
          `${today.slice(0, 7)}-01`,
        ),
        expenses: await listRecentMovements(client, ownerId, "expense"),
        incomes: await listRecentMovements(client, ownerId, "income"),
      };
    },
  ).catch(() => redirect("/auth/sign-in"));

  return (
    <FinanceShell current="resumen">
      <FinanceSummary {...data} today={today} />
    </FinanceShell>
  );
}
