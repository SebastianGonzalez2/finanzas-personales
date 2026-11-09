import {
  bankCurrencies,
  formatBankAmount,
  formatBankReference,
  type BankBalance,
  type BankCheckpoint,
} from "@/domain/bank-balances";
import {
  movementMethods,
  type MovementCategory,
  type MovementTotal,
  type RecentBankTransfer,
  type RecentMovement,
} from "@/domain/movements";
import { BankBalanceRow } from "./bank-balance-row";
import { BankCheckpointHistory } from "./bank-checkpoint-history";
import { BalanceAdjustmentForm } from "./balance-adjustment-form";
import { FinanceIcon } from "./finance-icon";
import { MovementForm } from "./movement-form";
import { RecentAmountCorrection } from "./recent-amount-correction";
import { Card } from "./ui/card";

const indicators = [
  {
    title: "Ingresos del mes",
    icon: "income",
    accent: "text-[#8196ff]",
    description: "Los ingresos registrados aparecerán acá.",
  },
  {
    title: "Gastos del mes",
    icon: "expense",
    accent: "text-[#4ade80]",
    description: "Los gastos registrados aparecerán acá.",
  },
] as const;

const sections = [
  { title: "Recurrentes", icon: "calendar" },
  { title: "Gastos recientes", icon: "expense", list: "expenses" },
  { title: "Fondos de ahorro", icon: "savings" },
  { title: "Ingresos recientes", icon: "income", list: "incomes" },
] as const;

export function FinanceSummary({
  balances,
  checkpoints,
  reconciliationReady,
  today,
  categories,
  totals,
  expenses,
  incomes,
  bankTransfers,
  bankTransfersReady,
  movementRegistrationReady,
}: {
  balances: BankBalance[];
  checkpoints: BankCheckpoint[];
  reconciliationReady: boolean;
  today: string;
  categories: MovementCategory[];
  totals: MovementTotal[];
  expenses: RecentMovement[];
  incomes: RecentMovement[];
  bankTransfers: RecentBankTransfer[];
  bankTransfersReady: boolean;
  movementRegistrationReady: boolean;
}) {
  const period = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "America/Montevideo",
  }).format(new Date(`${today}T12:00:00Z`));
  const recent = { expenses, incomes };

  return (
    <>
      <h1
        id="titulo-pagina"
        tabIndex={-1}
        className="text-xl leading-7 font-semibold"
      >
        Resumen financiero
      </h1>
      <p className="mt-1 text-muted-foreground first-letter:uppercase">
        {period}
      </p>
      {movementRegistrationReady ? (
        <MovementForm
          bankTransfersReady={bankTransfersReady}
          today={today}
          balances={balances}
          categories={categories}
        />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          El registro de movimientos todavía no está disponible.
        </p>
      )}

      <section aria-label="Indicadores financieros" className="mt-6">
        <div className="finance-indicators">
          <Card className="min-w-0 gap-3 rounded-[1.125rem] p-6 shadow-none">
            <h2 className="flex items-center gap-2 font-medium text-muted-foreground">
              <FinanceIcon name="wallet" className="text-[#fb713f]" />
              Dinero disponible
            </h2>
            <ul aria-label="Saldos bancarios por moneda">
              {bankCurrencies.map((currency) => {
                const history = checkpoints.filter(
                  (checkpoint) => checkpoint.currency === currency,
                );
                const firstDate = history.at(-1)?.asOfDate;
                return (
                  <BankBalanceRow
                    key={currency}
                    currency={currency}
                    initialBalance={balances.find(
                      (balance) => balance.currency === currency,
                    )}
                    today={today}
                  >
                    {firstDate && (
                      <>
                        <BalanceAdjustmentForm
                          currency={currency}
                          today={today}
                          firstDate={firstDate}
                        />
                        <BankCheckpointHistory checkpoints={history} />
                      </>
                    )}
                  </BankBalanceRow>
                );
              })}
            </ul>
          </Card>
          {indicators.map(({ title, icon, accent, description }) => {
            const monthly = bankCurrencies.flatMap((currency) =>
              totals.filter(
                (total) => total.kind === icon && total.currency === currency,
              ),
            );
            return (
              <Card
                key={title}
                className="min-h-[13.0625rem] min-w-0 gap-6 rounded-[1.125rem] p-6 shadow-none"
              >
                <h2 className="flex items-center gap-2 font-medium text-muted-foreground">
                  <FinanceIcon name={icon} className={accent} />
                  {title}
                </h2>
                {monthly.length ? (
                  <ul
                    aria-label={title}
                    className="space-y-1 text-lg font-semibold tabular-nums"
                  >
                    {monthly.map((total) => (
                      <li key={total.currency} className="wrap-anywhere">
                        {formatBankAmount(total)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>
                    <p className="text-[1.625rem] leading-8 font-semibold">
                      Sin datos
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
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

      <section aria-labelledby="mis-finanzas" className="mt-5">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-3">
          <h2 id="mis-finanzas" tabIndex={-1} className="text-lg font-semibold">
            Mis finanzas
          </h2>
          <nav aria-label="Secciones de Mis finanzas">
            <a
              href="/resumen#titulo-pagina"
              aria-current="page"
              className="finance-nav-link text-sm"
            >
              <FinanceIcon name="summary" />
              Resumen
            </a>
          </nav>
        </div>
        <div className="finance-board">
          {sections.map((section) => (
            <div
              key={section.title}
              className="min-w-0 rounded-2xl border bg-[var(--finance-well)] p-2"
            >
              <h3 className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
                <FinanceIcon
                  name={section.icon}
                  className="text-muted-foreground"
                />
                {section.title}
              </h3>
              <Card className="min-h-24 justify-center p-4 text-sm text-muted-foreground shadow-none">
                {"list" in section ? (
                  <RecentMovements
                    movements={recent[section.list]}
                    canCorrect={
                      movementRegistrationReady && reconciliationReady
                    }
                  />
                ) : (
                  <p>Disponible en una próxima etapa.</p>
                )}
              </Card>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function RecentMovements({
  movements,
  canCorrect,
}: {
  movements: RecentMovement[];
  canCorrect: boolean;
}) {
  if (!movements.length) return <p>Todavía no hay movimientos de este tipo.</p>;

  return (
    <ul className="divide-y">
      {movements.map((movement) => (
        <li
          key={movement.id}
          className="space-y-1 py-2 first:pt-0 last:pb-0 wrap-anywhere"
        >
          <div className="flex flex-wrap justify-between gap-x-3 font-medium text-foreground">
            <p>{movement.concept}</p>
            <p className="tabular-nums">{formatBankAmount(movement)}</p>
          </div>
          <p>
            <time dateTime={movement.effectiveOn}>
              {formatBankReference(movement.effectiveOn)}
            </time>
            {" · "}
            {movement.category ?? "Sin categorizar"}
            {" · "}
            {movementMethods[movement.method]}
          </p>
          {movement.note && (
            <p className="whitespace-pre-wrap">{movement.note}</p>
          )}
          {canCorrect && (
            <RecentAmountCorrection
              eventId={movement.id}
              amount={movement.amount}
              concept={movement.concept}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
