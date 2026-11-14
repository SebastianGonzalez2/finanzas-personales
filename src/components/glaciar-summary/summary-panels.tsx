import Link from "next/link";
import {
  comparison,
  amountUnits,
  statisticsMonthLabel,
  sumAmounts,
} from "@/domain/statistics";
import {
  bankCurrencies,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import { fundStatuses, fundTargetNotices } from "@/domain/savings-funds";
import {
  budgetAlertPercent,
  budgetAlertState,
  budgetAlerts,
  budgetAlertMessage,
} from "@/domain/notices";
import type { Currency } from "@/domain/money";
import type { MovementTotal } from "@/domain/movements";
import type { summaryPeriods } from "@/domain/summary-period";
import type {
  summaryBudgets,
  summaryCards,
  summaryFunds,
  summaryNotices,
} from "@/server/summary-panels";
import type { summaryFlowFx } from "@/server/statistics";
import { Icon } from "../ui/icon";
import { CashflowChart, CategoryDonut } from "./charts";
import {
  BudgetList,
  FundsList,
  UpcomingList,
  type UpcomingItem,
} from "./lists";
import { Panel, PanelLink } from "./panel";
import { CardObjects, FlowCard, Notices, type SummaryNotice } from "./pieces";

export type SummaryFx = Awaited<ReturnType<typeof summaryFlowFx>>;
export type SummaryWidgets = {
  cards: Awaited<ReturnType<typeof summaryCards>>;
  funds: Awaited<ReturnType<typeof summaryFunds>>;
  budgets: Awaited<ReturnType<typeof summaryBudgets>>;
  notices: Awaited<ReturnType<typeof summaryNotices>>;
};

const shortMonth = new Intl.DateTimeFormat("es-UY", {
  month: "short",
  timeZone: "UTC",
});
const monthName = (on: string) =>
  shortMonth.format(new Date(`${on}T12:00:00Z`)).replace(".", "");
const linkClass =
  "underline decoration-white/30 underline-offset-4 hover:decoration-current";
const showDate = (on: string) => (
  <time dateTime={on}>{formatBankReference(on)}</time>
);

export function SummaryEmpty({
  children,
  unavailable = false,
}: {
  children: React.ReactNode;
  unavailable?: boolean;
}) {
  return (
    <p role={unavailable ? "status" : undefined} className="lab-muted text-sm">
      {children}
    </p>
  );
}

export function SummaryFlows({
  currency,
  fx,
  periods,
  today,
  totals,
}: {
  currency: Currency;
  fx: SummaryFx;
  periods: ReturnType<typeof summaryPeriods>;
  today: string;
  totals: MovementTotal[];
}) {
  const points = periods.months.map((period) => {
    const data = fx?.months.find((row) => row.period === period);
    return {
      period,
      label: monthName(`${period}-01`),
      income: data?.income ?? null,
      expense: data?.expense ?? null,
      result: data?.result ?? null,
      inProgress: today.startsWith(period),
    };
  });
  const expense =
    periods.selected && fx?.rows.find(({ kind }) => kind === "expense");
  // Statistics projects each subcategory into its parent. Keep the top-level
  // rows (and uncategorized) so every contribution appears once in the ring.
  const roots =
    fx?.spending.filter(
      ({ parentId, amount }) =>
        parentId === null && amountUnits(amount) > BigInt(0),
    ) ?? [];
  const categoryData = roots
    .slice(0, 5)
    .map(({ categoryId, category, amount }, index) => ({
      id: categoryId ?? "uncategorized",
      name: category,
      amount,
      color: `var(--data-category-${index + 1})`,
    }));
  if (roots.length > 5)
    categoryData.push({
      id: "remaining-categories",
      name: "Otros",
      amount: sumAmounts(roots.slice(5).map(({ amount }) => amount)),
      color: "var(--data-category-other)",
    });
  return (
    <>
      <div className="b-flows">
        {(["income", "expense"] as const).map((kind) => {
          const current =
            periods.selected && fx?.rows.find((row) => row.kind === kind);
          const previous = fx?.previous.find((row) => row.kind === kind);
          const change = comparison(
            current?.amount ?? null,
            previous?.amount ?? null,
            Math.min(current?.count ?? 0, previous?.count ?? 0),
            periods.comparison
              ? statisticsMonthLabel(periods.comparison.from.slice(0, 7))
              : "el período anterior",
          );
          const movement =
            change.delta === null ? BigInt(0) : amountUnits(change.delta);
          const favorable =
            kind === "income" ? movement > BigInt(0) : movement < BigInt(0);
          const reference = periods.selected?.complete
            ? "mes anterior"
            : "mismos días del mes anterior";
          return (
            <FlowCard
              key={kind}
              kind={kind}
              amounts={bankCurrencies.flatMap((currency) =>
                totals
                  .filter(
                    (row) => row.kind === kind && row.currency === currency,
                  )
                  .map(formatBankAmount),
              )}
              trend={points.map((point) =>
                point[kind] === null ? null : Number(point[kind]),
              )}
              variation={
                change.percent === null ? undefined : (
                  <span
                    className={`lab-delta ${movement === BigInt(0) ? "" : favorable ? "is-good" : "is-bad"}`}
                    title={`En ${currency} respecto del ${reference}`}
                  >
                    {movement !== BigInt(0) && (
                      <Icon
                        name={movement > BigInt(0) ? "trendUp" : "trendDown"}
                        duotone={false}
                        className="size-3.5"
                      />
                    )}
                    {change.percent}
                    <span className="sr-only">
                      {" "}
                      en {currency} respecto de {reference}
                    </span>
                  </span>
                )
              }
            />
          );
        })}
      </div>
      <Panel
        title="Flujo de los últimos seis meses"
        icon="stats"
        className="b-span-7 c-feature"
        action={
          <span className="lab-muted text-xs">
            {currency} · ingresos arriba, gastos abajo
          </span>
        }
      >
        {fx &&
        points.some(
          ({ income, expense }) => income !== null || expense !== null,
        ) ? (
          <CashflowChart data={points} currency={currency} height={264} />
        ) : (
          <SummaryEmpty unavailable={!fx}>
            {fx
              ? "Sin ingresos ni gastos con equivalencia en el período."
              : "El flujo de los últimos seis meses no está disponible."}
          </SummaryEmpty>
        )}
        {fx && fx.missing.length > 0 && (
          <SummaryEmpty>
            Algunos importes no tienen equivalencia por falta de cotización.
          </SummaryEmpty>
        )}
      </Panel>
      <Panel
        title="Gastos por categoría"
        icon="categories"
        className="b-span-5"
      >
        {expense && expense.amount !== null && categoryData.length > 0 ? (
          <CategoryDonut
            data={categoryData}
            total={expense.amount}
            currency={currency}
          />
        ) : (
          <SummaryEmpty unavailable={!fx}>
            {!periods.selected
              ? "El mes elegido todavía no comenzó."
              : !fx
                ? "Los gastos por categoría no están disponibles."
                : expense && expense.amount === null
                  ? "Faltan cotizaciones para mostrar todos los gastos del mes."
                  : "Sin gastos por categoría en el mes."}
          </SummaryEmpty>
        )}
      </Panel>
    </>
  );
}

export function SummaryPlanning({
  panels,
  today,
  period,
  cardsReady,
}: {
  panels: SummaryWidgets | null;
  today: string;
  period: string;
  cardsReady: boolean;
}) {
  const notices: SummaryNotice[] = [];
  const upcoming: (UpcomingItem & { dueOn: string })[] = [];
  const upcomingThrough = panels?.notices.upcomingThrough ?? today;
  const paymentDate = (dueOn: string) => ({
    major: dueOn.slice(-2),
    minor: monthName(dueOn),
    label: `Vence el ${formatBankReference(dueOn)}`,
  });
  for (const item of [
    ...(panels?.notices.loans ?? []),
    ...(panels?.notices.recurrences ?? []),
  ]) {
    const title = (
      <Link href={item.href} className={linkClass}>
        {item.title}
      </Link>
    );
    if (
      item.isPayment &&
      item.dueOn >= today &&
      item.dueOn <= upcomingThrough
    ) {
      upcoming.push({
        id: item.key,
        dueOn: item.dueOn,
        title,
        date: paymentDate(item.dueOn),
        detail: "Medio de pago sin registrar",
        amount: item.amount ?? "Importe sin registrar",
      });
    } else {
      notices.push({
        id: item.key,
        title,
        detail: (
          <>
            {item.timing}
            {item.amount && ` · ${item.amount}`}
          </>
        ),
        tone: "warning",
      });
    }
  }

  const cardPayments = new Map<string, UpcomingItem & { dueOn: string }>();
  for (const item of panels?.notices.cards ?? []) {
    const key = `card:${item.cardId}:${item.period}:${item.dueOn}:${item.dueSource}`;
    const href = `/tarjetas/${item.cardId}/resumen?ciclo=${item.period}`;
    const title = (
      <Link href={href} className={linkClass}>
        {item.cardName}
      </Link>
    );
    const amount = formatBankAmount(item);
    if (item.dueOn >= today && item.dueOn <= upcomingThrough) {
      const current = cardPayments.get(key);
      cardPayments.set(key, {
        id: key,
        dueOn: item.dueOn,
        title,
        date: paymentDate(item.dueOn),
        detail: `Tarjeta de crédito · ${item.dueSource === "estimated" ? "fecha estimada" : "fecha informada"}`,
        amount: current ? (
          <>
            {current.amount}
            <br />
            {amount}
          </>
        ) : (
          amount
        ),
      });
    } else {
      notices.push({
        id: `${key}:${item.currency}`,
        title,
        tone: item.alert === "informative" ? "info" : "warning",
        detail: (
          <>
            {item.alert === "informative"
              ? "Mínimo cubierto"
              : "Pago pendiente"}{" "}
            · {amount} · {showDate(item.dueOn)}
            {item.dueSource === "estimated" && " (estimado)"}
          </>
        ),
      });
    }
  }
  upcoming.push(...cardPayments.values());
  upcoming.sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  if (period === today.slice(0, 7)) {
    for (const { budget, percent, state } of budgetAlerts(
      panels?.budgets ?? [],
      period,
    )) {
      notices.push({
        id: `budget:${budget.id}`,
        title: "Aviso de presupuesto",
        detail: budgetAlertMessage(state, percent, budget.categoryName),
        tone: state === "danger" ? "critical" : "warning",
      });
    }
  }
  for (const fund of panels?.funds ?? []) {
    const goal = fundTargetNotices(fund, today);
    if (goal.reached || goal.overdue)
      notices.push({
        id: `fund:${fund.id}`,
        title: (
          <Link href="/fondos" className={linkClass}>
            {fund.name}
          </Link>
        ),
        detail: goal.reached ? "Meta alcanzada" : "Fecha de la meta superada",
        tone: goal.reached ? "info" : "warning",
      });
  }

  return (
    <>
      <Panel
        title="Tarjetas de crédito"
        icon="cards"
        className="b-span-7"
        action={<PanelLink href="/tarjetas">Ver ciclos</PanelLink>}
      >
        {panels?.cards.length ? (
          <CardObjects
            cards={panels.cards.map(
              ({
                card,
                cyclePeriod,
                closesOn,
                closingEstimated,
                dueDates,
                cycleProgress,
              }) => ({
                id: card.id,
                name: card.name,
                progress: cycleProgress,
                href: cyclePeriod
                  ? `/tarjetas/${card.id}/resumen?ciclo=${cyclePeriod}`
                  : "/tarjetas",
                debts: card.currencies.flatMap(({ debt, currency }) =>
                  debt === null
                    ? []
                    : [formatBankAmount({ amount: debt, currency })],
                ),
                footer: (
                  <>
                    {card.issuer && <span>{card.issuer}</span>}
                    <span>
                      {closesOn ? (
                        <>
                          Cierre {showDate(closesOn)}
                          {closingEstimated && " (estimado)"}
                        </>
                      ) : (
                        "Sin fecha de cierre"
                      )}
                    </span>
                    {dueDates.length ? (
                      dueDates.map(({ currency, dueOn, estimated }) => (
                        <span key={currency}>
                          Vence {showDate(dueOn)}
                          {estimated && " (estimado)"}
                          {dueDates.length > 1 && ` · ${currency}`}
                        </span>
                      ))
                    ) : (
                      <span>Sin fecha de vencimiento</span>
                    )}
                  </>
                ),
              }),
            )}
          />
        ) : (
          <SummaryEmpty unavailable={!panels || !cardsReady}>
            {!panels || !cardsReady
              ? "Las tarjetas no están disponibles."
              : "Todavía no hay tarjetas de crédito activas."}
          </SummaryEmpty>
        )}
      </Panel>
      <Panel
        title="Avisos"
        icon="notices"
        className="b-span-5"
        action={<PanelLink href="/avisos">Ver avisos</PanelLink>}
      >
        {notices.length ? (
          <Notices notices={notices.slice(0, 5)} />
        ) : (
          <SummaryEmpty unavailable={!panels}>
            {panels
              ? "Sin avisos pendientes."
              : "Los avisos no están disponibles."}
          </SummaryEmpty>
        )}
      </Panel>
      <Panel
        title="Fondos de ahorro"
        icon="funds"
        className="b-span-4"
        action={<PanelLink href="/fondos">Ver fondos</PanelLink>}
      >
        {panels?.funds?.length ? (
          <FundsList
            items={panels.funds.slice(0, 4).map((fund) => ({
              id: fund.id,
              title: fund.name,
              saved: formatBankAmount({
                amount: fund.reservedAmount,
                currency: fund.currency,
              }),
              target: fund.targetAmount
                ? formatBankAmount({
                    amount: fund.targetAmount,
                    currency: fund.currency,
                  })
                : null,
              ratio: fund.targetAmount
                ? Number(fund.reservedAmount) / Number(fund.targetAmount)
                : null,
              state: fundStatuses[fund.status],
            }))}
          />
        ) : (
          <SummaryEmpty unavailable={!panels?.funds}>
            {panels?.funds
              ? "Todavía no hay fondos de ahorro."
              : "Los fondos de ahorro no están disponibles."}
          </SummaryEmpty>
        )}
      </Panel>
      <Panel
        title="Presupuestos"
        icon="budgets"
        className="b-span-4"
        action={
          <PanelLink href={`/presupuestos?month=${period}`}>
            Ver presupuestos
          </PanelLink>
        }
      >
        {panels?.budgets?.length ? (
          <BudgetList
            items={panels.budgets.slice(0, 4).map((budget) => {
              const consumed = budget.progress?.consumed;
              const percent =
                consumed === undefined
                  ? null
                  : budgetAlertPercent(consumed, budget.effectiveLimit);
              const state = budgetAlertState(percent);
              return {
                id: budget.id,
                title: budget.categoryName,
                limit: formatBankAmount({
                  amount: budget.effectiveLimit,
                  currency: budget.currency,
                }),
                spent:
                  consumed === undefined
                    ? null
                    : formatBankAmount({
                        amount: consumed,
                        currency: budget.currency,
                      }),
                percent,
                tone:
                  state === "danger"
                    ? "critical"
                    : state === "warning"
                      ? "warning"
                      : "good",
                label:
                  percent === 100
                    ? "Límite alcanzado"
                    : state === "danger"
                      ? "Excedido"
                      : state === "warning"
                        ? "Cerca"
                        : "En rango",
              };
            })}
          />
        ) : (
          <SummaryEmpty unavailable={!panels?.budgets}>
            {panels?.budgets
              ? "Todavía no hay presupuestos para este mes."
              : "Los presupuestos no están disponibles."}
          </SummaryEmpty>
        )}
      </Panel>
      <Panel
        title="Próximos pagos"
        icon="recurring"
        className="b-span-4"
        action={<PanelLink href="/recurrentes">Ver recurrentes</PanelLink>}
      >
        {upcoming.length ? (
          <UpcomingList items={upcoming.slice(0, 5)} />
        ) : (
          <SummaryEmpty unavailable={!panels}>
            {panels
              ? "Sin pagos próximos con fecha registrada."
              : "Los próximos pagos no están disponibles."}
          </SummaryEmpty>
        )}
      </Panel>
    </>
  );
}
