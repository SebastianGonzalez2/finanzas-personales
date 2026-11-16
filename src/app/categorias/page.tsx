import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CategoryCatalog } from "@/components/category-catalog";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
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
      <Screen>
        <PageHead
          eyebrow="Catálogos"
          title="Categorías"
          description="Al archivar una categoría, se oculta junto con sus subcategorías de los formularios. Los movimientos existentes conservan su categoría."
        />
        {result.categories ? (
          <CategoryCatalog categories={result.categories} />
        ) : (
          <PageNotice
            tone="critical"
            message={result.message}
            retryHref="/categorias"
          />
        )}
      </Screen>
    </FinanceShell>
  );
}
