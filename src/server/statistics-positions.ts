import "server-only";
import type pg from "pg";
import type { Currency } from "../domain/money.ts";
import type {
  StatisticsPosition,
  StatisticsRange,
} from "../domain/statistics.ts";

export async function listStatisticsPositions(
  client: pg.PoolClient,
  ownerId: string,
  history: StatisticsRange,
  previous: StatisticsRange | null,
  current: StatisticsRange,
  currency?: Currency,
) {
  // Snapshots use end-of-day effective dates and the same checkpoint ordering
  // as the bank ledger. A missing opening/checkpoint leaves bank value unknown.
  const { rows } = await client.query<StatisticsPosition>(
    `WITH dates AS (
       SELECT least($3::date, (month + interval '1 month - 1 day')::date) AS day
         FROM generate_series(date_trunc('month', $2::date), date_trunc('month', $3::date), interval '1 month') month
       UNION SELECT $5::date
       UNION SELECT $6::date WHERE $6::date IS NOT NULL
       UNION SELECT as_of_date FROM finance.balance_checkpoints
         WHERE owner_id = $1 AND as_of_date BETWEEN $2 AND $3
           AND ($4::finance.currency IS NULL OR currency = $4)
     ), currencies AS (
       SELECT unnest(ARRAY['UYU', 'USD', 'EUR']::finance.currency[]) AS currency
     ), credit_ledger AS (
       SELECT l.card_id, l.currency, l.debt_delta, l.debt_after,
              f.effective_on, f.created_at, f.id, f.kind
         FROM finance.credit_lines l
         JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
        WHERE l.owner_id = $1 AND f.status = 'confirmed'
          AND ($4::finance.currency IS NULL OR l.currency = $4)
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS date, c.currency, bank.amount::text AS bank,
            CASE WHEN b.as_of_date IS NULL THEN 'unknown'
                 WHEN b.as_of_date = d.day AND effects.count = 0 THEN 'confirmed'
                 ELSE 'calculated' END AS "bankStatus",
            (b.as_of_date = d.day AND a.checkpoint_id IS NOT NULL) IS TRUE AS adjustment,
            coalesce(reserves.amount, 0)::text AS reserved,
            (bank.amount - coalesce(reserves.amount, 0))::text AS available,
            coalesce(cards.amount, 0)::text AS "cardDebt",
            coalesce(loans.debt, 0)::text AS "loanDebt",
            coalesce(loans.receivables, 0)::text AS receivables,
            coalesce(issuer.amount, 0)::text AS "cardCredit",
            (bank.amount + coalesce(loans.receivables, 0) + coalesce(issuer.amount, 0)
                         - coalesce(cards.amount, 0) - coalesce(loans.debt, 0))::text AS "netWorth"
       FROM dates d CROSS JOIN currencies c
       LEFT JOIN LATERAL (
         SELECT id, confirmed_amount, as_of_date, created_at
           FROM finance.balance_checkpoints
          WHERE owner_id = $1 AND currency = c.currency AND as_of_date <= d.day
          ORDER BY as_of_date DESC, created_at DESC, id DESC LIMIT 1
       ) b ON true
       LEFT JOIN finance.balance_adjustments a ON (a.owner_id, a.checkpoint_id) = ($1, b.id)
       CROSS JOIN LATERAL (
         SELECT sum(e.amount_signed) AS amount, count(*) AS count
           FROM finance.bank_effects e
           JOIN finance.bank_event_positions f ON (f.owner_id, f.id) = (e.owner_id, e.event_id)
          WHERE e.owner_id = $1 AND e.currency = c.currency AND f.status = 'confirmed'
            AND e.effective_on <= d.day
            AND (e.effective_on, f.bank_recorded_at) > (b.as_of_date, b.created_at)
       ) effects
       CROSS JOIN LATERAL (SELECT b.confirmed_amount + coalesce(effects.amount, 0) AS amount) bank
       CROSS JOIN LATERAL (
         SELECT sum(e.delta) AS amount FROM finance.reserve_effects e
           JOIN finance.fund_changes f ON (f.owner_id, f.idempotency_key) = (e.owner_id, e.command_id)
          WHERE e.owner_id = $1 AND e.currency = c.currency
            AND (f.created_at AT TIME ZONE 'America/Montevideo')::date <= d.day
       ) reserves
       CROSS JOIN LATERAL (
         SELECT sum(coalesce(anchor.debt_after, 0) + coalesce(delta.amount, 0)) AS amount
           FROM (SELECT DISTINCT card_id FROM credit_ledger
                  WHERE currency = c.currency AND effective_on <= d.day) card
           LEFT JOIN LATERAL (
             SELECT debt_after, effective_on, created_at, id FROM credit_ledger
              WHERE card_id = card.card_id AND currency = c.currency AND effective_on <= d.day
                AND kind IN ('card_opening', 'card_adjustment')
              ORDER BY effective_on DESC, created_at DESC, id DESC LIMIT 1
           ) anchor ON true
           CROSS JOIN LATERAL (
             SELECT sum(debt_delta) AS amount FROM credit_ledger
              WHERE card_id = card.card_id AND currency = c.currency AND effective_on <= d.day
                AND (anchor.id IS NULL OR (effective_on, created_at, id) >
                      (anchor.effective_on, anchor.created_at, anchor.id))
           ) delta
       ) cards
       CROSS JOIN LATERAL (
         SELECT sum(x.delta) AS amount FROM finance.card_credit_changes x
           JOIN finance.financial_events f ON (f.owner_id, f.id) = (x.owner_id, x.event_id)
          WHERE x.owner_id = $1 AND x.currency = c.currency
            AND f.status = 'confirmed' AND f.effective_on <= d.day
       ) issuer
       CROSS JOIN LATERAL (
         SELECT sum(op.outstanding) FILTER (WHERE l.direction = 'payable') AS debt,
                sum(op.outstanding) FILTER (WHERE l.direction = 'receivable') AS receivables
           FROM finance.loans l CROSS JOIN LATERAL (
             SELECT o.outstanding FROM finance.loan_operations o
               JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
              WHERE (o.owner_id, o.loan_id) = (l.owner_id, l.id)
                AND f.status = 'confirmed' AND f.effective_on <= d.day
              ORDER BY o.version DESC LIMIT 1
           ) op
          WHERE l.owner_id = $1 AND l.currency = c.currency
       ) loans
      WHERE ($4::finance.currency IS NULL OR c.currency = $4)
        AND (b.id IS NOT NULL OR reserves.amount IS NOT NULL OR cards.amount IS NOT NULL
             OR issuer.amount IS NOT NULL OR loans.debt IS NOT NULL OR loans.receivables IS NOT NULL)
      ORDER BY d.day DESC, c.currency`,
    [
      ownerId,
      history.from,
      history.to,
      currency ?? null,
      current.to,
      previous?.to ?? null,
    ],
  );
  return rows;
}
