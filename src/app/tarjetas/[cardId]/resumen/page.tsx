import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CardCycleDetail } from "@/components/card-cycle-detail";
import { ReturnCreditForm } from "@/components/refund-form";
import { FinanceShell } from "@/components/finance-shell";
import { bankReferenceToday } from "@/domain/bank-balances";
import {
  formatInstallmentPeriod,
  installmentPeriodAt,
  isInstallmentPeriod,
} from "@/domain/installments";
import { movementUuid } from "@/domain/movements";
import { listFundSources } from "@/server/fund-coverage";
import { listBankAvailability } from "@/server/bank-balances";
import { cardCyclesReady, loadCardCycle } from "@/server/card-cycles";
import { listCards } from "@/server/cards";
import { listCreditPurchaseOptions } from "@/server/credit-operations";
import { withGoogleOwner } from "@/server/google-auth";
import { listMovementCategories } from "@/server/movements";

export const metadata = { title: "Resumen de tarjeta | Finanzas personales" };
export const dynamic = "force-dynamic";

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{
    ciclo?: string | string[];
    accion?: string | string[];
  }>;
}) {
  const { cardId } = await params;
  const { ciclo, accion } = await searchParams;
  const today = bankReferenceToday();
  const period = ciclo ?? today.slice(0, 7);
  if (!movementUuid.test(cardId) || !isInstallmentPeriod(period)) notFound();
  const result = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async (client, ownerId) => {
      if (!(await cardCyclesReady(client))) return null;
      const card = (await listCards(client, ownerId)).find(
        ({ id, kind }) => id === cardId.toLowerCase() && kind === "credit",
      );
      if (!card) return null;
      const bankAvailability = await listBankAvailability(client, ownerId);
      return {
        bankAvailability,
        fundSources: await listFundSources(client, ownerId),
        card,
        cycle: await loadCardCycle(client, ownerId, card, period, today),
        banks: bankAvailability.map(({ currency }) => currency),
        categories: await listMovementCategories(client, ownerId),
        purchases: (await listCreditPurchaseOptions(client, ownerId)).filter(
          (purchase) => purchase.cardId === card.id,
        ),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Acceso denegado")
      redirect("/auth/sign-in");
    throw error;
  });
  if (!result) notFound();
  const previous = installmentPeriodAt(period, -1);
  const next = installmentPeriodAt(period, 1);
  return (
    <FinanceShell current="tarjetas">
      <div className="grid gap-4">
        <header className="grid gap-1">
          <a
            href="/tarjetas"
            className="inline-flex min-h-11 items-center justify-self-start text-sm underline"
          >
            Volver a Tarjetas
          </a>
          <h1
            id="titulo-pagina"
            tabIndex={-1}
            className="text-2xl font-semibold wrap-anywhere"
          >
            Resumen de {result.card.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ciclo de cierre de {formatInstallmentPeriod(period)}
          </p>
        </header>
        <nav
          aria-label="Elegir ciclo"
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          {isInstallmentPeriod(previous) && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`?ciclo=${previous}`}
            >
              Ciclo anterior
            </a>
          )}
          {isInstallmentPeriod(next) && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`?ciclo=${next}`}
            >
              Ciclo siguiente
            </a>
          )}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              Mes de cierre
              <input
                name="ciclo"
                type="month"
                min="0001-01"
                max="9999-12"
                required
                defaultValue={period}
                className="min-h-11 rounded-lg border px-2"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-lg border px-3 text-sm"
            >
              Ver ciclo
            </button>
          </form>
        </nav>
        {result.card.currencies.map(
          ({ currency, creditBalance }) =>
            creditBalance &&
            /[1-9]/.test(creditBalance) &&
            result.banks.includes(currency) && (
              <ReturnCreditForm
                key={currency}
                cardId={result.card.id}
                currency={currency}
                balance={creditBalance}
                today={today}
              />
            ),
        )}
        <CardCycleDetail
          key={`${period}:${accion === "pago"}`}
          {...result}
          period={period}
          today={today}
          openPayment={accion === "pago"}
        />
      </div>
    </FinanceShell>
  );
}
