import "server-only";
import type pg from "pg";
import type { PurchaseCategory } from "../domain/credit-operations.ts";

export async function mixedPurchasesReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.mixed_purchases') IS NOT NULL AS ready",
  );
  return row.ready;
}

export async function mixedPurchaseDetail(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const {
    rows: [row],
  } = await client.query<{
    debitAmount: string;
    debitCard: string | null;
    debitCardId: string | null;
    creditCardId: string;
    covered: boolean;
    categories: (PurchaseCategory & { category: string | null })[];
  }>(
    `SELECT d.amount::text AS "debitAmount", card.name AS "debitCard",
            m.debit_card_id AS "debitCardId", l.card_id AS "creditCardId",
            (l.amount > 0 AND l.debt_delta = 0) AS covered,
            coalesce(splits.items, '[]'::jsonb) AS categories
       FROM finance.mixed_purchases m
       JOIN finance.mixed_purchase_debits d ON (d.owner_id, d.id) = (m.owner_id, m.event_id)
       JOIN finance.credit_lines l ON (l.owner_id, l.event_id, l.currency) = (m.owner_id, m.event_id, m.currency)
       LEFT JOIN finance.cards card ON (card.owner_id, card.id) = (m.owner_id, m.debit_card_id)
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('method', s.method, 'categoryId', s.category_id,
           'category', c.name, 'amount', s.amount::text) ORDER BY s.method DESC, c.name NULLS LAST, s.category_id) AS items
           FROM finance.mixed_purchase_categories s
           LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (s.owner_id, s.category_id)
          WHERE (s.owner_id, s.event_id) = (m.owner_id, m.event_id)
       ) splits ON true
      WHERE m.owner_id = $1 AND m.event_id = $2`,
    [ownerId, eventId],
  );
  return row;
}
