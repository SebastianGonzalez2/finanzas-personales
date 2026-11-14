import "server-only";
import type pg from "pg";
import { cycleClosingOn } from "../domain/card-cycles.ts";
import type { CatalogCard } from "../domain/cards.ts";
import {
  installmentPeriodAt,
  isInstallmentPeriod,
} from "../domain/installments.ts";
import { budgetsReady, readBudgets } from "./budgets.ts";
import { savingsFundsReady } from "./bank-balances.ts";
import {
  cardCyclesReady,
  listCardCycleAlerts,
  reportCardCycles,
} from "./card-cycles.ts";
import { listLoanDueNotices, listRecurrenceDueNotices } from "./due-notices.ts";
import { listSavingsFunds } from "./savings-funds.ts";

export async function summaryCards(
  client: pg.PoolClient,
  ownerId: string,
  cards: CatalogCard[],
  today: string,
) {
  const period = today.slice(0, 7);
  const previous = installmentPeriodAt(period, -1);
  const next = installmentPeriodAt(period, 1);
  const ready = cards.length > 0 && (await cardCyclesReady(client));
  const cycles = ready
    ? await reportCardCycles(
        client,
        ownerId,
        cards,
        [previous, period, next].filter(isInstallmentPeriod),
        today,
      )
    : [];
  return cards.map((card) => {
    const ownCycles = cycles.filter((entry) => entry.card.id === card.id);
    const current = ownCycles.find((entry) => entry.month === period);
    const closing =
      current && cycleClosingOn(period, current.schedule, current.dates);
    const active =
      closing && closing < today
        ? ownCycles.find((entry) => entry.month === next)
        : current;
    const before = ownCycles.find(
      (entry) =>
        active && entry.month === installmentPeriodAt(active.month, -1),
    );
    const closesOn =
      active && cycleClosingOn(active.month, active.schedule, active.dates);
    const previousClose =
      before && cycleClosingOn(before.month, before.schedule, before.dates);
    const cycleProgress =
      closesOn &&
      previousClose &&
      previousClose < closesOn &&
      previousClose < today
        ? Math.min(
            100,
            Math.round(
              ((Date.parse(today) - Date.parse(previousClose)) /
                (Date.parse(closesOn) - Date.parse(previousClose))) *
                100,
            ),
          )
        : null;

    return {
      card,
      cyclePeriod: active?.month ?? null,
      closesOn: closesOn || null,
      closingEstimated: Boolean(closesOn && !active?.dates.closingOn),
      dueDates:
        active?.summaries.flatMap(({ currency, dueOn, dueSource }) =>
          dueOn
            ? [{ currency, dueOn, estimated: dueSource === "estimated" }]
            : [],
        ) ?? [],
      cycleProgress,
    };
  });
}

export async function summaryNotices(
  client: pg.PoolClient,
  ownerId: string,
  cards: CatalogCard[],
  today: string,
) {
  const upcomingDays = 30;
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + upcomingDays);
  const upcomingThrough = horizon.toISOString().slice(0, 10);
  return {
    cards:
      cards.length > 0 && (await cardCyclesReady(client))
        ? await listCardCycleAlerts(
            client,
            ownerId,
            cards,
            today,
            upcomingThrough,
          )
        : [],
    loans: await listLoanDueNotices(client, ownerId, today, upcomingDays),
    recurrences: await listRecurrenceDueNotices(
      client,
      ownerId,
      today,
      upcomingDays,
    ),
    upcomingThrough,
  };
}

export async function summaryFunds(client: pg.PoolClient, ownerId: string) {
  if (!(await savingsFundsReady(client))) return null;
  return (await listSavingsFunds(client, ownerId)).filter(
    ({ status }) => status !== "closed",
  );
}

export async function summaryBudgets(
  client: pg.PoolClient,
  ownerId: string,
  period: string,
) {
  if (!(await budgetsReady(client))) return null;
  return readBudgets(client, ownerId, period);
}
