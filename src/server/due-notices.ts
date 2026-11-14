import "server-only";
import type pg from "pg";
import {
  defaultNoticeLeadDays,
  loanDueNotice,
  recurrenceDueNotice,
  type DueNotice,
} from "../domain/due-notices.ts";
import { latestTrackedIndex } from "../domain/recurrence-plan.ts";
import { listLoans } from "./loans.ts";
import { loansReady } from "./movements.ts";
import { recurrenceTrackingReady } from "./recurrence-links.ts";
import { listRecurrences, recurrencesReady } from "./recurrences.ts";
import { trackedPeriodPage, trackedPeriods } from "./recurrence-settlements.ts";

/**
 * F4-05: avisos internos por vencimientos ciertos de deudas y recurrentes
 * (RF-037/038; CA-049; v9.36/v9.44). Lecturas por titular; nunca inventa
 * fechas y no emite más de un aviso por obligación (antirruido).
 */

const byDueOn = (a: DueNotice, b: DueNotice) =>
  a.dueOn.localeCompare(b.dueOn) || a.key.localeCompare(b.key);

export async function listLoanDueNotices(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
  upcomingPaymentDays = 0,
) {
  if (!(await loansReady(client))) return [];
  const loans = await listLoans(client, ownerId);
  return loans
    .flatMap((loan) => {
      const notice = loanDueNotice({
        loanId: loan.id,
        concept: loan.concept,
        direction: loan.direction,
        currency: loan.currency,
        dueOn: loan.dueOn,
        outstanding: loan.outstanding,
        today,
        leadDays:
          loan.direction === "payable" && upcomingPaymentDays > 0
            ? Math.max(
                upcomingPaymentDays,
                loan.noticeLeadDays ?? defaultNoticeLeadDays,
              )
            : loan.noticeLeadDays,
      });
      return notice
        ? [{ ...notice, isPayment: loan.direction === "payable" }]
        : [];
    })
    .sort(byDueOn);
}

export async function listRecurrenceDueNotices(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
  upcomingPaymentDays = defaultNoticeLeadDays,
) {
  if (!(await recurrencesReady(client))) return [];
  if (!(await recurrenceTrackingReady(client))) return [];
  const through = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const paymentHorizon = through(upcomingPaymentDays);
  const incomeHorizon = through(defaultNoticeLeadDays);
  // Solo fecha cierta (v9.36): los períodos aproximados o sin fecha no
  // generan aviso de vencimiento; su estado ya es visible en Recurrentes.
  const seriesList = (
    await listRecurrences(client, ownerId, today, true)
  ).filter((series) => series.dateMode === "exact");
  const notices: (DueNotice & { isPayment: boolean })[] = [];
  for (const series of seriesList) {
    const latest = latestTrackedIndex(
      series,
      series.kind === "expense" ? paymentHorizon : incomeHorizon,
    );
    if (latest < 0) continue;
    const { indices } = trackedPeriodPage(series, latest);
    const periods = await trackedPeriods(client, ownerId, series, indices);
    for (const period of periods) {
      const notice = recurrenceDueNotice({
        seriesId: series.id,
        concept: series.concept,
        currency: series.currency,
        index: period.index,
        key: period.key,
        dueOn: period.dueOn,
        status: period.status,
        referenceAmount: period.referenceAmount,
        remaining: period.remaining,
        today,
        leadDays:
          series.kind === "expense"
            ? upcomingPaymentDays
            : defaultNoticeLeadDays,
      });
      if (notice)
        notices.push({ ...notice, isPayment: series.kind === "expense" });
    }
  }
  return notices.sort(byDueOn);
}
