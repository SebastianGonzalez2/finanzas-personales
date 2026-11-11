import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { bankCurrencies, formatBankAmount } from "../domain/bank-balances.ts";
import { Money, type Currency } from "../domain/money.ts";
import {
  pendingContributionToken,
  targetRemainder,
  type FundAvailability,
  type FundClosureRecord,
  type FundCommand,
  type FundMovement,
  type SavingsFund,
} from "../domain/savings-funds.ts";
import { listBankAvailability, lockBankWrites } from "./bank-balances.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function reserveEffectsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.reserve_effects') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function fundLifecycleReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
       WHERE attrelid = to_regclass('finance.contribution_periods')
         AND attname = 'resolution' AND NOT attisdropped) AS ready`,
  );
  return rows[0].ready;
}

// Money commands take the bank lock before this lock, in owner order.
export async function lockFundWrites(client: pg.PoolClient, ownerId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:funds:' || $1::text, 0))",
    [ownerId],
  );
}

export async function listSavingsFunds(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<SavingsFund>(
    `SELECT id, name, currency, reserved_amount::numeric(20,4)::text AS "reservedAmount",
            target_amount::numeric(20,4)::text AS "targetAmount",
            to_char(target_date, 'YYYY-MM-DD') AS "targetDate", status, version
       FROM finance.savings_funds
      WHERE owner_id = $1
      ORDER BY CASE status
                 WHEN 'active' THEN 0
                 WHEN 'paused_manual' THEN 1
                 WHEN 'paused_target_reached' THEN 2
                 ELSE 3
               END,
               lower(name), id`,
    [ownerId],
  );
  return rows;
}

export async function listFundAvailability(
  client: pg.PoolClient,
  ownerId: string,
  currencies: readonly Currency[] = bankCurrencies,
): Promise<FundAvailability[]> {
  return (await listBankAvailability(client, ownerId, currencies)).map(
    ({ currency, availableAmount }) => ({ currency, amount: availableAmount }),
  );
}

export async function listFundClosures(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<FundClosureRecord>(
    `SELECT fund_id AS "fundId", configuration->>'releasedAmount' AS amount,
            to_char(created_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD') AS "closedOn"
       FROM finance.fund_changes WHERE owner_id = $1 AND action = 'close'`,
    [ownerId],
  );
  return rows;
}

async function recordFundChange(
  client: pg.PoolClient,
  ownerId: string,
  command: FundCommand,
  hash: string,
  id: string,
  version: number,
  configuration: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO finance.fund_changes
       (owner_id, idempotency_key, command_hash, fund_id, version, action, configuration)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ownerId,
      command.idempotencyKey,
      hash,
      id,
      version,
      command.action,
      configuration,
    ],
  );
}

async function saveFundMovement(
  client: pg.PoolClient,
  ownerId: string,
  command: FundMovement,
  hash: string,
) {
  const { fundId, action, amount } = command;
  const ids =
    action === "transfer" ? [fundId, command.destinationFundId] : [fundId];
  const { rows } = await client.query<
    Pick<
      SavingsFund,
      "id" | "currency" | "reservedAmount" | "status" | "version"
    >
  >(
    `SELECT id, currency, reserved_amount::numeric(20,4)::text AS "reservedAmount", status, version
       FROM finance.savings_funds
      WHERE owner_id = $1 AND id = ANY($2::uuid[])
      ORDER BY id = $3 DESC FOR UPDATE`,
    [ownerId, ids, fundId],
  );
  const [source, destination] = rows;
  if (!source || rows.length !== ids.length)
    return { status: "not-found" } as const;
  const { currency } = source;
  if (rows.some(({ status }) => status === "closed"))
    return conflict("Los fondos cerrados conservan su historial.");
  if (
    source.version !== command.version ||
    (action === "transfer" &&
      destination?.version !== command.destinationVersion)
  )
    return conflict(
      "Un fondo cambió. Actualizá la página y revisá los importes.",
    );
  if (destination && destination.currency !== currency)
    return conflict("Elegí dos fondos de la misma moneda.");

  if (action === "reserve") {
    const [available] = await listFundAvailability(client, ownerId, [currency]);
    if (!available)
      return {
        ...conflict(
          `Configurá el saldo bancario en ${currency} antes de reservar.`,
        ),
        reason: "insufficient" as const,
      };
    // Both amounts have exactly four fractional digits. Availability can exceed
    // the per-fund numeric range, so compare units without narrowing the total.
    if (
      BigInt(amount.replace(".", "")) >
      BigInt(available.amount.replace(".", ""))
    )
      return {
        ...conflict(
          `Disponible libre: ${formatBankAmount(available)}. Reducí el importe de la reserva.`,
        ),
        reason: "insufficient" as const,
      };
  }

  const deltas =
    action === "transfer"
      ? [`-${amount}`, amount]
      : [action === "reserve" ? amount : `-${amount}`];
  for (const [index, fund] of rows.entries()) {
    try {
      const next = Money.parse(fund.reservedAmount, currency)
        .add(Money.parse(deltas[index], currency))
        .toDecimal();
      if (next.startsWith("-"))
        return conflict(
          `Reservado en el fondo: ${formatBankAmount({ currency, amount: fund.reservedAmount })}. Reducí el importe.`,
        );
    } catch {
      return {
        ...conflict("El importe supera el máximo admitido para el fondo."),
        reason: "fund_limit" as const,
      };
    }
  }

  await recordFundChange(
    client,
    ownerId,
    command,
    hash,
    fundId,
    source.version + 1,
    {
      amount,
      currency,
      ...(destination && { destinationFundId: destination.id }),
    },
  );
  const written = await client.query(
    `WITH updated AS (
       UPDATE finance.savings_funds AS f
          SET reserved_amount = f.reserved_amount + d.delta,
              status = CASE WHEN f.status = 'active' AND f.target_amount <= f.reserved_amount + d.delta
                            THEN 'paused_target_reached' ELSE f.status END,
              version = f.version + 1, updated_at = clock_timestamp()
         FROM unnest($3::uuid[], $4::numeric[]) AS d(id, delta)
        WHERE f.owner_id = $1 AND f.id = d.id
       RETURNING f.id, f.currency, f.version, d.delta
     )
     INSERT INTO finance.reserve_effects (owner_id, command_id, fund_id, currency, fund_version, delta)
     SELECT $1, $2, id, currency, version, delta FROM updated`,
    [ownerId, command.idempotencyKey, ids, deltas],
  );
  if (written.rowCount !== ids.length)
    throw new Error("No se registraron todos los efectos de la reserva.");
  return { status: "saved", id: fundId } as const;
}

async function closeFund(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<FundCommand, { action: "close" }>,
  hash: string,
  fund: Pick<SavingsFund, "currency" | "reservedAmount" | "version">,
) {
  const { fundId, idempotencyKey } = command;
  const { rows: pending } = await client.query<{ id: string; amount: string }>(
    `SELECT id, amount::text FROM finance.contribution_periods
      WHERE owner_id = $1 AND fund_id = $2 AND status IN ('missed_insufficient', 'missed_execution')
      ORDER BY id`,
    [ownerId, fundId],
  );
  const ids = pending.map(({ id }) => id);
  if (command.pendingToken !== (await pendingContributionToken(ids)))
    return conflict(
      "Las aportaciones pendientes cambiaron. Actualizá la página y revisá el cierre.",
    );

  // This phase has no purchase commitments against reserves; F3-05 must
  // enforce its commitment check here under the same owner locks.
  const version = fund.version + 1;
  await recordFundChange(client, ownerId, command, hash, fundId, version, {
    currency: fund.currency,
    releasedAmount: fund.reservedAmount,
    discardedPeriods: pending,
  });
  await client.query(
    `UPDATE finance.savings_funds
        SET status = 'closed', reserved_amount = 0, version = $3, updated_at = clock_timestamp()
      WHERE owner_id = $1 AND id = $2`,
    [ownerId, fundId, version],
  );
  if (fund.reservedAmount !== "0.0000")
    await client.query(
      `INSERT INTO finance.reserve_effects (owner_id, command_id, fund_id, currency, fund_version, delta)
       VALUES ($1, $2, $3, $4, $5, -$6::numeric)`,
      [
        ownerId,
        idempotencyKey,
        fundId,
        fund.currency,
        version,
        fund.reservedAmount,
      ],
    );
  if (pending.length > 0)
    await client.query(
      `UPDATE finance.contribution_periods
          SET status = 'discarded', resolution = 'fund_closed', resolved_at = clock_timestamp()
        WHERE owner_id = $1 AND fund_id = $2 AND id = ANY($3::uuid[])`,
      [ownerId, fundId, ids],
    );
  return { status: "saved", id: fundId } as const;
}

// Runs inside withGoogleOwner's transaction; bank balances are read only.
export async function saveSavingsFund(
  client: pg.PoolClient,
  ownerId: string,
  command: FundCommand,
) {
  if (
    (command.action === "close" ||
      (command.action === "update" &&
        (command.targetAmount !== undefined ||
          command.targetDate !== undefined))) &&
    !(await fundLifecycleReady(client))
  )
    return { status: "unavailable" } as const;
  if ("amount" in command || command.action === "close") {
    if (!(await reserveEffectsReady(client)))
      return { status: "unavailable" } as const;
    await lockBankWrites(client, ownerId);
  }
  await lockFundWrites(client, ownerId);
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const {
    rows: [previous],
  } = await client.query<{ id: string; hash: string }>(
    `SELECT fund_id AS id, command_hash AS hash FROM finance.fund_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, command.idempotencyKey],
  );
  if (previous) {
    if (previous.hash !== hash)
      return conflict("Este envío ya se usó con otros datos.");
    return { status: "replayed", id: previous.id } as const;
  }
  if ("amount" in command)
    return saveFundMovement(client, ownerId, command, hash);

  let id: string;
  let version: number;
  let configuration: Record<string, unknown>;
  if (command.action === "create") {
    id = randomUUID();
    version = 1;
    await client.query(
      `INSERT INTO finance.savings_funds (owner_id, id, name, currency, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [ownerId, id, command.name, command.currency],
    );
    configuration = {
      name: command.name,
      currency: command.currency,
      status: "active",
    };
  } else {
    id = command.fundId;
    const {
      rows: [current],
    } = await client.query<
      Pick<
        SavingsFund,
        "status" | "version" | "currency" | "targetAmount" | "reservedAmount"
      >
    >(
      `SELECT status, version, currency, target_amount::numeric(20,4)::text AS "targetAmount",
              reserved_amount::numeric(20,4)::text AS "reservedAmount" FROM finance.savings_funds
        WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
      [ownerId, id],
    );
    if (!current) return { status: "not-found" } as const;
    if (current.status === "closed")
      return conflict("El fondo está cerrado y conserva su historial.");
    if (current.version !== command.version)
      return conflict(
        "El fondo cambió. Actualizá la página y revisá su estado.",
      );
    if (command.action === "close")
      return closeFund(client, ownerId, command, hash, current);
    if (current.status === "paused_target_reached" && command.status)
      return conflict(
        "Reactivá las aportaciones de forma expresa desde el aviso de meta alcanzada.",
      );
    let status = command.status ?? current.status;
    const targetAmount =
      command.targetAmount === undefined
        ? current.targetAmount
        : command.targetAmount;
    const remaining = targetRemainder({ ...current, targetAmount });
    if (
      status === "active" &&
      remaining !== null &&
      (remaining === "0.0000" || remaining.startsWith("-"))
    )
      status = "paused_target_reached";
    version = current.version + 1;
    const values: unknown[] = [ownerId, id, command.name, status, version];
    const fields = [];
    if (command.targetAmount !== undefined) {
      fields.push(`target_amount = $${values.push(command.targetAmount)}`);
    }
    if (command.targetDate !== undefined) {
      fields.push(`target_date = $${values.push(command.targetDate)}`);
    }
    await client.query(
      `UPDATE finance.savings_funds
          SET name = $3, status = $4, version = $5, updated_at = clock_timestamp()
              ${fields.length ? ", " + fields.join(", ") : ""}
        WHERE owner_id = $1 AND id = $2`,
      values,
    );
    configuration = {
      name: command.name,
      ...(command.status || status !== current.status ? { status } : {}),
      ...(command.targetAmount === undefined
        ? {}
        : { targetAmount: command.targetAmount }),
      ...(command.targetDate === undefined
        ? {}
        : { targetDate: command.targetDate }),
    };
  }

  await recordFundChange(
    client,
    ownerId,
    command,
    hash,
    id,
    version,
    configuration,
  );
  return {
    status: command.action === "create" ? "created" : "saved",
    id,
  } as const;
}
