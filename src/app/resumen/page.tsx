import { FinanceShell } from "@/components/finance-shell";
import { FinanceSummary } from "@/components/finance-summary";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

export const metadata = { title: "Resumen | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  await requireGoogleOwnerPage();

  return (
    <FinanceShell current="resumen">
      <FinanceSummary />
    </FinanceShell>
  );
}
