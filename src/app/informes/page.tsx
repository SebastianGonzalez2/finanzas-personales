import { FinanceShell } from "@/components/finance-shell";
import { PageHead, Screen } from "@/components/glaciar/screen";
import { InformesPanel } from "@/components/informes-panel";
import { currentReportPeriod } from "@/lib/export/report-format";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

export const metadata = { title: "Informes | Finanzas personales" };

export default async function InformesPage() {
  await requireGoogleOwnerPage();
  return (
    <FinanceShell current="informes">
      <Screen>
        <PageHead
          eyebrow="General"
          title="Informes"
          description="Descargá tus estadísticas en CSV, Excel o PDF."
        />
        <InformesPanel initialPeriod={currentReportPeriod()} />
      </Screen>
    </FinanceShell>
  );
}
