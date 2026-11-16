import { MonthField } from "./ui/date-fields";
import {
  bankCurrencies,
  formatBankAmount,
  formatBankReference,
  type BankAvailability,
  type BankCheckpoint,
} from "@/domain/bank-balances";
import {
  type MovementTotal,
  type RecentBankTransfer,
  type RecentMovement,
} from "@/domain/movements";
import type { CatalogCategory } from "@/domain/categories";
import type { FundSource } from "@/domain/fund-coverage";
import type { CatalogCard } from "@/domain/cards";
import {
  installmentPeriodAt,
  isInstallmentPeriod,
  type MonthlyInstallment,
} from "@/domain/installments";
import { BankBalanceRow } from "./bank-balance-row";
import { BankCheckpointHistory } from "./bank-checkpoint-history";
import { BalanceAdjustmentForm } from "./balance-adjustment-form";
import Link from "next/link";
import { Icon } from "./ui/icon";
import { MovementForm } from "./movement-form";
import type { MovementTag } from "@/domain/classification";
import { historyButton } from "./history-fields";
import { Card } from "./ui/card";

import { summaryMonthEnd, type summaryPeriods } from "@/domain/summary-period";
import type { Currency } from "@/domain/money";
import { BalanceHero } from "./glaciar-summary/balance-hero";
import type { HistoryEntry } from "@/domain/history";
import { SummaryRecent } from "./glaciar-summary/summary-recent";
import {
  SummaryFlows,
  SummaryPlanning,
  type SummaryFx,
  type SummaryWidgets,
} from "./glaciar-summary/summary-panels";
import { TransferButton } from "./glaciar-summary/transfer-button";

const weekday = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  timeZone: "UTC",
});
const monthParts = new Intl.DateTimeFormat("es-UY", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function part(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

function headerDate(iso: string) {
  const day = weekday.format(new Date(`${iso}T12:00:00Z`));
  return `${capitalize(day)} ${formatBankReference(iso)}`;
}

function headerMonth(period: string) {
  const parts = monthParts.formatToParts(new Date(`${period}-01T12:00:00Z`));
  return capitalize(`${part(parts, "month")} ${part(parts, "year")}`);
}

export function FinanceSummary({
  balances,
  fundSources,
  checkpoints,
  reconciliationReady,
  today,
  period,
  categories,
  tags,
  registrationCards,
  debitCards,
  installmentsReady,
  sharedExpensesReady,
  monthlyInstallments,
  totals,
  refundTotals,
  recent,
  activity,
  bankTransfers,
  bankTransfersReady,
  movementRegistrationReady,
  currencySummary,
  currency,
  periods,
  fx,
  panels,
  movementReadable,
  cardsReady,
}: {
  balances: BankAvailability[];
  fundSources?: FundSource[] | null;
  checkpoints: BankCheckpoint[];
  reconciliationReady: boolean;
  today: string;
  period: string;
  categories: CatalogCategory[];
  tags?: MovementTag[] | null;
  registrationCards: CatalogCard[];
  debitCards?: CatalogCard[];
  installmentsReady: boolean;
  sharedExpensesReady: boolean;
  monthlyInstallments: MonthlyInstallment[];
  totals: MovementTotal[];
  refundTotals: Pick<MovementTotal, "currency" | "amount">[];
  recent: RecentMovement[];
  activity: HistoryEntry[];
  bankTransfers: RecentBankTransfer[];
  bankTransfersReady: boolean;
  movementRegistrationReady: boolean;
  currencySummary: React.ReactNode;
  currency: Currency;
  periods: ReturnType<typeof summaryPeriods>;
  fx: SummaryFx;
  panels: SummaryWidgets | null;
  movementReadable: boolean;
  cardsReady: boolean;
}) {
  const stepper = (offset: number) => {
    const target = installmentPeriodAt(period, offset);
    const label = offset < 0 ? "Mes anterior" : "Mes siguiente";
    const arrow = (
      <Icon
        name={offset < 0 ? "chevronLeft" : "chevronRight"}
        duotone={false}
        className="size-4"
      />
    );
    return isInstallmentPeriod(target) ? (
      <Link
        href={`/resumen?month=${target}`}
        className="lab-stepper__btn"
        aria-label={label}
      >
        {arrow}
      </Link>
    ) : (
      <button
        className="lab-stepper__btn"
        type="button"
        aria-label={label}
        disabled
      >
        {arrow}
      </button>
    );
  };

  return (
    <div className="glaciar-summary">
      <div className="f-pagehead">
        <div>
          <p className="c-eyebrow">
            <span className="c-eyebrow__line" aria-hidden="true" />
            <time dateTime={today}>{headerDate(today)}</time>
          </p>
          <h1 id="titulo-pagina" tabIndex={-1} className="f-title">
            Resumen financiero
          </h1>
        </div>
        <div className="lab-stepper" role="group" aria-label="Mes del reporte">
          {stepper(-1)}
          <details className="relative">
            <summary className="lab-stepper__label cursor-pointer list-none">
              <Icon name="calendar" className="size-4" />
              <span>{headerMonth(period)}</span>
              <span className="sr-only"> · Elegir otro mes</span>
            </summary>
            <form
              action="/resumen"
              method="get"
              className="mt-2 grid gap-2 pb-2"
            >
              <MonthField
                label="Elegir mes"
                variant="history"
                name="month"
                required
                min="0001-01"
                max="9999-12"
                defaultValue={period}
              />
              <button type="submit" className={historyButton}>
                Ver mes
              </button>
            </form>
          </details>
          {stepper(1)}
        </div>
      </div>
      {movementRegistrationReady ? (
        <MovementForm
          bankTransfersReady={bankTransfersReady}
          today={today}
          balances={balances}
          fundSources={fundSources}
          categories={categories}
          tags={tags}
          creditCards={registrationCards}
          debitCards={debitCards}
          installmentsReady={installmentsReady}
          sharedExpensesReady={sharedExpensesReady}
        />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          El registro de movimientos todavía no está disponible.
        </p>
      )}

      <section aria-label="Indicadores financieros" className="b-grid">
        <BalanceHero
          hint
          balances={bankCurrencies.map((currency) => {
            const history = checkpoints.filter(
              (checkpoint) => checkpoint.currency === currency,
            );
            const firstDate = history.at(-1)?.asOfDate;
            return {
              currency,
              content: (
                <BankBalanceRow
                  currency={currency}
                  initialBalance={balances.find(
                    (balance) => balance.currency === currency,
                  )}
                  today={today}
                  transfer={
                    <TransferButton
                      available={
                        bankTransfersReady && movementRegistrationReady
                      }
                    />
                  }
                  history={
                    history.length > 0 && (
                      <BankCheckpointHistory checkpoints={history} />
                    )
                  }
                >
                  {firstDate && reconciliationReady && (
                    <BalanceAdjustmentForm
                      currency={currency}
                      today={today}
                      firstDate={firstDate}
                    />
                  )}
                </BankBalanceRow>
              ),
            };
          })}
        />
        <SummaryFlows
          currency={currency}
          fx={fx}
          periods={periods}
          totals={totals}
          today={today}
        />
        <SummaryPlanning
          panels={panels}
          today={today}
          period={period}
          cardsReady={cardsReady}
        />
        <SummaryRecent
          recent={recent}
          activity={activity}
          available={movementReadable}
          canCorrect={movementRegistrationReady && reconciliationReady}
        />
      </section>
      <section aria-label="Detalle financiero">
        {currencySummary}
        {refundTotals.length > 0 && (
          <Card className="mt-4 min-w-0 gap-3 rounded-2xl p-4 text-sm shadow-none">
            <h3 className="font-semibold">Devoluciones recibidas en el mes</h3>
            <ul className="flex flex-wrap gap-3">
              {refundTotals.map((refund) => (
                <li key={refund.currency}>{formatBankAmount(refund)}</li>
              ))}
            </ul>
            <a
              className="w-fit underline"
              href={`/historial?kind=purchase_refund&status=confirmed&from=${period}-01&to=${period}-${summaryMonthEnd(period).slice(-2)}`}
            >
              Ver devoluciones en el historial
            </a>
          </Card>
        )}
        {monthlyInstallments.length > 0 && (
          <Card className="mt-4 min-w-0 gap-3 rounded-2xl p-4 text-sm shadow-none">
            <h3 className="font-semibold">
              Cuotas incluidas en los gastos del mes
            </h3>
            <p className="text-muted-foreground">
              {period > today.slice(0, 7)
                ? "Proyección según el calendario vigente."
                : "Importes imputados al mes según el calendario vigente."}{" "}
              La facturación y los pagos se registran aparte.
            </p>
            <ul aria-label="Cuotas del mes" className="divide-y">
              {monthlyInstallments.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-x-3 py-2 wrap-anywhere"
                >
                  <span>
                    <a
                      href={`/historial/movimientos/${item.id}`}
                      className="underline"
                    >
                      {item.concept}
                    </a>{" "}
                    · Cuota {item.ordinal} ·{" "}
                    {item.category ?? "Sin categorizar"}
                  </span>
                  <span className="font-semibold">
                    {formatBankAmount(item)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {bankTransfersReady && (
          <Card className="mt-4 min-w-0 gap-3 rounded-2xl p-4 text-sm shadow-none">
            <h3 className="font-semibold">Cambios de moneda recientes</h3>
            {bankTransfers.length ? (
              <ul aria-label="Cambios de moneda recientes" className="divide-y">
                {bankTransfers.map((transfer) => (
                  <li
                    key={transfer.id}
                    className="wrap-anywhere py-2 first:pt-0 last:pb-0"
                  >
                    <p className="flex flex-wrap gap-x-4 tabular-nums">
                      <span>
                        Entregaste{" "}
                        {formatBankAmount({
                          currency: transfer.sourceCurrency,
                          amount: transfer.sourceAmount,
                        })}
                      </span>
                      <span>
                        Recibiste{" "}
                        {formatBankAmount({
                          currency: transfer.destinationCurrency,
                          amount: transfer.destinationAmount,
                        })}
                      </span>
                    </p>
                    <time
                      dateTime={transfer.effectiveOn}
                      className="text-muted-foreground"
                    >
                      {formatBankReference(transfer.effectiveOn)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                Todavía no hay cambios de moneda registrados.
              </p>
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
