import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listNameCatalog, nameCatalogReady } from "@/server/catalog";
import { NameCatalog } from "@/components/name-catalog";
import { FinanceShell } from "@/components/finance-shell";
import { Card } from "@/components/ui/card";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = {
  title: "Comercios y contactos | Finanzas personales",
};
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await nameCatalogReady(client)))
        return {
          entries: undefined,
          message:
            "El catálogo estará disponible cuando se actualice la base de datos.",
        };
      return { entries: await listNameCatalog(client, ownerId) };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      entries: undefined,
      message: "No pudimos cargar tu catálogo. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="catalogo">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Comercios y contactos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catálogo privado para autocompletar gastos y gastos compartidos.
          </p>
        </header>
        {result.entries ? (
          <NameCatalog entries={result.entries} />
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
