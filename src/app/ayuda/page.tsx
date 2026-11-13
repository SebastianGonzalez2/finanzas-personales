import { AyudaFaq } from "@/components/ayuda-faq";
import { FinanceShell } from "@/components/finance-shell";
import { ayudaGroups } from "@/domain/ayuda";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

export const metadata = { title: "Ayuda | Finanzas personales" };

export default async function AyudaPage() {
  await requireGoogleOwnerPage();

  return (
    <FinanceShell current="ayuda">
      <div className="grid max-w-3xl gap-4">
        <header className="grid gap-1">
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Ayuda
          </h1>
          <p className="text-sm text-muted-foreground">
            Preguntas frecuentes sobre las funciones de la aplicación.
          </p>
          <p className="text-sm">
            <a
              href="/resumen?tutorial=1"
              className="inline-flex min-h-11 items-center underline underline-offset-2"
            >
              Volver a ver tutorial
            </a>{" "}
            <span className="text-muted-foreground">
              (recorrido introductorio de cinco pasos)
            </span>
          </p>
        </header>
        <AyudaFaq groups={ayudaGroups} />
      </div>
    </FinanceShell>
  );
}
