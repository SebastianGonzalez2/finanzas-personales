import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { BudgetCatalog } from "@/components/budget-catalog";
import { Card } from "@/components/ui/card";
import { bankReferenceToday } from "@/domain/bank-balances";
import { listMovementCategories } from "@/server/movements";
import { budgetsReady, listBudgets } from "@/server/budgets";
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
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await budgetsReady(client)))
        return {
          message:
            "Los presupuestos estarán disponibles cuando se actualice la base de datos.",
        };
      const budgets = await listBudgets(client, ownerId, month);
      return {
        budgets,
        categories: (await listMovementCategories(client, ownerId)).filter(
          ({ kind }) => kind === "expense",
        ),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      message: "No pudimos cargar tus presupuestos. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="presupuestos">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Presupuestos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Límites mensuales opcionales por categoría, sin arrastre de saldos.
          </p>
        </header>
        {"budgets" in result && result.budgets ? (
          <BudgetCatalog
            budgets={result.budgets}
            categories={result.categories}
            today={today}
            viewedMonth={month}
          />
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
