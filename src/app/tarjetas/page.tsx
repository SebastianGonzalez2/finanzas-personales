import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bankReferenceToday } from "@/domain/bank-balances";
import { listFundSources } from "@/server/fund-coverage";
import { listBankAvailability } from "@/server/bank-balances";
import { listCreditPurchaseOptions } from "@/server/credit-operations";
import {
  creditOperationsReady,
  listMovementCategories,
} from "@/server/movements";
import { CardCatalog } from "@/components/card-catalog";
import { FinanceShell } from "@/components/finance-shell";
import { Card } from "@/components/ui/card";
import { cardsReady, listCards } from "@/server/cards";
import { withGoogleOwner } from "@/server/google-auth";
import { installmentsReady, listCardInstallments } from "@/server/installments";
import { cardCyclesReady, listCardCycleAlerts } from "@/server/card-cycles";
import { CardCycleAlerts } from "@/components/card-cycle-alerts";
import { mixedPurchasesReady } from "@/server/mixed-purchases";

export const metadata = { title: "Tarjetas | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const today = bankReferenceToday();
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await cardsReady(client)))
        return {
          message:
            "El catálogo estará disponible cuando se actualice la base de datos.",
        };
      const cards = await listCards(client, ownerId);
      const creditReady = await creditOperationsReady(client);
      const plansReady = creditReady && (await installmentsReady(client));
      const hasCredit =
        creditReady && cards.some(({ kind }) => kind === "credit");
      const cyclesReady = hasCredit && (await cardCyclesReady(client));
      const bankAvailability = hasCredit
        ? await listBankAvailability(client, ownerId)
        : [];
      return {
        cards,
        fundSources: hasCredit ? await listFundSources(client, ownerId) : null,
        bankAvailability,
        creditReady,
        installmentsReady: plansReady,
        cyclesReady,
        mixedReady: hasCredit && (await mixedPurchasesReady(client)),
        alerts: cyclesReady
          ? await listCardCycleAlerts(client, ownerId, cards, today)
          : [],
        plans: plansReady ? await listCardInstallments(client, ownerId) : [],
        banks: bankAvailability.map(({ currency }) => currency),
        categories: hasCredit
          ? await listMovementCategories(client, ownerId)
          : [],
        purchases: hasCredit
          ? await listCreditPurchaseOptions(client, ownerId)
          : [],
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return {
      cards: undefined,
      message: "No pudimos cargar tus tarjetas. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="tarjetas">
      <div className="grid gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Tarjetas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestioná tus tarjetas de débito y crédito por moneda.
          </p>
        </header>
        {result.cards ? (
          <>
            {result.cyclesReady && (
              <CardCycleAlerts alerts={result.alerts} today={today} />
            )}
            <CardCatalog {...result} cards={result.cards} today={today} />
          </>
        ) : (
          <Card className="p-4">
            <p role="status">{result.message}</p>
          </Card>
        )}
      </div>
    </FinanceShell>
  );
}
