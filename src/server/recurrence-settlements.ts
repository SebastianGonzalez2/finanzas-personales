import "server-only";
import type pg from "pg";
import { coverageDecimal, coverageUnits } from "../domain/fund-coverage.ts";
import {
  duplicateSettlement,
  settlementAmounts,
  type Settlement,
  type SettlementEvent,
  type TrackedPeriod,
} from "../domain/recurrence-settlements.ts";
import {
  latestTrackedIndex,
  plannedPeriodAt,
  suppressedByPause,
  type RecurrencePlan,
} from "../domain/recurrence-plan.ts";
import type { UsualShare } from "../domain/recurring-shares.ts";
import { installmentTotal } from "../domain/installments.ts";
import { parseCreditCommand } from "../domain/credit-operations.ts";
import {
  allocationMatches,
  parseSharedExpense,
} from "../domain/shared-expenses.ts";
import { isSharedExpense } from "./shared-expense-schema.ts";
import { saveSharedExpense } from "./shared-expenses.ts";
import { lockBankWrites } from "./bank-balances.ts";
import { saveCreditOperation } from "./credit-operations.ts";
import { commandHash, findReplay, saveMovement } from "./movements.ts";
import { loadRecurrence } from "./recurrences.ts";

type Series = RecurrencePlan & { id: string; usualShares?: UsualShare[] };
type Candidate = SettlementEvent & { concept: string; cardId: string | null };
const conflict = (error: string) => ({ status: "conflict", error }) as const;
const notFound = {
  status: "not-found",
  error: "La recurrencia, el período o el movimiento no está disponible.",
} as const;
const maxAmount = coverageUnits("9999999999999999.9999");
export const recurrencePageSize = 6;

export function trackedPeriodPage(series: Series, start: number) {
  const indices: number[] = [];
  let next = start;
  while (next >= 0) {
    const pause = suppressedByPause(series, next);
    if (pause !== null) next = pause - 1;
    else {
      if (indices.length === recurrencePageSize) break;
      indices.push(next);
      next -= 1;
    }
  }
  return { indices, next };
}

export async function additionalRecurrencePeriods(
  client: pg.PoolClient,
  ownerId: string,
  seriesId: string,
  cursor: number,
  today: string,
) {
  const series = await loadRecurrence(client, ownerId, seriesId);
  if (!series) return null;
  const start = Math.min(cursor, latestTrackedIndex(series, today));
  const { indices, next } = trackedPeriodPage(series, start);
  const periods = await trackedPeriods(client, ownerId, series, indices);
  return {
    periods: periods.filter(
      ({ status }) => status === "expected" || status === "partial",
    ),
    next,
  };
}

export async function trackedPeriods(
  client: pg.PoolClient,
  ownerId: string,
  series: Series,
  indices: number[],
): Promise<TrackedPeriod[]> {
  if (!indices.length) return [];
  const { rows } = await client.query<{
    index: number;
    key: string;
    dueOn: string | null;
    referenceAmount: string | null;
    confirmedTotal: string | null;
    finalizedAmount: string | null;
    omitted: boolean;
    version: number;
    events: SettlementEvent[];
  }>(
    `SELECT p.period_index AS index, p.period_key AS key, p.due_on::text AS "dueOn",
       p.reference_amount::text AS "referenceAmount", p.confirmed_total::text AS "confirmedTotal", p.finalized_amount::text AS "finalizedAmount",
       p.omitted, p.version,
       coalesce(jsonb_agg(jsonb_build_object('id', a.event_id, 'effectiveOn', a.effective_on::text,
         'amount', a.amount::text, 'method', a.method, 'shared',
         EXISTS (SELECT 1 FROM finance.shared_expenses s WHERE (s.owner_id, s.event_id) = (a.owner_id, a.event_id)))
         ORDER BY a.effective_on DESC, a.event_id)
         FILTER (WHERE a.event_id IS NOT NULL), '[]') AS events
     FROM finance.recurring_periods p
     LEFT JOIN finance.recurring_active_allocations a USING (owner_id, series_id, period_index)
     WHERE p.owner_id = $1 AND p.series_id = $2 AND p.period_index = ANY($3::integer[])
     GROUP BY p.owner_id, p.series_id, p.period_index`,
    [ownerId, series.id, indices],
  );
  const saved = new Map(rows.map((row) => [row.index, row]));
  return indices.map((index) => {
    const scheduled = plannedPeriodAt(series, index);
    const row = saved.get(index);
    const events = row?.events ?? [];
    const recorded = coverageDecimal(
      events.reduce(
        (sum, event) => sum + coverageUnits(event.amount),
        BigInt(0),
      ),
    );
    return {
      ...scheduled,
      key: row ? row.key : scheduled.key,
      dueOn: row ? row.dueOn : scheduled.dueOn,
      referenceAmount: row ? row.referenceAmount : series.referenceAmount,
      recorded,
      ...settlementAmounts(
        recorded,
        row?.confirmedTotal ?? null,
        row?.finalizedAmount ?? null,
        row?.omitted ?? false,
      ),
      version: row?.version ?? 0,
      events,
    };
  });
}

async function eligibleEvents(
  client: pg.PoolClient,
  ownerId: string,
  series: Series,
  options:
    | { eventId: string }
    | { date: string }
    | { date: string; amount: string; method: string; cardId: string | null },
) {
  const id = "eventId" in options ? options.eventId : null;
  const date = "date" in options ? options.date : null;
  const duplicate = "amount" in options ? options : null;
  const { rows } = await client.query<Candidate>(
    `SELECT * FROM (
       SELECT f.id, f.effective_on::text AS "effectiveOn", f.concept,
         abs(b.amount_signed)::text AS amount, m.method, NULL::uuid AS "cardId", s.event_id IS NOT NULL AS shared
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects b ON (b.owner_id, b.id, b.event_id) = (m.owner_id, m.event_id, m.event_id)
       LEFT JOIN finance.shared_expenses s ON (s.owner_id, s.event_id) = (f.owner_id, f.id)
       WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.kind = $2
         AND b.currency = $3 AND ($4::uuid IS NULL OR f.id = $4)
         AND ($5::date IS NULL OR f.effective_on = $5)
         AND ($9 OR s.event_id IS NULL)
       UNION ALL
       SELECT f.id, f.effective_on::text, f.concept,
         CASE WHEN $9 THEN coalesce(s.total, p.installment_amount * p.installment_count, c.amount)::text
           ELSE c.amount::text END, 'credit', c.card_id, s.event_id IS NOT NULL
       FROM finance.financial_events f
       JOIN finance.credit_lines c ON (c.owner_id, c.event_id) = (f.owner_id, f.id)
       LEFT JOIN finance.shared_expenses s ON (s.owner_id, s.event_id) = (f.owner_id, f.id)
       LEFT JOIN finance.current_installment_plans p ON $9 AND (p.owner_id, p.event_id) = (f.owner_id, f.id)
       WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.kind = 'card_purchase'
         AND $2 = 'expense' AND c.currency = $3 AND ($4::uuid IS NULL OR f.id = $4)
         AND ($5::date IS NULL OR f.effective_on = $5)
         AND (c.amount > 0 OR ($9 AND p.version IS NOT NULL))
         AND (NOT $9 OR p.version IS NULL OR p.active_count = p.installment_count)
         AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m WHERE (m.owner_id, m.event_id) = (f.owner_id, f.id))
         AND ($9 OR s.event_id IS NULL)
     ) candidates
     WHERE CASE WHEN $6::numeric IS NOT NULL
       THEN amount::numeric = $6 AND method = $7 AND "cardId" IS NOT DISTINCT FROM $8::uuid
       ELSE NOT EXISTS (SELECT 1 FROM finance.recurring_event_lineage l
                        WHERE l.owner_id = $1 AND l.event_id = candidates.id)
     END
     ORDER BY id LIMIT CASE WHEN $6::numeric IS NOT NULL THEN 1 END`,
    [
      ownerId,
      series.kind,
      series.currency,
      id,
      date,
      duplicate?.amount ?? null,
      duplicate?.method ?? null,
      duplicate?.cardId ?? null,
      Boolean(series.usualShares?.length),
    ],
  );
  return rows;
}

export async function linkableRecurrenceEvents(
  client: pg.PoolClient,
  ownerId: string,
  seriesId: string,
  date: string,
) {
  const series = await loadRecurrence(client, ownerId, seriesId);
  return series ? eligibleEvents(client, ownerId, series, { date }) : null;
}

async function detachSettlement(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<Settlement, { action: "detach" }>,
  period: TrackedPeriod,
  hash: string,
) {
  const { seriesId, eventId, idempotencyKey, target } = command;
  if (period.version !== target.version || period.recorded !== target.recorded)
    return conflict(
      "El período cambió. Actualizá la página y revisá los importes.",
    );
  const {
    rows: [link],
  } = await client.query<{ settlement_id: string }>(
    `SELECT settlement_id FROM finance.recurring_active_allocations
      WHERE owner_id = $1 AND series_id = $2 AND period_index = $3 AND event_id = $4`,
    [ownerId, seriesId, period.index, eventId],
  );
  if (!link) return notFound;
  if (await isSharedExpense(client, ownerId, eventId))
    return conflict(
      "El pago compartido conserva el vínculo con su período y sus cobros.",
    );

  await client.query(
    `INSERT INTO finance.recurring_commands (owner_id,id,series_id,command_hash,details)
      VALUES ($1,$2,$3,$4,$5)`,
    [
      ownerId,
      idempotencyKey,
      seriesId,
      hash,
      JSON.stringify({ action: "detach", eventId, target }),
    ],
  );
  const released = await client.query(
    "UPDATE finance.recurring_commands SET released_by = $3 WHERE owner_id = $1 AND id = $2",
    [ownerId, link.settlement_id, idempotencyKey],
  );
  if (released.rowCount !== 1) throw new Error("Vínculo no actualizado");
  await client.query(
    `UPDATE finance.recurring_periods p SET version = p.version + 1, finalized_amount = NULL
      FROM finance.recurring_allocations a
      WHERE (p.owner_id,p.series_id,p.period_index) = (a.owner_id,a.series_id,a.period_index)
        AND a.owner_id = $1 AND a.settlement_id = $2`,
    [ownerId, link.settlement_id],
  );
  return { status: "created", id: idempotencyKey } as const;
}

export async function applySettlement(
  client: pg.PoolClient,
  ownerId: string,
  command: Settlement,
  today: string,
) {
  const { seriesId, idempotencyKey } = command;
  const hash = commandHash([
    "recurring-settlement-v1",
    JSON.stringify(command),
  ]);
  await lockBankWrites(client, ownerId);
  const {
    rows: [receipt],
  } = await client.query<{ command_hash: string; event_id: string | null }>(
    "SELECT command_hash, event_id FROM finance.recurring_commands WHERE owner_id = $1 AND id = $2",
    [ownerId, idempotencyKey],
  );
  if (receipt?.command_hash === hash)
    return {
      status: "replayed",
      id: receipt.event_id ?? idempotencyKey,
    } as const;
  if (receipt || (await findReplay(client, ownerId, idempotencyKey, hash)))
    return conflict("Ese envío ya se usó con otros datos.");

  const series = await loadRecurrence(client, ownerId, seriesId);
  if (!series) return notFound;
  const movement =
    command.action === "record" || command.action === "link" ? command : null;
  const sharing = series.usualShares.length > 0;
  if (movement?.split && !sharing)
    return conflict("La recurrencia no tiene un reparto habitual.");
  const targets =
    "targets" in command
      ? command.targets
      : [{ ...command.target, amount: "0.0000" }];
  const latest = latestTrackedIndex(series, today);
  if (
    targets.some(
      ({ index }) =>
        index > latest || suppressedByPause(series, index) !== null,
    )
  )
    return notFound;
  if (sharing && targets.length !== 1)
    return conflict("Confirmá cada pago compartido en su propio período.");
  if (
    movement?.split &&
    !allocationMatches(movement.split, movement.amount, series.currency)
  )
    return conflict(
      "Tu parte y las de las otras personas deben sumar exactamente el importe real.",
    );
  if (series.kind === "income" && targets.length !== 1)
    return conflict("Cada cobro corresponde a un único período de ingreso.");

  const periods = await trackedPeriods(
    client,
    ownerId,
    series,
    targets.map(({ index }) => index),
  );
  if (command.action === "detach")
    return detachSettlement(client, ownerId, command, periods[0], hash);

  const updates = [];
  for (const [position, target] of targets.entries()) {
    const period = periods[position];
    if (
      period.version !== target.version ||
      period.recorded !== target.recorded
    )
      return conflict(
        "El período cambió. Actualizá la página y revisá los importes.",
      );
    if (
      command.action === "restore"
        ? period.status !== "skipped"
        : period.status === "skipped"
    )
      return conflict("Revisá el estado del período antes de continuar.");
    if (movement && period.status === "completed")
      return conflict(
        "El período está completo. Actualizá su total confirmado antes de registrar otro movimiento.",
      );
    const actual =
      coverageUnits(period.recorded) + coverageUnits(target.amount);
    if (actual > maxAmount)
      return conflict("El total registrado supera el importe admitido.");
    if (command.action === "omit" && actual > BigInt(0))
      return conflict(
        "Para omitir el período debe estar sin pagos ni cobros registrados.",
      );
    if (target.final && actual === BigInt(0))
      return conflict(
        "Registrá al menos un pago o cobro real antes de finalizar el período.",
      );

    const finalizedAmount = target.final ? coverageDecimal(actual) : null;
    const total = target.final
      ? null
      : command.action === "total"
        ? target.total
        : (target.total ?? period.confirmedTotal);
    if (total !== null && actual > coverageUnits(total))
      return conflict(
        "El total confirmado debe cubrir todos los importes ya registrados, incluido el nuevo movimiento.",
      );
    updates.push({ period, total, finalizedAmount });
  }

  let eventId: string | null = null;
  let fixedAllocation = false;
  if (movement?.action === "link") {
    const [event] = await eligibleEvents(client, ownerId, series, {
      eventId: movement.eventId,
    });
    if (!event || event.effectiveOn > today) return notFound;
    if (coverageUnits(event.amount) !== coverageUnits(movement.amount))
      return conflict(
        "El importe del movimiento cambió. Volvé a seleccionarlo.",
      );
    if (sharing) {
      if (event.shared && movement.split)
        return conflict(
          "El movimiento ya tiene un reparto confirmado. Corregilo desde su detalle.",
        );
      if (!event.shared && !movement.split)
        return conflict("Confirmá el reparto real de este pago.");
      if (movement.split?.parties.length) {
        const result = await saveSharedExpense(client, ownerId, {
          action: "split",
          eventId: event.id,
          idempotencyKey,
          ...movement.split,
        });
        if (result.status !== "created")
          return result.status === "not-found"
            ? notFound
            : conflict(
                "message" in result
                  ? result.message
                  : "No pudimos repartir el movimiento.",
              );
      } else {
        fixedAllocation = !event.shared && event.method === "credit";
      }
    }
    eventId = event.id;
  }
  if (movement?.action === "record") {
    const { amount, effectiveOn, method, cardId, split, installment } =
      movement;
    if (sharing && !split)
      return conflict("Confirmá el reparto real de este pago.");
    if (series.kind === "income" ? method !== "deposit" : method === "deposit")
      return conflict("El medio elegido no corresponde a la recurrencia.");
    if (
      !movement.distinct &&
      (
        await eligibleEvents(client, ownerId, series, {
          date: effectiveOn,
          amount,
          method,
          cardId,
        })
      ).length
    )
      return { status: "duplicate", error: duplicateSettlement } as const;

    const common = {
      amount,
      effectiveOn,
      idempotencyKey,
      currency: series.currency,
      concept: series.concept,
      note: series.note,
      categoryId: series.categoryId,
    };
    let result;
    if (split?.parties.length) {
      const sharedCommand = parseSharedExpense(
        {
          ...common,
          action: "create",
          method,
          ...split,
          ...(method === "credit" && {
            cardId,
            covered: false,
            ...installment,
          }),
        },
        today,
      );
      if ("error" in sharedCommand) return conflict(sharedCommand.error);
      result = await saveSharedExpense(client, ownerId, sharedCommand, hash);
    } else if (method === "credit") {
      const purchase = parseCreditCommand(
        {
          ...common,
          action: "purchase",
          cardId,
          covered: false,
          ...(installment && {
            amount: installment.cardAmount,
            plan: installment.plan,
          }),
        },
        today,
      );
      if ("error" in purchase) return conflict(purchase.error);
      if (purchase.action !== "purchase")
        return conflict("Revisá los datos de la compra.");
      if (
        installment &&
        installmentTotal(installment.plan, series.currency) !== amount
      )
        return conflict("Las cuotas deben sumar exactamente el importe real.");
      fixedAllocation = Boolean(installment);
      result = await saveCreditOperation(client, ownerId, purchase, hash);
    } else {
      result = await saveMovement(
        client,
        ownerId,
        { ...common, kind: series.kind, method },
        hash,
      );
    }
    if (result.status !== "created") {
      if (result.status === "not-found") return notFound;
      return conflict(
        "message" in result
          ? result.message
          : result.status === "unconfigured"
            ? "Configurá el saldo inicial de Bancos para esta moneda."
            : result.status === "insufficient-funds"
              ? "El disponible libre no alcanza para registrar este pago."
              : result.status === "invalid-category"
                ? "La categoría de la recurrencia ya no está disponible."
                : "No pudimos registrar el movimiento con esos datos.",
      );
    }
    eventId = result.id;
  }

  await client.query(
    `INSERT INTO finance.recurring_commands (owner_id,id,series_id,event_id,command_hash,details)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      ownerId,
      idempotencyKey,
      seriesId,
      eventId,
      hash,
      JSON.stringify({
        action: command.action,
        targets,
        ...(movement?.split && { split: movement.split }),
        previous: periods.map(({ confirmedTotal, finalized, status }) => ({
          confirmedTotal,
          finalized,
          status,
        })),
      }),
    ],
  );
  for (const [
    position,
    { period, total, finalizedAmount },
  ] of updates.entries()) {
    await client.query(
      `INSERT INTO finance.recurring_periods
         (owner_id,series_id,period_index,period_key,due_on,reference_amount,confirmed_total,finalized_amount,omitted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (owner_id,series_id,period_index) DO UPDATE
         SET confirmed_total = EXCLUDED.confirmed_total, finalized_amount = EXCLUDED.finalized_amount, omitted = EXCLUDED.omitted,
             version = recurring_periods.version + 1`,
      [
        ownerId,
        seriesId,
        period.index,
        period.key,
        period.dueOn,
        period.referenceAmount,
        total,
        finalizedAmount,
        command.action === "omit",
      ],
    );
    if (eventId)
      await client.query(
        `INSERT INTO finance.recurring_allocations (owner_id,series_id,period_index,settlement_id,amount)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          ownerId,
          seriesId,
          period.index,
          idempotencyKey,
          targets.length > 1 || fixedAllocation
            ? targets[position].amount
            : null,
        ],
      );
  }
  return { status: "created", id: eventId ?? idempotencyKey } as const;
}
