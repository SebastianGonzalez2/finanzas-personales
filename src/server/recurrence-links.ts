import "server-only";
import type pg from "pg";
import { decimalToUnits, type Currency } from "../domain/money.ts";
import { rememberSchema, schemaKnown } from "./schema-ready.ts";

export async function recurrenceTrackingReady(client: pg.PoolClient) {
  if (schemaKnown.has("recurrenceTrackingReady")) return true;
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.recurring_active_allocations') IS NOT NULL AS ready",
  );
  return rememberSchema("recurrenceTrackingReady", rows[0].ready);
}

export async function recurrenceEventPeriods(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (!(await recurrenceTrackingReady(client))) return [];
  const { rows } = await client.query<{
    seriesId: string;
    key: string;
    index: number;
  }>(
    `SELECT a.series_id AS "seriesId", p.period_key AS key, p.period_index AS index
       FROM finance.recurring_event_lineage l
       JOIN finance.recurring_allocations a ON (a.owner_id, a.settlement_id) = (l.owner_id, l.settlement_id)
       JOIN finance.recurring_periods p ON (p.owner_id, p.series_id, p.period_index) = (a.owner_id, a.series_id, a.period_index)
      WHERE l.owner_id = $1 AND l.event_id = $2
      ORDER BY a.period_index`,
    [ownerId, eventId],
  );
  return rows;
}

// Single-period assignments follow corrected amounts. A multi-period event
// retains its explicit split; changing the sum requires undoing and recording
// the whole payment with a new split.
export async function validRecurringRevision(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  amount: string,
  currency: Currency,
) {
  if (!(await recurrenceTrackingReady(client))) return true;
  const { rows } = await client.query<{
    allocated: string | null;
    currency: Currency;
    confirmed: string | null;
    other: string;
  }>(
    `SELECT a.amount::text AS allocated, s.currency, p.confirmed_total::text AS confirmed,
       coalesce((SELECT sum(x.amount) FROM finance.recurring_active_allocations x
         WHERE (x.owner_id, x.series_id, x.period_index) = (a.owner_id, a.series_id, a.period_index)
           AND x.event_id <> $2), 0)::text AS other
       FROM finance.recurring_event_lineage l
       JOIN finance.recurring_allocations a ON (a.owner_id, a.settlement_id) = (l.owner_id, l.settlement_id)
       JOIN finance.recurring_series s ON (s.owner_id, s.id) = (a.owner_id, a.series_id)
       JOIN finance.recurring_periods p ON (p.owner_id, p.series_id, p.period_index) =
         (a.owner_id, a.series_id, a.period_index)
      WHERE l.owner_id = $1 AND l.event_id = $2`,
    [ownerId, eventId],
  );
  if (!rows.length) return true;
  if (rows.some((row) => row.currency !== currency)) return false;
  if (rows[0].allocated !== null)
    return (
      rows.reduce(
        (sum, row) => sum + decimalToUnits(row.allocated ?? "0"),
        BigInt(0),
      ) === decimalToUnits(amount)
    );
  const [row] = rows;
  const next = decimalToUnits(row.other) + decimalToUnits(amount);
  return next <= decimalToUnits(row.confirmed ?? "9999999999999999.9999");
}
