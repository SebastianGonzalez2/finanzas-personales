import "server-only";
import type pg from "pg";
import type { Currency } from "../domain/money.ts";

export async function refundsReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.purchase_refunds') IS NOT NULL AS ready",
  );
  return row.ready;
}

export async function hasLinkedRefund(
  client: pg.PoolClient,
  ownerId: string,
  purchaseId: string,
) {
  if (!(await refundsReady(client))) return false;
  return !!(
    await client.query(
      `SELECT 1 FROM finance.purchase_refunds r
     JOIN finance.financial_events f ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
     WHERE r.owner_id = $1 AND r.purchase_id = $2 AND f.status = 'confirmed' LIMIT 1`,
      [ownerId, purchaseId],
    )
  ).rowCount;
}

// Recorded credit applications and refund splits depend on the preceding card
// position. Historical debt edits cannot change that position silently.
export async function hasLaterCreditChange(
  client: pg.PoolClient,
  ownerId: string,
  cardId: string,
  currency: Currency,
  effectiveOn: string,
  eventId?: string,
) {
  if (!(await refundsReady(client))) return false;
  return !!(
    await client.query(
      `SELECT 1 FROM finance.card_credit_changes x
     JOIN finance.financial_events f ON (f.owner_id, f.id) = (x.owner_id, x.event_id)
     LEFT JOIN finance.financial_events original ON original.owner_id = $1 AND original.id = $5
     WHERE x.owner_id = $1 AND x.card_id = $2 AND x.currency = $3 AND f.status = 'confirmed'
       AND (f.effective_on > $4::date OR (f.effective_on = $4 AND
         (f.created_at, f.id) > (original.created_at, original.id))) LIMIT 1`,
      [ownerId, cardId, currency, effectiveOn, eventId ?? null],
    )
  ).rowCount;
}
