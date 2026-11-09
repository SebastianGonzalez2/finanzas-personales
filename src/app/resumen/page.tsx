import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { bankReferenceToday } from "@/domain/bank-balances";
import { listBankBalances } from "@/server/bank-balances";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Resumen | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const balances = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    listBankBalances,
  ).catch(() => redirect("/auth/sign-in"));

  return (
    <FinanceShell current="resumen">
      <FinanceSummary balances={balances} today={bankReferenceToday()} />
    </FinanceShell>
  );
}
