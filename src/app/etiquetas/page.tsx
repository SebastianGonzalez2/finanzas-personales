import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
import { Icon } from "@/components/ui/icon";
import { TagCatalog } from "@/components/tag-catalog";
import { classificationReady, listTags } from "@/server/classification";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Etiquetas | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  const tags = await withGoogleOwner(request, async (client, ownerId) =>
    (await classificationReady(client)) ? listTags(client, ownerId) : null,
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });
  return (
    <FinanceShell current="etiquetas">
      <Screen>
        <Link className="gs-back" href="/historial">
          <Icon name="chevronLeft" duotone={false} className="size-4" />
          Volver al historial
        </Link>
        <PageHead
          eyebrow="Catálogos"
          title="Etiquetas"
          description="Creá, renombrá y archivá las etiquetas que usás para clasificar movimientos."
        />
        {tags ? (
          <TagCatalog tags={tags} />
        ) : (
          <PageNotice
            tone="info"
            message="Las etiquetas no están disponibles en este momento."
          />
        )}
      </Screen>
    </FinanceShell>
  );
}
