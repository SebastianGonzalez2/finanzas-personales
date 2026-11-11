import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { CategoryCatalog } from "@/components/category-catalog";
import { Card } from "@/components/ui/card";
import { listManagedCategories } from "@/server/categories";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Categorías | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => ({
      categories: await listManagedCategories(client, ownerId),
    }),
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      categories: null,
      message: "No pudimos cargar tu catálogo. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="categorias">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Categorías
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Al archivar una categoría, se oculta junto con sus subcategorías de
            los formularios. Los movimientos existentes conservan su categoría.
          </p>
        </header>
        {result.categories ? (
          <CategoryCatalog categories={result.categories} />
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
