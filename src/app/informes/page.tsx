import { FinanceShell } from "@/components/finance-shell";
import { InformesPanel } from "@/components/informes-panel";
import { currentReportPeriod } from "@/lib/export/report-format";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

export const metadata = { title: "Informes | Finanzas personales" };

export default async function InformesPage() {
  await requireGoogleOwnerPage();
  return (
    <FinanceShell current="informes">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Informes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Descargá tus estadísticas en CSV, Excel o PDF.
          </p>
        </header>
        <InformesPanel initialPeriod={currentReportPeriod()} />
      </div>
    </FinanceShell>
  );
}
