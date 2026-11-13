import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  BankBenefitForm,
  BankBenefitRecord,
} from "@/components/bank-benefit-form";
import { FinanceShell } from "@/components/finance-shell";
import { Card } from "@/components/ui/card";
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
      <div className="grid max-w-3xl gap-4">
        <header>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            Beneficios bancarios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cashback y bonificaciones acreditados por el banco que no están
            ligados a una compra concreta.
          </p>
        </header>
        {!data && (
          <Card className="items-start p-4">
            <p role="status">No pudimos cargar los beneficios bancarios.</p>
          </Card>
        )}
        {data && !data.ready && (
          <Card className="items-start p-4">
            <p role="status">
              Actualizá la base de datos para registrar beneficios bancarios.
            </p>
          </Card>
        )}
        {data?.ready && (
          <>
            <Card className="items-stretch p-4">
              <BankBenefitForm
                cards={data.cards}
                today={data.today}
                bankCurrenciesReady={[...data.configured]}
              />
            </Card>
            <Card className="items-stretch gap-2 p-4">
              <h2 className="font-semibold">Beneficios registrados</h2>
              {data.entries.length === 0 ? (
                <p className="text-sm">Todavía no registraste beneficios.</p>
              ) : (
                <ul className="divide-y" aria-label="Beneficios registrados">
                  {data.entries.map((entry) => (
                    <li key={entry.id}>
                      <BankBenefitRecord entry={entry} link />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </FinanceShell>
  );
}
