import { AyudaFaq } from "@/components/ayuda-faq";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, Screen } from "@/components/glaciar/screen";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ayudaGroups } from "@/domain/ayuda";
import { requireGoogleOwnerPage } from "@/server/require-google-owner-page";

export const metadata = { title: "Ayuda | Finanzas personales" };

export default async function AyudaPage() {
  await requireGoogleOwnerPage();

  return (
    <FinanceShell current="ayuda">
      <Screen>
        <PageHead
          eyebrow="Tu cuenta"
          title="Ayuda"
          description="Preguntas frecuentes sobre las funciones de la aplicación. El tutorial es un recorrido introductorio de ocho pasos."
          actions={
            <a href="/resumen?tutorial=1" className={buttonClass("outline")}>
              <Icon name="sparkle" duotone={false} className="size-4" />
              Volver a ver tutorial
            </a>
          }
        />
        <AyudaFaq groups={ayudaGroups} />
      </Screen>
    </FinanceShell>
  );
}
