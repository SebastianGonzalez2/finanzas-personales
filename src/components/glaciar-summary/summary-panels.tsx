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
  summaryRecurrenceNotices,
} from "@/server/summary-panels";
import type { summaryFlowFx } from "@/server/statistics";
import { Icon } from "../ui/icon";
import { CategoryDonut, ExpenseTrendChart } from "./charts";
import { BudgetList, UpcomingList, type UpcomingItem } from "./lists";
import { Panel, PanelLink } from "./panel";
import { ExpenseCard, Notices, type SummaryNotice } from "./pieces";

export type SummaryFx = Awaited<ReturnType<typeof summaryFlowFx>>;
// SIMP-03: el Resumen solo muestra presupuestos y recurrentes de gasto.
export type SummaryWidgets = {
  budgets: Awaited<ReturnType<typeof summaryBudgets>>;
  notices: Awaited<ReturnType<typeof summaryRecurrenceNotices>>;
};

const shortMonth = new Intl.DateTimeFormat("es-UY", {
  month: "short",
  timeZone: "UTC",
});
const monthName = (on: string) =>
  shortMonth.format(new Date(`${on}T12:00:00Z`)).replace(".", "");
const linkClass =
  "underline decoration-white/30 underline-offset-4 hover:decoration-current";

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

export function SummaryExpenses({
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
  const points = periods.months.map((period) => ({
    period,
    label: monthName(`${period}-01`),
    expense: fx?.months.find((row) => row.period === period)?.expense ?? null,
    inProgress: today.startsWith(period),
  }));
  const expense =
    periods.selected && fx?.rows.find(({ kind }) => kind === "expense");
  const previous = fx?.previous.find(({ kind }) => kind === "expense");
  const change = comparison(
    expense?.amount ?? null,
    previous?.amount ?? null,
    Math.min(expense?.count ?? 0, previous?.count ?? 0),
    periods.comparison
      ? statisticsMonthLabel(periods.comparison.from.slice(0, 7))
      : "el período anterior",
  );
  const movement =
    change.delta === null ? BigInt(0) : amountUnits(change.delta);
  const reference = periods.selected?.complete
    ? "mes anterior"
    : "mismos días del mes anterior";
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
      <ExpenseCard
        amounts={bankCurrencies.flatMap((code) =>
          totals
            .filter((row) => row.kind === "expense" && row.currency === code)
            .map(formatBankAmount),
        )}
        trend={points.map((point) =>
          point.expense === null ? null : Number(point.expense),
        )}
        variation={
          change.percent === null ? undefined : (
            <span
              className={`lab-delta ${movement === BigInt(0) ? "" : movement < BigInt(0) ? "is-good" : "is-bad"}`}
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
        comparison={
          fx &&
          periods.selected && (
            <p className="lab-muted text-sm">
              {previous?.amount != null && expense?.amount != null
                ? `${formatBankAmount({ amount: expense.amount, currency })} este mes frente a ${formatBankAmount({ amount: previous.amount, currency })} ${periods.selected?.complete ? "en el mes anterior" : "en los mismos días del mes anterior"} (${currency}).`
                : change.label}
            </p>
          )
        }
      />
      <Panel
        title="Gastos por categoría"
        icon="categories"
        className="b-span-5"
        action={<PanelLink href="/estadisticas">Ver estadísticas</PanelLink>}
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
      <Panel
        title="Evolución de los últimos seis meses"
        icon="stats"
        className="b-span-7 c-feature"
        action={<span className="lab-muted text-xs">{currency}</span>}
      >
        {fx && points.some(({ expense: amount }) => amount !== null) ? (
          <ExpenseTrendChart data={points} currency={currency} height={240} />
        ) : (
          <SummaryEmpty unavailable={!fx}>
            {fx
              ? "Sin gastos con equivalencia en el período."
              : "La evolución de gastos no está disponible."}
          </SummaryEmpty>
        )}
        {fx && fx.missing.length > 0 && (
          <SummaryEmpty>
            Algunos importes no tienen equivalencia por falta de cotización.
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
}: {
  panels: SummaryWidgets | null;
  today: string;
  period: string;
}) {
  const notices: SummaryNotice[] = [];
  const upcoming: (UpcomingItem & { dueOn: string })[] = [];
  const upcomingThrough = panels?.notices.upcomingThrough ?? today;
  for (const item of panels?.notices.recurrences ?? []) {
    const title = (
      <Link href={item.href} className={linkClass}>
        {item.title}
      </Link>
    );
    if (item.dueOn >= today && item.dueOn <= upcomingThrough) {
      upcoming.push({
        id: item.key,
        dueOn: item.dueOn,
        title,
        date: {
          major: item.dueOn.slice(-2),
          minor: monthName(item.dueOn),
          label: `Vence el ${formatBankReference(item.dueOn)}`,
        },
        detail: "Gasto recurrente",
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

  return (
    <>
      <Panel
        title="Presupuestos"
        icon="budgets"
        className="b-span-5"
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
        className="b-span-6"
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
      <Panel
        title="Avisos"
        icon="notices"
        className="b-span-6"
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
    </>
  );
}
