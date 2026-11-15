import { headers } from "next/headers";
import { listCatalogCategories } from "@/server/categories";
import { redirect } from "next/navigation";
import { bankReferenceToday } from "@/domain/bank-balances";
import { classificationReady, listTags } from "@/server/classification";
import { listFundSources } from "@/server/fund-coverage";
import { listBankAvailability } from "@/server/bank-balances";
import { listCreditPurchaseOptions } from "@/server/credit-operations";
import { creditOperationsReady } from "@/server/movements";
import { CardCatalog } from "@/components/card-catalog";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
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
          kind: "pending" as const,
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
        tags:
          hasCredit && (await classificationReady(client))
            ? await listTags(client, ownerId)
            : null,
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
          ? await listCatalogCategories(client, ownerId)
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
      kind: "error" as const,
      message: "No pudimos cargar tus tarjetas. Volvé a intentarlo.",
    };
  });

  return (
    <FinanceShell current="tarjetas">
      <Screen>
        {result.cards ? (
          <CardCatalog
            {...result}
            cards={result.cards}
            today={today}
            aside={
              result.cyclesReady ? (
                <CardCycleAlerts alerts={result.alerts} today={today} />
              ) : null
            }
          />
        ) : (
          <>
            <PageHead
              eyebrow="Crédito"
              title="Tarjetas"
              description="Gestioná tus tarjetas de débito y crédito por moneda."
            />
            <PageNotice
              tone={result.kind === "error" ? "critical" : "info"}
              message={result.message}
              retryHref={result.kind === "error" ? "/tarjetas" : undefined}
            />
          </>
        )}
      </Screen>
    </FinanceShell>
  );
}
