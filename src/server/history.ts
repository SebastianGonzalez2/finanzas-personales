import "server-only";
import type pg from "pg";
import type { CreditHistoryLine } from "../domain/credit-operations.ts";
import { creditOperationsReady, loansReady } from "./movements.ts";
import { installmentsReady } from "./installments.ts";
import { sharedExpensesReady } from "./shared-expense-schema.ts";
import { mixedPurchasesReady } from "./mixed-purchases.ts";
import type { Currency } from "../domain/money.ts";
import {
  type HistoryEntry,
  type parseHistoryParams,
} from "../domain/history.ts";

type HistoryQuery = Exclude<
  ReturnType<typeof parseHistoryParams>,
  { error: string }
>;
const pageSize = 20;

const eventFields = `f.id, f.kind, f.status, f.effective_on, f.concept, m.note,
  e.currency, abs(e.amount_signed)::text AS amount,
  credit.currency AS "otherCurrency", credit.amount_signed::text AS "otherAmount",
  m.category_id AS "categoryId", c.name AS category, m.method, NULL::jsonb AS "cardAmounts"`;
const eventSource = `FROM finance.financial_events f
  LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
  JOIN finance.bank_effects e ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
  LEFT JOIN finance.bank_effects credit ON f.kind = 'bank_transfer'
    AND (credit.owner_id, credit.event_id) = (f.owner_id, f.id) AND credit.amount_signed > 0
  LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (m.owner_id, m.category_id)`;

const sharedFields = `f.id, f.kind, f.status, f.effective_on, s.concept, s.note,
  s.currency, s.total::text AS amount, NULL::text AS "otherCurrency", NULL::text AS "otherAmount",
  s.category_id AS "categoryId", c.name AS category, s.method,
  CASE WHEN s.method = 'credit' THEN jsonb_build_array(jsonb_build_object('currency', s.currency, 'amount', s.total::text)) END AS "cardAmounts"`;
const sharedSource = `FROM finance.current_shared_expenses s
  JOIN finance.financial_events f ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
  LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (s.owner_id, s.category_id)`;
const excludeShared = `AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
  WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))`;

const checkpointConcept = `CASE WHEN a.checkpoint_id IS NULL THEN 'Saldo inicial' ELSE 'Ajuste de saldo' END`;
const checkpointFields = `b.id, 'checkpoint'::text AS kind, 'confirmed'::text AS status,
  b.as_of_date AS effective_on, ${checkpointConcept} AS concept, a.note,
  b.currency, b.confirmed_amount::text AS amount, NULL::text AS "otherCurrency", NULL::text AS "otherAmount",
  NULL::uuid AS "categoryId", NULL::text AS category, NULL::text AS method, NULL::jsonb AS "cardAmounts"`;
const checkpointSource = `FROM finance.balance_checkpoints b
  LEFT JOIN finance.balance_adjustments a ON (a.owner_id, a.checkpoint_id) = (b.owner_id, b.id)`;

const loanFields = `f.id, f.kind, f.status, f.effective_on, f.concept, o.note,
  o.currency, o.amount::text AS amount, b.currency::text AS "otherCurrency", abs(b.amount_signed)::text AS "otherAmount",
  NULL::uuid AS "categoryId", NULL::text AS category, NULL::text AS method, NULL::jsonb AS "cardAmounts"`;
const loanSource = `FROM finance.financial_events f
  JOIN finance.loan_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
  LEFT JOIN finance.bank_effects b ON (b.owner_id, b.event_id, b.id) = (f.owner_id, f.id, f.id)
    AND b.currency <> o.currency`;

const cardFields = (
  withMixed: boolean,
) => `f.id, f.kind, f.status, f.effective_on, f.concept, o.note,
  (amounts.data->0->>'currency')::finance.currency AS currency, amounts.data->0->>'amount' AS amount,
  NULL::text AS "otherCurrency", NULL::text AS "otherAmount",
  o.category_id AS "categoryId", c.name AS category,
  CASE ${withMixed ? "WHEN d.id IS NOT NULL THEN 'mixed'" : ""}
    WHEN f.kind IN ('card_purchase', 'card_payment') THEN 'credit' END AS method,
  amounts.data AS "cardAmounts"`;
function cardSource(withPlans: boolean, withMixed: boolean) {
  return `FROM finance.financial_events f
  JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
  JOIN finance.cards card ON (card.owner_id, card.id) = (o.owner_id, o.card_id)
  LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (o.owner_id, o.category_id)
  ${withPlans ? "LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (f.owner_id, f.id)" : ""}
  ${withMixed ? "LEFT JOIN finance.mixed_purchase_debits d ON (d.owner_id, d.id) = (f.owner_id, f.id)" : ""}
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('currency', l.currency, 'amount', (${cardPurchaseAmount(withPlans, withMixed)})::text) ORDER BY l.currency) AS data
      FROM finance.credit_lines l WHERE (l.owner_id, l.event_id) = (o.owner_id, o.event_id)
  ) amounts`;
}

function cardPurchaseAmount(withPlans: boolean, withMixed: boolean) {
  const credit = withPlans
    ? "coalesce(p.installment_amount * p.installment_count, l.amount)"
    : "l.amount";
  return withMixed ? `${credit} + coalesce(d.amount, 0)` : credit;
}

export async function listHistory(
  client: pg.PoolClient,
  ownerId: string,
  query: HistoryQuery,
) {
  const { filters, minimum, maximum, cursor } = query;
  const credit = await creditOperationsReady(client);
  const withPlans = credit && (await installmentsReady(client));
  const withMixed = credit && (await mixedPurchasesReady(client));
  const loans = await loansReady(client);
  const shared = loans && (await sharedExpensesReady(client));
  const categoryMatches = (field: string) =>
    `CASE WHEN $7 = 'none' THEN ${field} IS NULL ELSE ${field}::text = lower($7) END`;
  const { rows } = await client.query<HistoryEntry>(
    `SELECT history.*, to_char(effective_on, 'YYYY-MM-DD') AS "effectiveOn"
       FROM (
       (SELECT ${eventFields} ${eventSource}
         WHERE f.owner_id = $1 AND (m.event_id IS NOT NULL OR f.kind = 'bank_transfer')
           ${shared ? excludeShared : ""}
           AND ($2::text IS NULL OR strpos(lower(f.concept), lower($2)) > 0 OR strpos(lower(m.note), lower($2)) > 0)
           AND ($3::date IS NULL OR f.effective_on >= $3) AND ($4::date IS NULL OR f.effective_on <= $4)
           AND ($5::text IS NULL OR f.kind = $5) AND ($6::text IS NULL OR f.status = $6)
           AND ($7::text IS NULL OR (m.event_id IS NOT NULL AND
             CASE WHEN $7 = 'none' THEN m.category_id IS NULL ELSE m.category_id::text = lower($7) END))
           AND ($8::text IS NULL OR m.method = $8)
           AND ((($9::text IS NULL OR e.currency = $9) AND ($10::numeric IS NULL OR abs(e.amount_signed) >= $10)
             AND ($11::numeric IS NULL OR abs(e.amount_signed) <= $11)) OR
             (credit.id IS NOT NULL AND ($9 IS NULL OR credit.currency = $9)
              AND ($10 IS NULL OR credit.amount_signed >= $10) AND ($11 IS NULL OR credit.amount_signed <= $11)))
           AND ($12::date IS NULL OR ((f.effective_on, f.id) <= ($12, $13::uuid)
             AND (f.effective_on, f.id, f.kind) < ($12, $13, $14::text)))
         ORDER BY f.effective_on DESC, f.id DESC LIMIT $15)
       UNION ALL
       (SELECT ${checkpointFields} ${checkpointSource}
         WHERE b.owner_id = $1 AND ($5 IS NULL OR $5 = 'checkpoint') AND ($6 IS NULL OR $6 = 'confirmed')
           AND $7 IS NULL AND $8 IS NULL
           AND ($2 IS NULL OR strpos(lower(${checkpointConcept}), lower($2)) > 0 OR strpos(lower(a.note), lower($2)) > 0)
           AND ($3 IS NULL OR b.as_of_date >= $3) AND ($4 IS NULL OR b.as_of_date <= $4)
           AND ($9 IS NULL OR b.currency = $9) AND ($10 IS NULL OR b.confirmed_amount >= $10)
           AND ($11 IS NULL OR b.confirmed_amount <= $11)
           AND ($12 IS NULL OR ((b.as_of_date, b.id) <= ($12, $13)
             AND (b.as_of_date, b.id, 'checkpoint'::text) < ($12, $13, $14)))
         ORDER BY b.as_of_date DESC, b.id DESC LIMIT $15)
       ${
         shared
           ? `UNION ALL
       (SELECT ${sharedFields} ${sharedSource}
         WHERE f.owner_id = $1
           AND ($2 IS NULL OR strpos(lower(s.concept), lower($2)) > 0 OR strpos(lower(s.note), lower($2)) > 0)
           AND ($3 IS NULL OR f.effective_on >= $3) AND ($4 IS NULL OR f.effective_on <= $4)
           AND ($5 IS NULL OR f.kind = $5) AND ($6 IS NULL OR f.status = $6)
           AND ($7 IS NULL OR ${categoryMatches("s.category_id")})
           AND ($8 IS NULL OR s.method = $8)
           AND ($9 IS NULL OR s.currency = $9) AND ($10 IS NULL OR s.total >= $10) AND ($11 IS NULL OR s.total <= $11)
           AND ($12 IS NULL OR ((f.effective_on, f.id) <= ($12, $13)
             AND (f.effective_on, f.id, f.kind) < ($12, $13, $14)))
         ORDER BY f.effective_on DESC, f.id DESC LIMIT $15)`
           : ""
       }
       ${
         loans
           ? `UNION ALL
       (SELECT ${loanFields} ${loanSource}
         WHERE f.owner_id = $1 AND ($5 IS NULL OR f.kind = $5) AND ($6 IS NULL OR f.status = $6)
           AND $7 IS NULL AND $8 IS NULL
           AND ($2 IS NULL OR strpos(lower(f.concept), lower($2)) > 0 OR strpos(lower(o.note), lower($2)) > 0)
           AND ($3 IS NULL OR f.effective_on >= $3) AND ($4 IS NULL OR f.effective_on <= $4)
           AND ((($9 IS NULL OR o.currency = $9) AND ($10 IS NULL OR o.amount >= $10)
             AND ($11 IS NULL OR o.amount <= $11)) OR
             (b.id IS NOT NULL AND ($9 IS NULL OR b.currency = $9)
              AND ($10 IS NULL OR abs(b.amount_signed) >= $10) AND ($11 IS NULL OR abs(b.amount_signed) <= $11)))
           AND ($12 IS NULL OR ((f.effective_on, f.id) <= ($12, $13)
             AND (f.effective_on, f.id, f.kind) < ($12, $13, $14)))
         ORDER BY f.effective_on DESC, f.id DESC LIMIT $15)`
           : ""
       }
       ${
         credit
           ? `UNION ALL
       (SELECT ${cardFields(withMixed)} ${cardSource(withPlans, withMixed)}
         WHERE f.owner_id = $1 ${shared ? excludeShared : ""}
           AND ($2 IS NULL OR strpos(lower(f.concept), lower($2)) > 0
             OR strpos(lower(o.note), lower($2)) > 0 OR strpos(lower(card.name), lower($2)) > 0)
           AND ($3 IS NULL OR f.effective_on >= $3) AND ($4 IS NULL OR f.effective_on <= $4)
           AND ($5 IS NULL OR f.kind = $5) AND ($6 IS NULL OR f.status = $6)
           AND ($7 IS NULL OR (f.kind = 'card_purchase' AND
             ${
               withMixed
                 ? `CASE WHEN EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
               WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
               THEN EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
                 WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id) AND ${categoryMatches("s.category_id")})
               ELSE ${categoryMatches("o.category_id")} END`
                 : categoryMatches("o.category_id")
             }))
           AND ($8 IS NULL OR ($8 = 'credit' AND f.kind IN ('card_purchase', 'card_payment'))
             ${withMixed ? "OR ($8 IN ('mixed', 'debit') AND d.id IS NOT NULL)" : ""})
           AND EXISTS (
             SELECT 1 FROM finance.credit_lines l
             CROSS JOIN LATERAL (VALUES (l.currency, ${cardPurchaseAmount(withPlans, withMixed)}), (l.bank_currency, l.bank_amount + l.fee)) v(currency, amount)
             WHERE (l.owner_id, l.event_id) = (f.owner_id, f.id) AND v.currency IS NOT NULL
               AND ($9 IS NULL OR v.currency = $9) AND ($10 IS NULL OR v.amount >= $10)
               AND ($11 IS NULL OR v.amount <= $11))
           AND ($12 IS NULL OR ((f.effective_on, f.id) <= ($12, $13)
             AND (f.effective_on, f.id, f.kind) < ($12, $13, $14)))
         ORDER BY f.effective_on DESC, f.id DESC LIMIT $15)`
           : ""
       }
       ) history ORDER BY effective_on DESC, id DESC, kind DESC LIMIT $15`,
    [
      ownerId,
      filters.q || null,
      filters.from || null,
      filters.to || null,
      filters.kind || null,
      filters.status || null,
      filters.category || null,
      filters.method || null,
      filters.currency || null,
      minimum,
      maximum,
      cursor?.date ?? null,
      cursor?.id ?? null,
      cursor?.kind ?? null,
      pageSize + 1,
    ],
  );
  return {
    entries: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}

export async function findHistoryEntry(
  client: pg.PoolClient,
  ownerId: string,
  id: string,
  checkpoint: boolean,
) {
  if (!checkpoint && (await sharedExpensesReady(client))) {
    const {
      rows: [shared],
    } = await client.query<HistoryEntry>(
      `SELECT ${sharedFields}, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
       ${sharedSource} WHERE f.owner_id = $1 AND f.id = $2`,
      [ownerId, id],
    );
    if (shared) return shared;
  }
  const {
    rows: [entry],
  } = await client.query<HistoryEntry>(
    checkpoint
      ? `SELECT ${checkpointFields}, to_char(b.as_of_date, 'YYYY-MM-DD') AS "effectiveOn"
           ${checkpointSource} WHERE b.owner_id = $1 AND b.id = $2`
      : `SELECT ${eventFields}, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
           ${eventSource} WHERE f.owner_id = $1 AND f.id = $2
             AND (m.event_id IS NOT NULL OR f.kind = 'bank_transfer')`,
    [ownerId, id],
  );
  if (entry || checkpoint) return entry;
  if (await loansReady(client)) {
    const {
      rows: [loan],
    } = await client.query<HistoryEntry>(
      `SELECT ${loanFields}, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
        ${loanSource} WHERE f.owner_id = $1 AND f.id = $2`,
      [ownerId, id],
    );
    if (loan) return loan;
  }
  if (!(await creditOperationsReady(client))) return undefined;
  const withMixed = await mixedPurchasesReady(client);
  const result = await client.query<HistoryEntry>(
    `SELECT ${cardFields(withMixed)}, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
      ${cardSource(await installmentsReady(client), withMixed)} WHERE f.owner_id = $1 AND f.id = $2`,
    [ownerId, id],
  );
  return result.rows[0];
}

export async function creditHistoryDetail(
  client: pg.PoolClient,
  ownerId: string,
  id: string,
) {
  const { rows } = await client.query<
    CreditHistoryLine & { card: string; effectiveRate: string | null }
  >(
    `SELECT card.name AS card, l.currency, l.amount::text,
            l.debt_delta::text AS "debtDelta", l.debt_after::text AS "debtAfter",
            l.bank_currency AS "bankCurrency", l.bank_amount::text AS "bankAmount", l.fee::text,
            left(to_jsonb(l)->>'statement_period', 7) AS "statementPeriod",
            CASE WHEN l.bank_currency <> l.currency
              THEN trim_scale(round(l.bank_amount / nullif(l.amount, 0), 8))::text END AS "effectiveRate",
            coalesce(allocations.items, '[]'::jsonb) AS allocations
       FROM finance.credit_lines l
       JOIN finance.cards card ON (card.owner_id, card.id) = (l.owner_id, l.card_id)
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('purchaseId', a.purchase_id,
           'amount', a.amount::text, 'concept', f.concept) ORDER BY a.purchase_id) AS items
           FROM finance.credit_allocations a
           JOIN finance.financial_events f ON (f.owner_id, f.id) = (a.owner_id, a.purchase_id)
          WHERE (a.owner_id, a.payment_id, a.currency) = (l.owner_id, l.event_id, l.currency)
       ) allocations ON true
      WHERE l.owner_id = $1 AND l.event_id = $2 ORDER BY l.currency`,
    [ownerId, id],
  );
  return rows;
}

export async function listHistoryCategories(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<{
    id: string;
    name: string;
    kind: "income" | "expense";
  }>(
    `SELECT id, name, kind FROM finance.categories WHERE owner_id = $1 ORDER BY kind, name, id`,
    [ownerId],
  );
  return rows;
}

export async function listHistoryCurrencies(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<{ currency: Currency }>(
    `SELECT DISTINCT currency FROM finance.balance_checkpoints WHERE owner_id = $1 ORDER BY currency`,
    [ownerId],
  );
  return rows.map(({ currency }) => currency);
}

export async function historyRevisions(
  client: pg.PoolClient,
  ownerId: string,
  id: string,
) {
  const { rows } = await client.query<{
    type: "corrected" | "voided";
    related: string | null;
    incoming: boolean;
    recordedOn: string;
  }>(
    `SELECT change_type AS type, (replacement_event_id = $2) IS TRUE AS incoming,
            CASE WHEN replacement_event_id = $2 THEN event_id ELSE replacement_event_id END AS related,
            to_char(created_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD') AS "recordedOn"
       FROM finance.audit_changes
      WHERE owner_id = $1 AND change_type IN ('corrected', 'voided')
        AND (event_id = $2 OR replacement_event_id = $2)
      ORDER BY created_at, id`,
    [ownerId, id],
  );
  return rows;
}
