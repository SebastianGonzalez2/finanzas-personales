import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import {
  recurrenceSchedule,
  type CreateRecurrence,
  type RecurrenceDefinition,
} from "../domain/recurrence-definition.ts";
import {
  latestRecurrencePeriod,
  recurrenceIsFinished,
  recurrenceLifecycle,
  recurrencePeriodAt,
} from "../domain/recurrences.ts";
import type { RecurrencePauseCommand } from "../domain/recurrence-pause.ts";
import { commandHash, resolveMovementCategory } from "./movements.ts";

export async function recurrencesReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.recurring_series') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

// The creation receipt is the immutable v1 definition itself. Serializing
// each key lets a retry read the receipt before revalidating the category.
export async function createRecurrence(
  client: pg.PoolClient,
  ownerId: string,
  command: CreateRecurrence,
) {
  const { idempotencyKey: id, ...definition } = command;
  const hash = createHash("sha256")
    .update(JSON.stringify(definition))
    .digest("hex");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:recurrences:' || jsonb_build_array($1::text, $2::text)::text, 0))",
    [ownerId, id],
  );
  const {
    rows: [receipt],
  } = await client.query<{ command_hash: string }>(
    "SELECT command_hash FROM finance.recurring_series WHERE owner_id = $1 AND id = $2",
    [ownerId, id],
  );
  if (receipt)
    return {
      status: receipt.command_hash === hash ? "replayed" : "conflict",
      id,
    } as const;

  const categoryId = await resolveMovementCategory(
    client,
    ownerId,
    definition.kind,
    definition.categoryId,
  );
  if (categoryId === undefined) return { status: "not-found" } as const;
  await client.query(
    `INSERT INTO finance.recurring_series (owner_id, id, command_hash, kind, concept, category_id,
       currency, note, reference_amount, frequency, first_period, date_mode, due_day, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      ownerId,
      id,
      hash,
      definition.kind,
      definition.concept,
      categoryId,
      definition.currency,
      definition.note,
      definition.referenceAmount,
      definition.frequency,
      definition.firstPeriod,
      definition.dateMode,
      definition.dueDay,
      definition.endDate,
    ],
  );
  return { status: "created", id } as const;
}

// Pause and resume move only the lifecycle flag. Periods, settlements and the
// definition receipt stay untouched, so the past never changes (RF-035). The
// command receipt reuses the recurring_commands ledger for idempotency.
export async function setRecurrencePaused(
  client: pg.PoolClient,
  ownerId: string,
  command: RecurrencePauseCommand,
  today: string,
) {
  const { seriesId, idempotencyKey: id, action } = command;
  const hash = commandHash(["recurring-pause-v1", JSON.stringify(command)]);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:recurrences:' || jsonb_build_array($1::text, $2::text)::text, 0))",
    [ownerId, seriesId],
  );
  const {
    rows: [receipt],
  } = await client.query<{ command_hash: string }>(
    "SELECT command_hash FROM finance.recurring_commands WHERE owner_id = $1 AND id = $2",
    [ownerId, id],
  );
  if (receipt)
    return {
      status: receipt.command_hash === hash ? "replayed" : "conflict",
      id,
    } as const;

  const {
    rows: [series],
  } = await client.query<{ paused: boolean; endDate: string | null }>(
    `SELECT paused, end_date::text AS "endDate"
       FROM finance.recurring_series WHERE owner_id = $1 AND id = $2`,
    [ownerId, seriesId],
  );
  if (!series) return { status: "not-found", id } as const;
  if (recurrenceIsFinished(series.endDate, today))
    return { status: "finished", id } as const;

  await client.query(
    `INSERT INTO finance.recurring_commands (owner_id, id, series_id, command_hash, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [ownerId, id, seriesId, hash, JSON.stringify({ action })],
  );
  // A repeated request with a fresh key stays a no-op: no version bump.
  await client.query(
    "UPDATE finance.recurring_series SET paused = $3, version = version + 1 WHERE owner_id = $1 AND id = $2 AND paused <> $3",
    [ownerId, seriesId, action === "pause"],
  );
  return { status: "created", id } as const;
}

export async function listRecurrences(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
) {
  const { rows } = await client.query<
    RecurrenceDefinition & {
      id: string;
      category: string | null;
      paused: boolean;
    }
  >(
    `SELECT s.id, s.kind, s.concept, s.currency, s.note, c.name AS category,
       s.category_id AS "categoryId", s.reference_amount::text AS "referenceAmount",
       s.frequency, s.first_period::text AS "firstPeriod", s.date_mode AS "dateMode",
       s.due_day AS "dueDay", s.end_date::text AS "endDate", s.paused
     FROM finance.recurring_series s
     LEFT JOIN finance.categories c ON (c.owner_id,c.id) = (s.owner_id,s.category_id)
     WHERE s.owner_id = $1 ORDER BY s.created_at DESC, s.id`,
    [ownerId],
  );
  return rows.map(({ paused, ...definition }) => {
    const schedule = recurrenceSchedule(definition);
    return {
      ...definition,
      status: recurrenceLifecycle(
        { paused, endDate: definition.endDate },
        today,
      ),
      first: recurrencePeriodAt(schedule, 0),
      latest: latestRecurrencePeriod(schedule, today),
    };
  });
}
