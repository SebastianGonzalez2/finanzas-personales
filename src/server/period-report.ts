import "server-only";
import type pg from "pg";
import { bankCurrencies } from "../domain/bank-balances.ts";
import { cycleAmount } from "../domain/card-cycles.ts";
import {
  historyKinds,
  historyStates,
  parseHistoryParams,
} from "../domain/history.ts";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import { listBankBalances } from "./bank-balances.ts";
import {
  budgetEstimates,
  budgetReferenceDates,
  budgetsReady,
  listBudgets,
  readBudgets,
} from "./budgets.ts";
import { classificationReady } from "./classification.ts";
import { reportCardCycles } from "./card-cycles.ts";
import { listCards } from "./cards.ts";
import { listHistory } from "./history.ts";
import { bankBenefitsReady } from "./bank-benefit-schema.ts";
import type { Currency } from "../domain/money.ts";
import type { ReportPeriod } from "../lib/export/report-format.ts";

export const reportRowLimit = 4000;
export const paymentBankKind = "Pago de tarjeta (débito bancario)";
export const paymentFeeKind = "Comisión bancaria de pago";
export type ReportRows = Record<string, string[][]>;

export function reportMidpoint({ from, to }: ReportPeriod): string {
  const day = 86_400_000;
  const start = Date.parse(from);
  const days = (Date.parse(to) - start) / day + 1;
  return new Date(start + (Math.ceil(days / 2) - 1) * day)
    .toISOString()
    .slice(0, 10);
}

export function reportMonths({ from, to }: ReportPeriod) {
  const months = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  for (;;) {
    const month = start.toISOString().slice(0, 7);
    months.push(month);
    if (month === to.slice(0, 7)) break;
    start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return months;
}

async function reportTotals(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
) {
  const benefits = await bankBenefitsReady(client);
  const classified = await classificationReady(client);
  const { rows } = await client.query<{
    concept: string;
    currency: string;
    total: string;
    first: string;
    second: string;
  }>(
    `
    WITH flows(kind, currency, amount, on_date, category_id) AS (
      -- Like Estadísticas, an income split between categories counts by part.
      SELECT 'Ingreso', e.currency, ${classified ? "coalesce(a.amount, e.amount_signed)" : "e.amount_signed"},
             f.effective_on, ${classified ? "CASE WHEN a.event_id IS NULL THEN m.category_id ELSE a.category_id END" : "m.category_id"}
        FROM finance.financial_events f
        JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
        JOIN finance.bank_effects e ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
        ${classified ? "LEFT JOIN finance.current_movement_allocations a ON (a.owner_id, a.event_id) = (f.owner_id, f.id)" : ""}
       WHERE f.owner_id = $1 AND f.kind = 'income' AND f.status = 'confirmed'
      ${
        benefits
          ? `UNION ALL
      SELECT 'Ingreso', b.currency, b.amount, f.effective_on, NULL::uuid
        FROM finance.bank_benefits b
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (b.owner_id, b.event_id)
       WHERE b.owner_id = $1 AND f.status = 'confirmed'`
          : ""
      }
      UNION ALL
      SELECT 'Gasto', x.currency, x.amount, x.effective_on, x.category_id
        FROM finance.budget_expenses x WHERE x.owner_id = $1
      UNION ALL
      SELECT 'Gasto', o.currency, o.expense, f.effective_on, NULL
        FROM finance.loan_operations o
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
       WHERE o.owner_id = $1 AND f.status = 'confirmed' AND o.expense > 0
      UNION ALL
      SELECT 'Reembolso acreditado', r.currency, r.amount, f.effective_on, NULL
        FROM finance.purchase_refunds r
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
       WHERE r.owner_id = $1 AND r.action = 'credit' AND f.status = 'confirmed'
    ), scoped AS (SELECT * FROM flows WHERE on_date BETWEEN $2::date AND $3::date)
    SELECT concept, currency,
           sum(amount)::numeric(20,4)::text AS total,
           coalesce(sum(amount) FILTER (WHERE on_date <= $4::date), 0)::numeric(20,4)::text AS first,
           coalesce(sum(amount) FILTER (WHERE on_date > $4::date), 0)::numeric(20,4)::text AS second
      FROM (
        SELECT kind AS concept, currency, amount, on_date FROM scoped
        UNION ALL
        SELECT 'Resultado', currency, CASE WHEN kind = 'Gasto' THEN -amount ELSE amount END, on_date
          FROM scoped WHERE kind IN ('Ingreso', 'Gasto')
        UNION ALL
        SELECT s.kind || ' por categoría · ' || coalesce(c.name, 'Sin categoría'), s.currency, s.amount, s.on_date
          FROM scoped s LEFT JOIN finance.categories c ON (c.owner_id, c.id) = ($1, s.category_id)
         WHERE s.kind IN ('Ingreso', 'Gasto')
      ) totals
     GROUP BY concept, currency ORDER BY currency, concept
     LIMIT ${reportRowLimit + 1}`,
    [owner, period.from, period.to, reportMidpoint(period)],
  );
  return rows.map(({ concept, currency, total, first, second }) => [
    concept,
    currency,
    total,
    first,
    second,
  ]);
}

async function reportMovements(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
) {
  const query = parseHistoryParams({ ...period, status: "confirmed" });
  if ("error" in query) throw new Error("Período inválido");
  const { entries, hasNextPage } = await listHistory(
    client,
    owner,
    query,
    reportRowLimit,
  );
  if (hasNextPage) return null;
  const classified = await classificationReady(client);
  const { rows } = await client.query<{
    id: string;
    card: string | null;
    bank: string | null;
    installments: number | null;
    category: string | null;
    purchaseId: string | null;
    refundRequest: boolean;
  }>(
    `
    SELECT f.id, credit.name AS card, debit.name AS bank, p.installment_count AS installments,
      ${classified ? "coalesce(allocated.names, split.names)" : "split.names"} AS category, r.purchase_id AS "purchaseId",
      (r.action = 'pending') IS TRUE AS "refundRequest"
      FROM finance.financial_events f
      LEFT JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
      LEFT JOIN finance.purchase_refunds r ON (r.owner_id, r.event_id) = (f.owner_id, f.id)
      LEFT JOIN finance.credit_operations cancelled ON (cancelled.owner_id, cancelled.event_id) = (r.owner_id, r.purchase_id)
        AND r.action = 'cancel_installments'
      LEFT JOIN finance.cards credit ON (credit.owner_id, credit.id) = (f.owner_id, coalesce(o.card_id, cancelled.card_id))
      LEFT JOIN finance.mixed_purchases m ON (m.owner_id, m.event_id) = (f.owner_id, coalesce(r.purchase_id, f.id))
        AND (r.event_id IS NULL OR EXISTS (
          SELECT 1 FROM finance.refund_parts part
          WHERE (part.owner_id, part.event_id) = (r.owner_id, r.event_id) AND part.method = 'debit'
        ))
      LEFT JOIN finance.cards debit ON (debit.owner_id, debit.id) = (m.owner_id, m.debit_card_id)
      LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (f.owner_id, f.id)
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT coalesce(c.name, 'Sin categoría'), ', ' ORDER BY coalesce(c.name, 'Sin categoría')) AS names
        FROM finance.mixed_purchase_categories s
        LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (s.owner_id, s.category_id)
        WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id)
      ) split ON true
      ${
        classified
          ? `LEFT JOIN LATERAL (
        -- The current category breakdown replaces the original attribution.
        SELECT string_agg(DISTINCT coalesce(c.name, 'Sin categoría'), ', ' ORDER BY coalesce(c.name, 'Sin categoría')) AS names
        FROM finance.current_movement_allocations a
        LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (a.owner_id, a.category_id)
        WHERE (a.owner_id, a.event_id) = (f.owner_id, f.id)
      ) allocated ON true`
          : ""
      }
     WHERE f.owner_id = $1 AND f.id = ANY($2::uuid[])`,
    [owner, entries.map(({ id }) => id)],
  );
  const metadata = new Map(rows.map((row) => [row.id, row]));
  // History lists a card payment by the debt it settles. What leaves the bank
  // (another currency, plus the bank fee, which Resumen counts as an expense)
  // is added as separate rows so the totals can be traced.
  const paymentIds = entries
    .filter(({ kind }) => kind === "card_payment")
    .map(({ id }) => id);
  const { rows: bankLegs } = paymentIds.length
    ? await client.query<{
        id: string;
        currency: Currency;
        bankCurrency: Currency | null;
        bankAmount: string | null;
        fee: string;
      }>(
        `SELECT l.event_id AS id, l.currency, l.bank_currency AS "bankCurrency",
                l.bank_amount::text AS "bankAmount", l.fee::text AS fee
           FROM finance.credit_lines l
          WHERE l.owner_id = $1 AND l.event_id = ANY($2::uuid[])
          ORDER BY l.event_id, l.currency`,
        [owner, paymentIds],
      )
    : { rows: [] };
  const legsOf = Map.groupBy(bankLegs, ({ id }) => id);
  return entries.flatMap((entry) => {
    const meta = metadata.get(entry.id);
    // A fulfilled request remains in History as a trace of the refund process.
    if (meta?.refundRequest) return [];
    const lines = entry.cardAmounts?.length
      ? entry.cardAmounts
      : [{ currency: entry.currency, amount: entry.amount }];
    const values =
      entry.otherCurrency && entry.otherAmount
        ? [
            ...lines,
            { currency: entry.otherCurrency, amount: entry.otherAmount },
          ]
        : lines;
    const row = (
      kind: string,
      concept: string,
      currency: string,
      amount: string,
    ) => [
      entry.effectiveOn,
      kind,
      concept,
      meta?.category ?? entry.category ?? "",
      meta?.bank ?? "",
      meta?.card ?? "",
      meta?.installments?.toString() ?? "",
      currency,
      amount,
      historyStates[entry.status],
      entry.id,
      meta?.purchaseId ?? "",
    ];
    const bank = (legsOf.get(entry.id) ?? []).flatMap((leg) => [
      ...(leg.bankCurrency &&
      leg.bankAmount &&
      leg.bankCurrency !== leg.currency
        ? [
            row(
              paymentBankKind,
              entry.concept,
              leg.bankCurrency,
              leg.bankAmount,
            ),
          ]
        : []),
      ...(leg.bankCurrency && /[1-9]/.test(leg.fee)
        ? [row(paymentFeeKind, entry.concept, leg.bankCurrency, leg.fee)]
        : []),
    ]);
    return [
      ...values.map(({ currency, amount }) =>
        row(
          entry.kind === "purchase_refund" && entry.note
            ? entry.note
            : historyKinds[entry.kind],
          entry.concept,
          currency,
          amount,
        ),
      ),
      ...bank,
    ];
  });
}

async function reportFunds(client: pg.PoolClient, owner: string, to: string) {
  const { rows } = await client.query<{
    name: string;
    currency: string;
    contributed: string;
    target: string | null;
    available: string;
  }>(
    `
    SELECT coalesce(configuration.name, f.name) AS name, f.currency,
           effects.contributed::numeric(20,4)::text AS contributed,
           target.amount::numeric(20,4)::text AS target,
           (effects.reserved - commitments.total)::numeric(20,4)::text AS available
      FROM finance.savings_funds f
      LEFT JOIN LATERAL (
        SELECT configuration->>'name' AS name FROM finance.fund_changes c
         WHERE (c.owner_id, c.fund_id) = (f.owner_id, f.id)
           AND (c.created_at AT TIME ZONE 'America/Montevideo')::date <= $2
           AND c.configuration ? 'name' ORDER BY c.version DESC LIMIT 1
      ) configuration ON true
      LEFT JOIN LATERAL (
        SELECT configuration->>'targetAmount' AS amount FROM finance.fund_changes c
         WHERE (c.owner_id, c.fund_id) = (f.owner_id, f.id)
           AND (c.created_at AT TIME ZONE 'America/Montevideo')::date <= $2
           AND c.configuration ? 'targetAmount' ORDER BY c.version DESC LIMIT 1
      ) target ON true
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(r.delta) FILTER (WHERE r.delta > 0), 0) AS contributed,
               coalesce(sum(r.delta), 0) AS reserved
          FROM finance.reserve_effects r
          JOIN finance.fund_changes c ON (c.owner_id, c.idempotency_key) = (r.owner_id, r.command_id)
         WHERE (r.owner_id, r.fund_id) = (f.owner_id, f.id)
           AND (c.created_at AT TIME ZONE 'America/Montevideo')::date <= $2
      ) effects
      CROSS JOIN LATERAL (
        -- Same unpaid ceiling as fund_purchase_commitments, with the purchase,
        -- payments and credits each bounded by the report's closing date.
        SELECT coalesce(sum(greatest(0, least(
          a.amount - coalesce(payments.consumed, 0),
          l.amount + coalesce(x.delta, 0) - coalesce(payments.paid, 0) - coalesce(refunds.credited, 0)
        ))), 0) AS total
          FROM finance.fund_event_allocations a
          JOIN finance.financial_events purchase ON (purchase.owner_id, purchase.id) = (a.owner_id, a.event_id)
          JOIN finance.credit_lines l ON (l.owner_id, l.event_id, l.currency) = (a.owner_id, a.event_id, a.currency)
          LEFT JOIN finance.card_credit_changes x ON (x.owner_id, x.event_id, x.currency) = (l.owner_id, l.event_id, l.currency)
          LEFT JOIN LATERAL (
            SELECT sum(p.amount) AS paid, sum(u.amount) AS consumed
              FROM finance.credit_allocations p
              JOIN finance.financial_events payment ON (payment.owner_id, payment.id) = (p.owner_id, p.payment_id)
              LEFT JOIN finance.fund_payment_allocations u
                ON (u.owner_id, u.payment_id, u.currency, u.purchase_id) = (p.owner_id, p.payment_id, p.currency, p.purchase_id)
             WHERE (p.owner_id, p.purchase_id, p.currency) = (a.owner_id, a.event_id, a.currency)
               AND payment.status = 'confirmed' AND payment.effective_on <= $2
          ) payments ON true
          LEFT JOIN LATERAL (
            SELECT sum(part.amount) AS credited
              FROM finance.purchase_refunds r
              JOIN finance.financial_events refund ON (refund.owner_id, refund.id) = (r.owner_id, r.event_id)
              JOIN finance.refund_parts part ON (part.owner_id, part.event_id) = (r.owner_id, r.event_id)
             WHERE (r.owner_id, r.purchase_id) = (a.owner_id, a.event_id)
               AND r.action = 'credit' AND part.method = 'credit'
               AND refund.status = 'confirmed' AND refund.effective_on <= $2
          ) refunds ON true
         WHERE (a.owner_id, a.fund_id) = (f.owner_id, f.id)
           AND a.purpose = 'commitment' AND purchase.kind = 'card_purchase'
           AND purchase.status = 'confirmed' AND purchase.effective_on <= $2
      ) commitments
     WHERE f.owner_id = $1 AND (f.created_at AT TIME ZONE 'America/Montevideo')::date <= $2
     ORDER BY name, f.id LIMIT ${reportRowLimit + 1}`,
    [owner, to],
  );
  return rows.map(({ name, currency, contributed, target, available }) => [
    name,
    currency,
    contributed,
    target ?? "",
    available,
  ]);
}

// The report converts budget consumption with the same references Presupuestos
// fixes the first time a month is opened. These two steps give the export the
// same result for months the user never opened: first the pending dates (so the
// providers can be queried outside any transaction), then the capture itself.
export async function reportReferenceDates(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
  today = bankReferenceToday(),
) {
  const dates = new Set<string>();
  for (const month of reportMonths(period))
    for (const date of await budgetReferenceDates(client, owner, month, today))
      dates.add(date);
  return [...dates];
}

export async function prepareReportBudgets(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
  today = bankReferenceToday(),
) {
  if (!(await budgetsReady(client))) return;
  for (const month of reportMonths(period))
    await listBudgets(client, owner, month, today);
}

export async function loadPeriodReport(
  client: pg.PoolClient,
  owner: string,
  period: ReportPeriod,
  today = bankReferenceToday(),
): Promise<ReportRows | null> {
  const movements = await reportMovements(client, owner, period);
  if (!movements || movements.length > reportRowLimit) return null;
  const months = reportMonths(period);
  const summary = await reportTotals(client, owner, period);
  const balances = await listBankBalances(
    client,
    owner,
    bankCurrencies,
    undefined,
    period.to,
  );
  const cards = (await listCards(client, owner)).filter(
    (card) => card.kind === "credit",
  );
  const cycles = await reportCardCycles(
    client,
    owner,
    cards,
    months,
    period.to,
  );
  const budgets: string[][] = [];
  for (const month of months) {
    const items = await readBudgets(
      client,
      owner,
      month,
      period.from,
      period.to,
      {
        today,
        estimates: await budgetEstimates(client, owner, month, today, false),
      },
    );
    for (const item of items) {
      const spent = item.progress?.consumed;
      const references = item.references.map(
        (ref) =>
          `${ref.fromCurrency} a ${item.currency} ${ref.rate} (${ref.date}, ${ref.source}${ref.provisional ? ", estimación provisional" : ""})`,
      );
      if (spent === undefined)
        references.push("Faltan cotizaciones históricas");
      budgets.push([
        month,
        item.categoryName,
        item.currency,
        item.effectiveLimit,
        spent ?? "",
        spent === undefined
          ? ""
          : cycleAmount([item.effectiveLimit, `-${spent}`]),
        references.join(", "),
      ]);
    }
    if (budgets.length > reportRowLimit) return null;
  }
  const result = {
    resumen: summary,
    movimientos: movements,
    saldos: balances.map(({ currency, amount, asOfDate, calculatedAmount }) => [
      "Saldo bancario",
      currency,
      amount,
      asOfDate,
      // Without later movements the projection is the confirmed balance, as in
      // the bank screens.
      calculatedAmount ?? amount,
    ]),
    tarjetas: cycles.flatMap(({ card, month, summaries, purchases }) =>
      summaries.flatMap(
        ({ currency, paid, remaining, credited, statement }) => {
          const amounts = purchases
            .filter((p) => p.period === month && p.currency === currency)
            .map((p) => p.amount);
          // Without a closing day a purchase belongs to no cycle yet; it keeps
          // its calendar month so the card section does not hide it.
          const unassigned = purchases
            .filter(
              (p) =>
                !p.period &&
                p.currency === currency &&
                p.effectiveOn.startsWith(month),
            )
            .map((p) => p.amount);
          if (
            !amounts.length &&
            !unassigned.length &&
            paid === "0.0000" &&
            credited === "0.0000" &&
            statement.officialAmount === null
          )
            return [];
          return [
            [
              card.name,
              month,
              currency,
              cycleAmount(amounts),
              paid,
              remaining ?? "",
              credited,
              cycleAmount(unassigned),
              statement.officialAmount ?? "",
            ],
          ];
        },
      ),
    ),
    presupuestos: budgets,
    fondos: await reportFunds(client, owner, period.to),
  };
  return Object.values(result).some((rows) => rows.length > reportRowLimit)
    ? null
    : result;
}
