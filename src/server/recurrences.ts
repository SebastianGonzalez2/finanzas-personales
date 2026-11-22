import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { bankReferenceToday } from "../domain/bank-balances.ts";
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
import {
  followingRecurrenceMonth,
  latestTrackedIndex,
  nextRecurrenceIndex,
  type RecurrenceChange,
} from "../domain/recurrence-plan.ts";
import type { RecurrenceSeriesCommand } from "../domain/recurrence-pause.ts";
import { lockOwnerWrites } from "./owner-lock.ts";
import {
  commandHash,
  findReplay,
  resolveMovementCategory,
} from "./movements.ts";

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

export async function recurrenceSeriesControlsReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT has_column_privilege('finance.recurring_series', 'paused', 'UPDATE') AS ready",
  );
  return row.ready;
}

type Series = RecurrenceDefinition & {
  id: string;
  category: string | null;
  paused: boolean;
  version: number;
  changes: RecurrenceChange[];
};

async function readSeries(
  client: pg.PoolClient,
  ownerId: string,
  tracking: boolean,
  seriesId: string | null,
) {
  const changes = tracking
    ? `coalesce((SELECT jsonb_agg(r.details ORDER BY (r.details->>'version')::integer)
         FROM finance.recurring_commands r
         WHERE (r.owner_id,r.series_id) = (s.owner_id,s.id)
           AND r.details ? 'effectiveIndex'), '[]')`
    : "'[]'::jsonb";
  const { rows } = await client.query<Series>(
    `SELECT s.id, s.kind, s.concept, s.currency, s.note, c.name AS category,
       s.category_id AS "categoryId", s.reference_amount::text AS "referenceAmount",
       s.frequency, s.first_period::text AS "firstPeriod", s.date_mode AS "dateMode",
       s.due_day AS "dueDay", s.end_date::text AS "endDate", s.paused, s.version,
       ${changes} AS changes
     FROM finance.recurring_series s
     LEFT JOIN finance.categories c ON (c.owner_id,c.id) = (s.owner_id,s.category_id)
     WHERE s.owner_id = $1 AND ($2::uuid IS NULL OR s.id = $2)
     ORDER BY s.created_at DESC, s.id`,
    [ownerId, seriesId],
  );
  return rows;
}

export async function loadRecurrence(
  client: pg.PoolClient,
  ownerId: string,
  seriesId: string,
) {
  const [series] = await readSeries(client, ownerId, true, seriesId);
  return series;
}

export async function applyRecurrenceSeriesCommand(
  client: pg.PoolClient,
  ownerId: string,
  command: RecurrenceSeriesCommand,
  referenceDate?: string,
) {
  const { seriesId, idempotencyKey: id, action } = command;
  const hash = commandHash([
    action === "due-day" ? "recurring-due-day-v1" : "recurring-pause-v1",
    JSON.stringify(command),
  ]);
  // Serialize against settlements before checking the owner-scoped receipt.
  await lockOwnerWrites(client, ownerId);
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

  if (await findReplay(client, ownerId, id, hash))
    return { status: "conflict", id } as const;

  const series = await loadRecurrence(client, ownerId, seriesId);
  if (!series) return { status: "not-found", id } as const;
  // A queued command may reach the write lock after a calendar boundary.
  const today = referenceDate ?? bankReferenceToday();
  if (recurrenceIsFinished(series.endDate, today))
    return { status: "finished", id } as const;

  let change: RecurrenceChange | null = null;
  const effectiveIndex = nextRecurrenceIndex(series, today);
  if (action === "due-day") {
    if (
      command.effectiveMonth !== followingRecurrenceMonth(today) ||
      command.version !== series.version
    )
      return { status: "stale", id } as const;
    if (series.dateMode !== "exact" || series.frequency === "weekly")
      return { status: "no-future-period", id } as const;
    const proposed = {
      action,
      // The first period retains the explicit start date chosen at creation.
      effectiveIndex: Math.max(1, effectiveIndex),
      dueDay: command.dueDay,
    };
    const plan = { ...series, changes: [...series.changes, proposed] };
    const through = series.endDate ?? "9999-12-31";
    if (latestTrackedIndex(plan, through) < proposed.effectiveIndex)
      return { status: "no-future-period", id } as const;
    change = proposed;
  } else if (series.paused !== (action === "pause")) {
    change = { action, effectiveIndex };
  }

  await client.query(
    `INSERT INTO finance.recurring_commands (owner_id, id, series_id, command_hash, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      ownerId,
      id,
      seriesId,
      hash,
      JSON.stringify(
        change ? { ...change, version: series.version + 1 } : { action },
      ),
    ],
  );
  if (change)
    await client.query(
      "UPDATE finance.recurring_series SET paused = $3, version = version + 1 WHERE owner_id = $1 AND id = $2",
      [
        ownerId,
        seriesId,
        action === "due-day" ? series.paused : action === "pause",
      ],
    );
  return { status: "created", id } as const;
}

export async function listRecurrences(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
  tracking = false,
) {
  const rows = await readSeries(client, ownerId, tracking, null);
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
