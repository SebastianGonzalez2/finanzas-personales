import "server-only";
import type pg from "pg";
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
  m.category_id AS "categoryId", c.name AS category, m.method`;
const eventSource = `FROM finance.financial_events f
  LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
  JOIN finance.bank_effects e ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
  LEFT JOIN finance.bank_effects credit ON f.kind = 'bank_transfer'
    AND (credit.owner_id, credit.event_id) = (f.owner_id, f.id) AND credit.amount_signed > 0
  LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (m.owner_id, m.category_id)`;

const checkpointConcept = `CASE WHEN a.checkpoint_id IS NULL THEN 'Saldo inicial' ELSE 'Ajuste de saldo' END`;
const checkpointFields = `b.id, 'checkpoint'::text AS kind, 'confirmed'::text AS status,
  b.as_of_date AS effective_on, ${checkpointConcept} AS concept, a.note,
  b.currency, b.confirmed_amount::text AS amount, NULL::text AS "otherCurrency", NULL::text AS "otherAmount",
  NULL::uuid AS "categoryId", NULL::text AS category, NULL::text AS method`;
const checkpointSource = `FROM finance.balance_checkpoints b
  LEFT JOIN finance.balance_adjustments a ON (a.owner_id, a.checkpoint_id) = (b.owner_id, b.id)`;

export async function listHistory(
  client: pg.PoolClient,
  ownerId: string,
  query: HistoryQuery,
) {
  const { filters, minimum, maximum, cursor } = query;
  const { rows } = await client.query<HistoryEntry>(
    `SELECT history.*, to_char(effective_on, 'YYYY-MM-DD') AS "effectiveOn"
       FROM (
       (SELECT ${eventFields} ${eventSource}
         WHERE f.owner_id = $1 AND (m.event_id IS NOT NULL OR f.kind = 'bank_transfer')
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
  return entry;
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
