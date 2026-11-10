import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance-shell";
import { SavingsFundCatalog } from "@/components/savings-fund-catalog";
import { Card } from "@/components/ui/card";
import { listSavingsFunds, savingsFundsReady } from "@/server/savings-funds";
import { withGoogleOwner } from "@/server/google-auth";

export const metadata = { title: "Fondos de ahorro | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function SavingsFundsPage() {
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) =>
      (await savingsFundsReady(client))
        ? { funds: await listSavingsFunds(client, ownerId) }
        : {
            message:
              "Los fondos estarán disponibles cuando se actualice la base de datos.",
          },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return { message: "No pudimos cargar tus fondos. Volvé a intentarlo." };
  });

  return (
    <FinanceShell current="fondos">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Fondos de ahorro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organizá reservas virtuales por moneda sin mover el saldo bancario.
          </p>
        </header>
        {"funds" in result && result.funds ? (
          <SavingsFundCatalog funds={result.funds} />
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
