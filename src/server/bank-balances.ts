import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  bankCurrencies,
  type BalanceAdjustment,
  type BankBalance,
  type BankCheckpoint,
} from "../domain/bank-balances.ts";
import type { Currency } from "../domain/money.ts";

// Stable opening IDs scoped by the existing (owner_id, id) primary key.
// Later manual checkpoints use their own IDs. No DDL or new grants required.
const openingIds = {
  UYU: "e95ef63b-4218-4be6-b1a3-c4b5ac50d12a",
  USD: "11a38c87-30ec-4a72-80c7-8ca6c9f803c5",
  EUR: "23fd4829-321d-4f84-8f5b-d290c9bd51d2",
} as const;

export async function lockBankWrites(client: pg.PoolClient, ownerId: string) {
  // All bank mutations share the owner lock, including cross-currency retries.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:bank:' || $1::text, 0))",
    [ownerId],
  );
}

export async function bankReconciliationReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.bank_event_positions') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

// SQL fragments contain only code constants. All callers use the same order:
// effective date first; on that date, when the original event was registered.
export const bankEventSource = (ready: boolean) =>
  ready ? "finance.bank_event_positions" : "finance.financial_events";

export const bankEventPosition = (ready: boolean) =>
  `(e.effective_on, ${ready ? "f.bank_recorded_at" : "f.created_at"})`;

function sumBankEffects(ready: boolean, lower: string, upper?: string) {
  return `SELECT sum(e.amount_signed) AS delta
            FROM finance.bank_effects e
            JOIN ${bankEventSource(ready)} f
              ON (f.owner_id, f.id) = (e.owner_id, e.event_id)
           WHERE e.owner_id = $1 AND e.currency = b.currency
             AND f.status = 'confirmed'
             AND ${bankEventPosition(ready)} > ${lower}
             ${upper ? `AND ${bankEventPosition(ready)} <= ${upper}` : ""}`;
}

export async function listBankBalances(
  client: pg.PoolClient,
  ownerId: string,
  currencies: readonly Currency[] = bankCurrencies,
  reconciliationReady?: boolean,
): Promise<BankBalance[]> {
  const ready = reconciliationReady ?? (await bankReconciliationReady(client));
  const { rows } = await client.query<BankBalance>(
    `SELECT b.currency, b.confirmed_amount::text AS amount,
            to_char(b.as_of_date, 'YYYY-MM-DD') AS "asOfDate",
            (b.confirmed_amount + effects.delta)::text AS "calculatedAmount"
       FROM unnest($2::finance.currency[]) WITH ORDINALITY AS c(currency, position)
       CROSS JOIN LATERAL (
         SELECT currency, confirmed_amount, as_of_date, created_at
           FROM finance.balance_checkpoints
          WHERE owner_id = $1 AND currency = c.currency
          ORDER BY as_of_date DESC, created_at DESC, id DESC
          LIMIT 1
       ) b
       CROSS JOIN LATERAL (
         ${sumBankEffects(ready, "(b.as_of_date, b.created_at)")}
       ) effects
      ORDER BY c.position`,
    [ownerId, currencies],
  );
  return rows.map(({ calculatedAmount, ...balance }) =>
    calculatedAmount == null ? balance : { ...balance, calculatedAmount },
  );
}

export async function listBankCheckpoints(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<BankCheckpoint>(
    `WITH checkpoints AS (
       SELECT currency, id, as_of_date, created_at, confirmed_amount,
              lag(as_of_date) OVER timeline AS previous_date,
              lag(created_at) OVER timeline AS previous_created,
              lag(confirmed_amount) OVER timeline AS previous_amount
         FROM finance.balance_checkpoints
        WHERE owner_id = $1
        WINDOW timeline AS (PARTITION BY currency ORDER BY as_of_date, created_at, id)
     )
     SELECT b.id, b.currency, to_char(b.as_of_date, 'YYYY-MM-DD') AS "asOfDate",
            b.confirmed_amount::text AS amount, a.note,
            a.original_projection::text AS "originalProjection",
            (b.confirmed_amount - a.original_projection)::text AS "originalDifference",
            p.amount::text AS projection, (b.confirmed_amount - p.amount)::text AS difference,
            (a.original_projection IS NOT NULL AND a.original_projection <> p.amount) AS "projectionChanged"
       FROM checkpoints b
       LEFT JOIN finance.balance_adjustments a ON a.owner_id = $1 AND a.checkpoint_id = b.id
       CROSS JOIN LATERAL (
         ${sumBankEffects(true, "(b.previous_date, b.previous_created)", "(b.as_of_date, b.created_at)")}
       ) effects
       CROSS JOIN LATERAL (SELECT b.previous_amount + coalesce(effects.delta, 0) AS amount) p
      ORDER BY b.as_of_date DESC, b.created_at DESC, b.id DESC`,
    [ownerId],
  );
  return rows;
}

type AdjustmentResult =
  | { status: "created" | "replayed"; id: string }
  | { status: "conflict" | "unconfigured" | "before-opening" | "unavailable" };

export async function saveBalanceAdjustment(
  client: pg.PoolClient,
  ownerId: string,
  command: BalanceAdjustment,
): Promise<AdjustmentResult> {
  await lockBankWrites(client, ownerId);
  if (!(await bankReconciliationReady(client)))
    return { status: "unavailable" };
  const { idempotencyKey, currency, amount, asOfDate, note } = command;
  const fields = [ownerId, idempotencyKey, currency, amount, asOfDate, note];
  const {
    rows: [prior],
  } = await client.query<{ id: string; matches: boolean }>(
    `SELECT b.id, (b.currency = $3 AND b.confirmed_amount = $4 AND b.as_of_date = $5
                   AND a.note IS NOT DISTINCT FROM $6) AS matches
       FROM finance.balance_adjustments a JOIN finance.balance_checkpoints b
         ON (b.owner_id, b.id) = (a.owner_id, a.checkpoint_id)
      WHERE a.owner_id = $1 AND a.idempotency_key = $2`,
    fields,
  );
  if (prior)
    return prior.matches
      ? { status: "replayed", id: prior.id }
      : { status: "conflict" };

  const id = randomUUID();
  const inserted = await client.query(
    `WITH previous AS (
       SELECT currency, confirmed_amount, as_of_date, created_at
         FROM finance.balance_checkpoints
        WHERE owner_id = $1 AND currency = $3 AND as_of_date <= $5::date
        ORDER BY as_of_date DESC, created_at DESC, id DESC LIMIT 1
     ), confirmation AS MATERIALIZED (
       SELECT b.*, greatest(clock_timestamp(), b.created_at + interval '1 microsecond') AS confirmed_at
         FROM previous b
     ), saved AS (
       INSERT INTO finance.balance_checkpoints (owner_id, id, currency, confirmed_amount, as_of_date, created_at)
       SELECT $1, $7, b.currency, $4, $5, b.confirmed_at FROM confirmation b
       RETURNING owner_id, id
     ), details AS (
       INSERT INTO finance.balance_adjustments (owner_id, checkpoint_id, idempotency_key, original_projection, note)
       SELECT saved.owner_id, saved.id, $2, b.confirmed_amount + coalesce(effects.delta, 0), $6
         FROM saved CROSS JOIN confirmation b
         CROSS JOIN LATERAL (
           ${sumBankEffects(true, "(b.as_of_date, b.created_at)", "($5::date, b.confirmed_at)")}
         ) effects
       RETURNING owner_id, checkpoint_id
     )
     INSERT INTO finance.audit_changes (owner_id, id, change_type)
     SELECT owner_id, checkpoint_id, 'checkpoint_confirmed' FROM details`,
    [...fields, id],
  );
  if (inserted.rowCount === 1) return { status: "created", id };

  const configured = await client.query(
    "SELECT 1 FROM finance.balance_checkpoints WHERE owner_id = $1 AND currency = $2 LIMIT 1",
    [ownerId, currency],
  );
  return { status: configured.rowCount ? "before-opening" : "unconfigured" };
}

// Call within the authorized owner's transaction. The checkpoint and audit
// share an ID across tables and are committed together; neither is an event.
export async function saveOpeningBalance(
  client: pg.PoolClient,
  ownerId: string,
  balance: BankBalance,
): Promise<"created" | "replayed" | "conflict"> {
  await lockBankWrites(client, ownerId);
  const { currency, amount, asOfDate } = balance;
  const id = openingIds[currency];
  const inserted = await client.query(
    `WITH opening AS (
       INSERT INTO finance.balance_checkpoints
         (owner_id, id, currency, confirmed_amount, as_of_date, created_at)
       SELECT $1, $2::uuid, $3::finance.currency, $4::finance.exact_amount, $5::date, clock_timestamp()
        WHERE NOT EXISTS (
          SELECT 1 FROM finance.balance_checkpoints
           WHERE owner_id = $1 AND currency = $3
        )
       ON CONFLICT (owner_id, id) DO NOTHING
       RETURNING owner_id, id
     )
     INSERT INTO finance.audit_changes (owner_id, id, change_type)
       SELECT owner_id, id, 'checkpoint_confirmed' FROM opening`,
    [ownerId, id, currency, amount, asOfDate],
  );
  if (inserted.rowCount === 1) return "created";

  // A separate statement sees a competing insert committed while we waited
  // on the unique key. Only an exact replay of this opening counts as success.
  const replay = await client.query(
    `SELECT 1 FROM finance.balance_checkpoints
      WHERE owner_id = $1 AND id = $2 AND currency = $3
        AND confirmed_amount = $4 AND as_of_date = $5`,
    [ownerId, id, currency, amount, asOfDate],
  );
  return replay.rowCount === 1 ? "replayed" : "conflict";
}
