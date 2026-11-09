import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { bankReferenceToday } from "@/domain/bank-balances";
import { listBankBalances } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";
import {
  listMovementCategories,
  listMovementTotals,
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
      const balances = await listBankBalances(client, ownerId);
      const { readable, writable } = await movementAvailability(client);
      if (!readable)
        return {
          balances,
          movementRegistrationReady: false,
          categories: [],
          totals: [],
          expenses: [],
          incomes: [],
        };
      return {
        balances,
        movementRegistrationReady: writable,
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
