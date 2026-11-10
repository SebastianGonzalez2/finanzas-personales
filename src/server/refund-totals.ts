import "server-only";
import type pg from "pg";
import type { Currency } from "../domain/money.ts";
import { refundsReady } from "./refund-schema.ts";

export async function listRefundTotals(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
) {
  if (!(await refundsReady(client))) return [];
  const { rows } = await client.query<{ currency: Currency; amount: string }>(
    `SELECT r.currency, sum(r.amount)::text AS amount
       FROM finance.purchase_refunds r
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
      WHERE r.owner_id = $1 AND r.action = 'credit' AND f.status = 'confirmed'
        AND f.effective_on >= $2::date AND f.effective_on < $2::date + interval '1 month'
      GROUP BY r.currency ORDER BY r.currency`,
    [ownerId, monthStart],
  );
  return rows;
}
