import "server-only";
import { classificationReady } from "./classification.ts";
import { nameCatalogReady } from "./catalog.ts";
import type pg from "pg";
import {
  creditOperationsReady,
  loansReady,
  mixedPurchasesReady,
  sharedExpensesReady,
} from "./schema-ready.ts";
import { installmentsReady } from "./installments.ts";
import { normalizeFilterName } from "../domain/history-filters.ts";
import {
  type HistoryEntry,
  type parseHistoryParams,
} from "../domain/history.ts";

type HistoryQuery = Exclude<
  ReturnType<typeof parseHistoryParams>,
  { error: string }
>;

const eventFields = `f.id, f.kind, f.status, f.effective_on, f.concept, m.note,
  e.currency, abs(e.amount_signed)::text AS amount,
  NULL::text AS "otherCurrency", NULL::text AS "otherAmount",
  m.category_id AS "categoryId", c.name AS category, m.method, NULL::jsonb AS "cardAmounts"`;
const eventSource = `FROM finance.financial_events f
  LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
  JOIN finance.bank_effects e ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
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
  pageSize = 20,
) {
  const { filters, minimum, maximum, cursor } = query;
  const credit = await creditOperationsReady(client);
  const withPlans = credit && (await installmentsReady(client));
  const withMixed = credit && (await mixedPurchasesReady(client));
  const shared =
    (await loansReady(client)) && (await sharedExpensesReady(client));
  const merchantMatches =
    filters.merchant && (await nameCatalogReady(client))
      ? `AND EXISTS (
        SELECT 1 FROM finance.canonical_event_merchants ref
        JOIN finance.merchants selected ON selected.owner_id = ref.owner_id
          AND coalesce(selected.merged_into, selected.id) = ref.merchant_id
        WHERE ref.owner_id = f.owner_id AND ref.event_id = f.id AND selected.id = $17::uuid
      )`
      : "AND $17::uuid IS NULL";
  const categoryMatches = (field: string) =>
    `CASE WHEN $7 = 'none' THEN ${field} IS NULL ELSE ${field} = nullif($7, 'none')::uuid END`;
  const normalizedSearch = filters.q && normalizeFilterName(filters.q);
  const nameCatalog = normalizedSearch && (await nameCatalogReady(client));
  const merchantSearch = nameCatalog
    ? `OR EXISTS (SELECT 1 FROM finance.canonical_event_merchants ref
        JOIN finance.merchants merchant ON (merchant.owner_id, merchant.id) = (ref.owner_id, ref.merchant_id)
        WHERE (ref.owner_id, ref.event_id) = (f.owner_id, f.id)
          AND strpos(merchant.normalized_name, $18) > 0)`
    : "";
  const personSearch = (loan: string) =>
    nameCatalog
      ? `OR EXISTS (SELECT 1 FROM finance.loan_people ref
          JOIN finance.people person ON (person.owner_id, person.id) = (ref.owner_id, ref.person_id)
          WHERE ref.owner_id = f.owner_id AND ${loan}
            AND strpos(person.normalized_name, $18) > 0)`
      : "";
  const classifications = await classificationReady(client);
  const tagFilter = classifications
    ? `($16::uuid[] IS NULL OR EXISTS (SELECT 1 FROM finance.current_event_tags t
       WHERE (t.owner_id,t.event_id)=(f.owner_id,f.id) AND t.tag_id=ANY($16)))`
    : "$16::uuid[] IS NULL";
  const categoryFilter = (legacy: string) =>
    classifications
      ? `CASE WHEN EXISTS (SELECT 1 FROM finance.current_movement_allocations a
         WHERE (a.owner_id,a.event_id)=(f.owner_id,f.id))
       THEN EXISTS (SELECT 1 FROM finance.current_movement_allocations a
         WHERE (a.owner_id,a.event_id)=(f.owner_id,f.id) AND ${categoryMatches("a.category_id")})
       ELSE ${legacy} END`
      : legacy;
  const { rows } = await client.query<HistoryEntry>(
    `SELECT history.*, to_char(effective_on, 'YYYY-MM-DD') AS "effectiveOn",
       ${
         classifications
           ? `CASE WHEN history.kind IN ('income', 'expense', 'card_purchase')
         AND history.status = 'confirmed' THEN coalesce((
           SELECT max(c.version) FROM finance.classification_changes c
            WHERE (c.owner_id, c.event_id) = ($1, history.id)
         ), 0) END`
           : "NULL::integer"
       } AS "classificationVersion"
       FROM (
       (SELECT ${eventFields} ${eventSource}
         WHERE f.owner_id = $1 AND f.kind = 'expense'
           ${shared ? excludeShared : ""}
           ${merchantMatches}
           AND ($2::text IS NULL OR strpos(lower(f.concept), lower($2)) > 0
             OR strpos(lower(m.note), lower($2)) > 0 ${merchantSearch})
           AND ($3::date IS NULL OR f.effective_on >= $3) AND ($4::date IS NULL OR f.effective_on <= $4)
           AND ($5::text IS NULL OR f.kind = $5) AND ($6::text IS NULL OR f.status = $6)
           AND ${tagFilter}
           AND ($7::text IS NULL OR (m.event_id IS NOT NULL AND ${categoryFilter(categoryMatches("m.category_id"))}))
           AND ($8::text IS NULL OR m.method = $8)
           AND ($9::text IS NULL OR e.currency = $9) AND ($10::numeric IS NULL OR abs(e.amount_signed) >= $10)
           AND ($11::numeric IS NULL OR abs(e.amount_signed) <= $11)
           AND ($12::date IS NULL OR ((f.effective_on, f.id) <= ($12, $13::uuid)
             AND (f.effective_on, f.id, f.kind) < ($12, $13, $14::text)))
         ORDER BY f.effective_on DESC, f.id DESC LIMIT $15)
       ${
         shared
           ? `UNION ALL
       (SELECT ${sharedFields} ${sharedSource}
         WHERE f.owner_id = $1
           ${merchantMatches}
           AND ($2 IS NULL OR strpos(lower(s.concept), lower($2)) > 0
             OR strpos(lower(s.note), lower($2)) > 0 ${merchantSearch}
             ${personSearch(`EXISTS (SELECT 1 FROM finance.loans l
               WHERE (l.owner_id, l.id) = (ref.owner_id, ref.loan_id) AND l.source_expense_id = f.id)`)})
           AND ($3 IS NULL OR f.effective_on >= $3) AND ($4 IS NULL OR f.effective_on <= $4)
           AND ($5 IS NULL OR f.kind = $5) AND ($6 IS NULL OR f.status = $6)
           AND ${tagFilter}
           AND ($7 IS NULL OR ${categoryFilter(categoryMatches("s.category_id"))})
           AND ($8 IS NULL OR s.method = $8)
           AND ($9 IS NULL OR s.currency = $9) AND ($10 IS NULL OR s.total >= $10) AND ($11 IS NULL OR s.total <= $11)
           AND ($12 IS NULL OR ((f.effective_on, f.id) <= ($12, $13)
             AND (f.effective_on, f.id, f.kind) < ($12, $13, $14)))
         ORDER BY f.effective_on DESC, f.id DESC LIMIT $15)`
           : ""
       }
       ${
         credit
           ? `UNION ALL
       (SELECT ${cardFields(withMixed)} ${cardSource(withPlans, withMixed)}
         WHERE f.owner_id = $1 AND f.kind = 'card_purchase'
           ${shared ? excludeShared : ""}
           ${merchantMatches}
           AND ($2 IS NULL OR strpos(lower(f.concept), lower($2)) > 0
             OR strpos(lower(o.note), lower($2)) > 0 OR strpos(lower(card.name), lower($2)) > 0 ${merchantSearch})
           AND ($3 IS NULL OR f.effective_on >= $3) AND ($4 IS NULL OR f.effective_on <= $4)
           AND ($5 IS NULL OR f.kind = $5) AND ($6 IS NULL OR f.status = $6)
           AND ${tagFilter}
           AND ($7 IS NULL OR (f.kind = 'card_purchase' AND
             ${categoryFilter(
               withMixed
                 ? `CASE WHEN EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
               WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
               THEN EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
                 WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id) AND ${categoryMatches("s.category_id")})
               ELSE ${categoryMatches("o.category_id")} END`
                 : categoryMatches("o.category_id"),
             )}))
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
      filters.tags ? filters.tags.split(",") : null,
      filters.merchant || null,
      ...(nameCatalog ? [normalizedSearch] : []),
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
) {
  if (await sharedExpensesReady(client)) {
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
    `SELECT ${eventFields}, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
       ${eventSource} WHERE f.owner_id = $1 AND f.id = $2
         AND f.kind = 'expense' AND m.event_id IS NOT NULL`,
    [ownerId, id],
  );
  if (entry || !(await creditOperationsReady(client))) return entry;
  const withMixed = await mixedPurchasesReady(client);
  const result = await client.query<HistoryEntry>(
    `SELECT ${cardFields(withMixed)}, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
      ${cardSource(await installmentsReady(client), withMixed)} WHERE f.owner_id = $1 AND f.id = $2
      AND f.kind = 'card_purchase'`,
    [ownerId, id],
  );
  return result.rows[0];
}

export async function listHistoryCategories(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<{
    id: string;
    name: string;
    kind: "income" | "expense";
    archived: boolean;
  }>(
    `SELECT c.id, c.name, c.kind, (c.archived_at IS NOT NULL OR p.archived_at IS NOT NULL) AS archived
      FROM finance.categories c
      LEFT JOIN finance.categories p ON (p.owner_id, p.id) = (c.owner_id, c.parent_id)
      WHERE c.owner_id = $1 ORDER BY c.kind, c.name, c.id`,
    [ownerId],
  );
  return rows;
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
