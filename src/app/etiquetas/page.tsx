import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
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
    <FinanceShell current="historial">
      <div className="grid gap-4">
        <Link href="/historial" className="w-fit text-sm underline">
          Volver al historial
        </Link>
        <h1 id="titulo-pagina" tabIndex={-1} className="text-2xl font-semibold">
          Etiquetas
        </h1>
        {tags ? (
          <TagCatalog tags={tags} />
        ) : (
          <p role="status">
            Las etiquetas no están disponibles en este momento.
          </p>
        )}
      </div>
    </FinanceShell>
  );
}
