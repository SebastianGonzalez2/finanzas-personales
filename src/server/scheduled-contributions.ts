import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import {
  contributionPending,
  type ContributionChange,
  type ContributionCommand,
  type ContributionPeriod,
  type ContributionPlan,
} from "../domain/contribution-plans.ts";
import {
  contributionTowardTarget,
  fundTargetNotices,
  type SavingsFund,
} from "../domain/savings-funds.ts";
import { firstContributionDate } from "../domain/scheduled-contributions.ts";
import { lockBankWrites } from "./bank-balances.ts";
import {
  fundLifecycleReady,
  lockFundWrites,
  saveSavingsFund,
} from "./savings-funds.ts";

const planColumns = `p.fund_id AS "fundId", p.amount::numeric(20,4)::text AS amount, p.preferred_day AS "preferredDay", p.version,
  to_char(p.next_on, 'YYYY-MM-DD') AS "nextOn", p.next_amount::numeric(20,4)::text AS "nextAmount"`;
const periodColumns = `p.id, p.fund_id AS "fundId", f.name AS "fundName", p.currency, p.amount::numeric(20,4)::text AS amount,
  to_char(p.scheduled_on, 'YYYY-MM-DD') AS "scheduledOn", p.status, p.reason,
  to_jsonb(p)->>'resolution' AS resolution,
  to_char(p.resolved_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD') AS "resolvedOn"`;
const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;
const missing = { status: "not-found" } as const;

export async function contributionPlansReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.contribution_plans') IS NOT NULL AS ready",
  );
  return row.ready;
}

export async function listContributionPlans(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<ContributionPlan>(
    `SELECT ${planColumns} FROM finance.contribution_plans p WHERE p.owner_id = $1`,
    [ownerId],
  );
  return rows;
}

export async function listContributionPeriods(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<ContributionPeriod>(
    `SELECT ${periodColumns}
       FROM finance.contribution_periods p
       JOIN finance.savings_funds f ON (f.owner_id, f.id) = (p.owner_id, p.fund_id)
      WHERE p.owner_id = $1 ORDER BY p.scheduled_on DESC, p.id`,
    [ownerId],
  );
  return rows;
}

export async function listContributionChanges(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<ContributionChange>(
    `SELECT idempotency_key AS id, fund_id AS "fundId", action, configuration->>'amount' AS amount,
            (configuration->>'preferredDay')::smallint AS "preferredDay",
            configuration->>'nextOn' AS "nextOn", configuration->>'nextAmount' AS "nextAmount",
            configuration->>'effectiveOn' AS "effectiveOn",
            to_char(created_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD') AS "changedOn"
       FROM finance.contribution_changes WHERE owner_id = $1 AND period_id IS NULL
      ORDER BY created_at DESC, idempotency_key`,
    [ownerId],
  );
  return rows;
}

async function lockContributionWrites(client: pg.PoolClient, ownerId: string) {
  // Same order as the manual reserve and every bank debit.
  await lockBankWrites(client, ownerId);
  await lockFundWrites(client, ownerId);
}

async function reserveContribution(
  client: pg.PoolClient,
  ownerId: string,
  fundId: string,
  amount: string,
) {
  const {
    rows: [fund],
  } = await client.query<Pick<SavingsFund, "status" | "version">>(
    `SELECT status, version FROM finance.savings_funds WHERE owner_id = $1 AND id = $2`,
    [ownerId, fundId],
  );
  if (!fund || fund.status === "closed") return missing;
  const reserveId = randomUUID();
  const result = await saveSavingsFund(client, ownerId, {
    action: "reserve",
    fundId,
    amount,
    version: fund.version,
    idempotencyKey: reserveId,
  });
  if (result.status === "saved")
    return { status: "reserved", reserveId } as const;
  if (result.status === "conflict") return result;
  throw new Error("No se pudo registrar la reserva programada.");
}

async function processDueLocked(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
  pausingFundId?: string,
) {
  const { rows } = await client.query<
    ContributionPlan &
      Pick<SavingsFund, "currency" | "targetAmount" | "reservedAmount">
  >(
    `SELECT ${planColumns}, f.currency, f.target_amount::text AS "targetAmount",
            f.reserved_amount::numeric(20,4)::text AS "reservedAmount"
       FROM finance.contribution_plans p
       JOIN finance.savings_funds f ON (f.owner_id, f.id) = (p.owner_id, p.fund_id)
      WHERE p.owner_id = $1 AND f.status = 'active' AND p.next_on <= $2::date
        AND ($3::uuid IS NULL OR (p.fund_id = $3 AND p.next_on < $2::date))
      ORDER BY p.next_on, p.fund_id`,
    [ownerId, today, pausingFundId ?? null],
  );
  const targetsReady = rows.some(({ targetAmount }) => targetAmount !== null)
    ? await fundLifecycleReady(client)
    : false;
  for (const plan of rows) {
    let { nextOn, nextAmount } = plan;
    if (plan.targetAmount !== null && !targetsReady && !pausingFundId) continue;
    while (
      nextOn &&
      nextAmount &&
      nextOn <= today &&
      (!pausingFundId || nextOn < today)
    ) {
      let reason: ContributionPeriod["reason"] = "late";
      let reserveId: string | null = null;
      let amount = nextAmount;
      let final = false;
      if (nextOn === today) {
        const target = contributionTowardTarget(nextAmount, plan);
        if (target.amount === null) {
          await client.query(
            `UPDATE finance.savings_funds
                SET status = 'paused_target_reached', version = version + 1, updated_at = clock_timestamp()
              WHERE owner_id = $1 AND id = $2`,
            [ownerId, plan.fundId],
          );
          // The fund status trigger has cleared and versioned the plan.
          nextOn = nextAmount = null;
          break;
        }
        amount = target.amount;
        const result = await reserveContribution(
          client,
          ownerId,
          plan.fundId,
          amount,
        );
        if (result.status === "reserved") {
          reserveId = result.reserveId;
          reason = null;
          final = target.final;
        } else if (
          result.status === "conflict" &&
          "reason" in result &&
          (result.reason === "insufficient" || result.reason === "fund_limit")
        ) {
          reason = result.reason;
        } else {
          throw new Error("No se pudo procesar el aporte programado.");
        }
      }
      const status = reserveId
        ? "completed"
        : reason === "insufficient"
          ? "missed_insufficient"
          : "missed_execution";
      const periodId = randomUUID();
      await client.query(
        `INSERT INTO finance.contribution_periods
          (owner_id, id, fund_id, currency, amount, scheduled_on, status, reason, reserve_command_id, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::uuid IS NOT NULL THEN clock_timestamp() END)`,
        [
          ownerId,
          periodId,
          plan.fundId,
          plan.currency,
          amount,
          nextOn,
          status,
          reason,
          reserveId,
        ],
      );
      if (final) {
        await client.query(
          `UPDATE finance.contribution_periods SET resolution = 'target_final'
            WHERE owner_id = $1 AND id = $2`,
          [ownerId, periodId],
        );
        // The reserve reached the target and the fund status trigger paused
        // the plan in this transaction. Never write a new occurrence over it.
        nextOn = nextAmount = null;
        break;
      }
      nextOn = firstContributionDate(nextOn, plan.preferredDay);
      nextAmount = plan.amount;
    }
    if (nextOn !== null)
      await client.query(
        `UPDATE finance.contribution_plans SET next_on = $3, next_amount = $4
        WHERE owner_id = $1 AND fund_id = $2`,
        [ownerId, plan.fundId, nextOn, nextAmount],
      );
  }
}

// Runner and UI use the same owner transaction. Overdue occurrences are kept
// for manual resolution. The automatic reserve is only allowed on its own day.
export async function processDueContributions(
  client: pg.PoolClient,
  ownerId: string,
  today?: string,
) {
  const {
    rows: [row],
  } = await client.query<{ due: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM finance.contribution_plans WHERE owner_id = $1 AND next_on <= $2) AS due`,
    [ownerId, today ?? bankReferenceToday()],
  );
  if (!row.due) return;
  await lockContributionWrites(client, ownerId);
  await processDueLocked(client, ownerId, today ?? bankReferenceToday());
}

export async function saveContributionCommand(
  client: pg.PoolClient,
  ownerId: string,
  command: ContributionCommand,
  referenceDate?: string,
) {
  await lockContributionWrites(client, ownerId);
  const today = referenceDate ?? bankReferenceToday();
  const { idempotencyKey, action } = command;
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const {
    rows: [prior],
  } = await client.query<{ id: string; hash: string }>(
    `SELECT coalesce(period_id, fund_id) AS id, command_hash AS hash FROM finance.contribution_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, idempotencyKey],
  );
  if (prior) {
    return prior.hash === hash
      ? ({ status: "saved", id: prior.id } as const)
      : conflict("Este envío ya se usó con otros datos.");
  }

  let fundId: string;
  let periodId: string | null = null;
  let configuration: Record<string, unknown>;
  if ("periodId" in command) {
    periodId = command.periodId;
    const {
      rows: [period],
    } = await client.query<ContributionPeriod>(
      `SELECT ${periodColumns} FROM finance.contribution_periods p
         JOIN finance.savings_funds f ON (f.owner_id, f.id) = (p.owner_id, p.fund_id)
        WHERE p.owner_id = $1 AND p.id = $2`,
      [ownerId, periodId],
    );
    if (!period) return missing;
    if (!contributionPending(period))
      return conflict("Esta aportación ya fue resuelta.");
    fundId = period.fundId;
    let reserveId: string | null = null;
    if (action === "complete") {
      const result = await reserveContribution(
        client,
        ownerId,
        fundId,
        period.amount,
      );
      if (
        result.status === "conflict" &&
        "reason" in result &&
        result.reason === "insufficient"
      ) {
        return conflict(
          `El disponible en ${period.currency} no alcanza para completar esta aportación.`,
        );
      }
      if (result.status !== "reserved") return result;
      reserveId = result.reserveId;
    }
    await client.query(
      `UPDATE finance.contribution_periods SET status = $3, reserve_command_id = $4, resolved_at = clock_timestamp()
        WHERE owner_id = $1 AND id = $2`,
      [ownerId, periodId, reserveId ? "completed" : "discarded", reserveId],
    );
    configuration = {
      amount: period.amount,
      currency: period.currency,
      scheduledOn: period.scheduledOn,
    };
  } else {
    fundId = command.fundId;
    const {
      rows: [fund],
    } = await client.query<SavingsFund>(
      `SELECT id, name, status, currency, version, target_amount::text AS "targetAmount",
              to_char(target_date, 'YYYY-MM-DD') AS "targetDate",
              reserved_amount::numeric(20,4)::text AS "reservedAmount"
         FROM finance.savings_funds WHERE owner_id = $1 AND id = $2`,
      [ownerId, fundId],
    );
    if (!fund) return missing;
    const readPlan = async () =>
      (
        await client.query<ContributionPlan>(
          `SELECT ${planColumns} FROM finance.contribution_plans p WHERE p.owner_id = $1 AND p.fund_id = $2`,
          [ownerId, fundId],
        )
      ).rows[0];
    let priorPlan = await readPlan();
    if (command.version !== (priorPlan?.version ?? 0))
      return conflict(
        "La programación cambió. Actualizá la página y revisala.",
      );
    const startingAfterTarget =
      fund.status === "paused_target_reached" &&
      action === "configure" &&
      !priorPlan;
    if (
      fund.status === "closed" ||
      (fund.status !== "active" &&
        action !== "reactivate" &&
        !startingAfterTarget)
    )
      return conflict("Activá el fondo antes de cambiar su programación.");
    if (action !== "pause" && fundTargetNotices(fund, today).reached)
      return conflict(
        "Aumentá o quitá la meta antes de activar las aportaciones.",
      );
    const amount =
      command.action === "configure" ? command.amount : priorPlan?.amount;
    const preferredDay =
      command.action === "configure"
        ? command.preferredDay
        : priorPlan?.preferredDay;
    if (!amount || !preferredDay) return missing;
    let nextOn: string | null = firstContributionDate(today, preferredDay);
    let nextAmount: string | null = amount;
    const effectiveOn = command.action === "pause" ? null : nextOn;
    if (command.action === "pause") {
      if (!priorPlan?.nextOn)
        return conflict("La programación ya está pausada.");
      await processDueLocked(client, ownerId, today, fundId);
      nextOn = nextAmount = null;
    } else if (command.action === "reactivate") {
      if (!priorPlan) return missing;
      if (priorPlan?.nextOn) return conflict("La programación ya está activa.");
    } else if (priorPlan) {
      if (!priorPlan.nextOn)
        return conflict("Reactivá el plan antes de editarlo.");
      if (priorPlan.nextOn < today) {
        await processDueLocked(client, ownerId, today, fundId);
        priorPlan = await readPlan();
      }
      if (priorPlan.nextOn?.slice(0, 7) === today.slice(0, 7)) {
        nextOn = priorPlan.nextOn;
        nextAmount = priorPlan.nextAmount;
      }
    }
    if (fund.status !== "active")
      await client.query(
        `UPDATE finance.savings_funds
            SET status = 'active', version = version + 1, updated_at = clock_timestamp()
          WHERE owner_id = $1 AND id = $2`,
        [ownerId, fundId],
      );
    await client.query(
      `INSERT INTO finance.contribution_plans (owner_id, fund_id, amount, preferred_day, version, next_on, next_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (owner_id, fund_id) DO UPDATE SET amount = EXCLUDED.amount, preferred_day = EXCLUDED.preferred_day,
          version = EXCLUDED.version, next_on = EXCLUDED.next_on, next_amount = EXCLUDED.next_amount`,
      [
        ownerId,
        fundId,
        amount,
        preferredDay,
        command.version + 1,
        nextOn,
        nextAmount,
      ],
    );
    configuration = { amount, preferredDay, nextOn, nextAmount, effectiveOn };
  }
  await client.query(
    `INSERT INTO finance.contribution_changes (owner_id, idempotency_key, command_hash, fund_id, period_id, action, configuration)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ownerId, idempotencyKey, hash, fundId, periodId, action, configuration],
  );
  return { status: "saved", id: periodId ?? fundId } as const;
}
