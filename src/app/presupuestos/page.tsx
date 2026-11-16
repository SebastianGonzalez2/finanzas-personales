import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { BudgetCatalog } from "@/components/budget-catalog";
import { PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
import { bankReferenceToday } from "@/domain/bank-balances";
import { listCatalogCategories } from "@/server/categories";
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
import {
  budgetReferenceDates,
  budgetsReady,
  listBudgets,
} from "@/server/budgets";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Presupuestos | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const requested = (await searchParams).month;
  const today = bankReferenceToday();
  const month =
    typeof requested === "string" &&
    /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : today.slice(0, 7);
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  const dates = await withGoogleOwner(request, (client, ownerId) =>
    budgetReferenceDates(client, ownerId, month),
  ).catch(() => []);
  await refreshOwnerReferences(request, dates, today).catch(() => undefined);

  const result = await withGoogleOwner(request, async (client, ownerId) => {
    if (!(await budgetsReady(client)))
      return {
        message:
          "Los presupuestos estarán disponibles cuando se actualice la base de datos.",
      };
    const budgets = await listBudgets(client, ownerId, month, today);
    return {
      budgets,
      categories: (await listCatalogCategories(client, ownerId)).filter(
        ({ kind }) => kind === "expense",
      ),
    };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      message: "No pudimos cargar tus presupuestos. Volvé a intentarlo.",
      retry: true,
    };
  });

  return (
    <FinanceShell current="presupuestos">
      <Screen>
        {"budgets" in result && result.budgets ? (
          <BudgetCatalog
            budgets={result.budgets}
            categories={result.categories}
            today={today}
            viewedMonth={month}
          />
        ) : (
          <>
            <PageHead
              eyebrow="Planificación"
              title="Presupuestos"
              description="Límites mensuales opcionales por categoría, sin arrastre de saldos."
            />
            <PageNotice
              tone={"retry" in result ? "critical" : "info"}
              message={result.message}
              retryHref={"retry" in result ? "/presupuestos" : undefined}
            />
          </>
        )}
      </Screen>
    </FinanceShell>
  );
}
