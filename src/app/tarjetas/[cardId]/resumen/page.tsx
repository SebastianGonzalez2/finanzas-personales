import { headers } from "next/headers";
import { listCatalogCategories } from "@/server/categories";
import { notFound, redirect } from "next/navigation";
import { CardCycleDetail } from "@/components/card-cycle-detail";
import { ReturnCreditForm } from "@/components/refund-form";
import { FinanceShell } from "@/components/finance-shell";
import { PageHead, Screen } from "@/components/glaciar/screen";
import {
  HistoryField,
  historyButton,
  historyControl,
} from "@/components/history-fields";
import { Icon } from "@/components/ui/icon";
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
        categories: await listCatalogCategories(client, ownerId),
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
  const refunds = result.card.currencies.map(
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
  );
  return (
    <FinanceShell current="tarjetas">
      <Screen>
        <a href="/tarjetas" className="gs-back">
          <Icon name="chevronLeft" duotone={false} className="size-4" />
          Volver a Tarjetas
        </a>
        <PageHead
          eyebrow={`Ciclo de cierre de ${formatInstallmentPeriod(period)}`}
          title={`Resumen de ${result.card.name}`}
          actions={
            <nav aria-label="Elegir ciclo" className="gs-nav">
              <div className="lab-stepper">
                {isInstallmentPeriod(previous) ? (
                  <a
                    className="lab-stepper__btn"
                    href={`?ciclo=${previous}`}
                    aria-label="Ciclo anterior"
                  >
                    <Icon
                      name="chevronLeft"
                      duotone={false}
                      className="size-4"
                    />
                  </a>
                ) : (
                  <span className="lab-stepper__btn" aria-hidden="true" />
                )}
                <span className="lab-stepper__label">
                  <Icon name="calendar" className="size-4" />
                  {formatInstallmentPeriod(period)}
                </span>
                {isInstallmentPeriod(next) ? (
                  <a
                    className="lab-stepper__btn"
                    href={`?ciclo=${next}`}
                    aria-label="Ciclo siguiente"
                  >
                    <Icon
                      name="chevronRight"
                      duotone={false}
                      className="size-4"
                    />
                  </a>
                ) : (
                  <span className="lab-stepper__btn" aria-hidden="true" />
                )}
              </div>
              <form method="get" className="gs-actions items-end">
                <HistoryField label="Mes de cierre">
                  <input
                    name="ciclo"
                    type="month"
                    min="0001-01"
                    max="9999-12"
                    required
                    defaultValue={period}
                    className={historyControl}
                  />
                </HistoryField>
                <button type="submit" className={historyButton}>
                  Ver ciclo
                </button>
              </form>
            </nav>
          }
        />
        <CardCycleDetail
          key={`${period}:${accion === "pago"}`}
          {...result}
          period={period}
          today={today}
          openPayment={accion === "pago"}
          refunds={refunds}
        />
      </Screen>
    </FinanceShell>
  );
}
