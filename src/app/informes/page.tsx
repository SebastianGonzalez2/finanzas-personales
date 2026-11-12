import { FinanceShell } from "@/components/finance-shell";
import { InformesPanel } from "@/components/informes-panel";
import { currentReportPeriod } from "@/lib/export/report-format";

export const metadata = { title: "Informes | Finanzas personales" };

export default function InformesPage() {
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
            Exportá el informe del período en CSV, Excel o PDF. La descarga
            segura se activa al completar la parte crítica del ticket F5-07.
          </p>
        </header>
        <InformesPanel initialPeriod={currentReportPeriod()} />
      </div>
    </FinanceShell>
  );
}
