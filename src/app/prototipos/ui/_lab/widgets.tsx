"use client";

import {
  BudgetList as SharedBudgetList,
  UpcomingList as SharedUpcomingList,
  FundsList as SharedFundsList,
  RecentList,
} from "@/components/glaciar-summary/lists";
import {
  budgetState,
  budgets,
  formatUYU,
  funds,
  installments,
  money,
  movements,
  shortDate,
  upcomingRecurring,
  variation,
} from "./data";
import { LabIcon } from "./icons";
import { KindBadge, MovementAmount } from "./movements";

export { Panel, PanelLink } from "@/components/glaciar-summary/panel";

/**
 * Variación frente al mes anterior. Para gastos, bajar es favorable: el tono
 * lo indica, pero el signo y el texto también (no solo el color).
 */
export function Delta({
  current,
  previous,
  inverse = false,
}: {
  current: string;
  previous: string;
  inverse?: boolean;
}) {
  const { value, label } = variation(current, previous);
  const favorable = inverse ? value < 0 : value > 0;
  return (
    <span className={`lab-delta ${favorable ? "is-good" : "is-bad"}`}>
      <LabIcon
        name={value >= 0 ? "trendUp" : "trendDown"}
        duotone={false}
        className="size-3.5"
      />
      {label}
      <span className="sr-only"> respecto del mes anterior</span>
    </span>
  );
}

export function BudgetList({ limit }: { limit?: number }) {
  return (
    <SharedBudgetList
      items={budgets.slice(0, limit).map((budget) => {
        const state = budgetState(budget.spent, budget.limit);
        return {
          id: budget.name,
          title: budget.name,
          spent: formatUYU(budget.spent),
          limit: formatUYU(budget.limit),
          percent: Math.round(state.ratio * 100),
          tone: state.tone,
          label: state.label,
        };
      })}
    />
  );
}

export function RecentMovements({
  count = 5,
  dense = false,
}: {
  count?: number;
  dense?: boolean;
}) {
  return (
    <RecentList
      dense={dense}
      items={movements
        .filter((movement) => movement.kind !== "checkpoint")
        .slice(0, count)
        .map((movement) => ({
          id: movement.id,
          badge: <KindBadge kind={movement.kind} />,
          title: movement.concept,
          detail: (
            <>
              {shortDate(movement.effectiveOn)}
              {movement.category ? ` · ${movement.category}` : ""}
            </>
          ),
          amount: <MovementAmount movement={movement} />,
        }))}
    />
  );
}

export function UpcomingList({
  withInstallments = true,
}: {
  withInstallments?: boolean;
}) {
  const upcoming = upcomingRecurring.map((item) => {
    const [, month, day] = item.dueOn.split("-");
    return {
      id: item.concept,
      title: item.concept,
      date: {
        major: day,
        minor: month === "11" ? "nov" : "dic",
        label: `Vence el ${shortDate(item.dueOn)}`,
      },
      detail: item.method,
      amount: money(item.amount, item.currency),
    };
  });
  return (
    <SharedUpcomingList
      items={[
        ...upcoming,
        ...(withInstallments
          ? installments.map((item) => ({
              id: item.concept,
              title: item.concept,
              date: {
                major: String(item.current),
                minor: `de ${item.total}`,
                label: `Cuota ${item.current} de ${item.total}`,
                installment: true,
              },
              detail: `Cuota ${item.current} de ${item.total}`,
              amount: money(item.amount, item.currency),
            }))
          : []),
      ]}
    />
  );
}

export function FundsList({ style }: { style: "bars" | "rings" }) {
  return (
    <SharedFundsList
      style={style}
      items={funds.map((fund) => ({
        id: fund.name,
        title: fund.name,
        saved: money(fund.saved, fund.currency),
        target: money(fund.target, fund.currency),
        ratio: Number(fund.saved) / Number(fund.target),
      }))}
    />
  );
}
