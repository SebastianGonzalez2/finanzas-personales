import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  BankBenefitForm,
  BankBenefitRecord,
} from "@/components/bank-benefit-form";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, PageNotice, Screen } from "@/components/glaciar/screen";
import { Icon } from "@/components/ui/icon";
import { bankCurrencies, bankReferenceToday } from "@/domain/bank-balances";
import { bankBenefitsReady } from "@/server/bank-benefit-schema";
import { listBankBenefits } from "@/server/bank-benefits";
import { listBankBalances } from "@/server/bank-balances";
import { cardsReady, listCards } from "@/server/cards";
import { withGoogleOwner } from "@/server/google-auth";
import { creditOperationsReady } from "@/server/movements";

export const metadata = {
  title: "Beneficios bancarios | Finanzas personales",
};
export const dynamic = "force-dynamic";

export default async function BankBenefitsPage() {
  const data = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await bankBenefitsReady(client))) return { ready: false } as const;
      const cards =
        (await cardsReady(client)) && (await creditOperationsReady(client))
          ? (await listCards(client, ownerId)).filter(
              ({ kind, archived }) => kind === "credit" && !archived,
            )
          : [];
      return {
        ready: true,
        today: bankReferenceToday(),
        cards: cards.map(({ id, name, currencies }) => ({
          id,
          name,
          currencies: currencies.map(({ currency }) => currency),
        })),
        configured: (
          await listBankBalances(client, ownerId, bankCurrencies)
        ).map(({ currency }) => currency),
        entries: await listBankBenefits(client, ownerId),
      } as const;
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    return null;
  });

  return (
    <FinanceShell current="beneficios">
      <Screen>
        <PageHead
          eyebrow="Crédito"
          title="Beneficios bancarios"
          description="Cashback y bonificaciones acreditados por el banco que no están ligados a una compra concreta."
        />
        {!data && (
          <PageNotice
            tone="critical"
            message="No pudimos cargar los beneficios bancarios."
            retryHref="/beneficios"
          />
        )}
        {data && !data.ready && (
          <PageNotice
            tone="info"
            message="Actualizá la base de datos para registrar beneficios bancarios."
          />
        )}
        {data?.ready && (
          <div className="gs-grid">
            <div className="gs-span-7">
              <BankBenefitForm
                cards={data.cards}
                today={data.today}
                bankCurrenciesReady={[...data.configured]}
              />
            </div>
            <section
              className="lab-panel gs-span-5"
              aria-labelledby="beneficios-registrados"
            >
              <header className="lab-panel__head">
                <h2 id="beneficios-registrados" className="lab-panel__title">
                  <span className="lab-panel__icon">
                    <Icon name="benefits" className="size-4.5" />
                  </span>
                  Beneficios registrados
                </h2>
                <span className="lab-tag lab-tag--neutral">
                  {data.entries.length}
                </span>
              </header>
              {data.entries.length === 0 ? (
                <p className="lab-muted py-6 text-center text-sm">
                  Todavía no registraste beneficios.
                </p>
              ) : (
                <ul className="gs-rows" aria-label="Beneficios registrados">
                  {data.entries.map((entry) => (
                    <li key={entry.id}>
                      <BankBenefitRecord entry={entry} link />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Screen>
    </FinanceShell>
  );
}
