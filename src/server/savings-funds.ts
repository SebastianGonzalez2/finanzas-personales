import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { bankCurrencies, formatBankAmount } from "../domain/bank-balances.ts";
import { Money, type Currency } from "../domain/money.ts";
import type {
  FundAvailability,
  FundCommand,
  FundMovement,
  SavingsFund,
} from "../domain/savings-funds.ts";
import {
  bankBalanceQuery,
  bankReconciliationReady,
  lockBankWrites,
} from "./bank-balances.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function savingsFundsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.savings_funds') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function reserveEffectsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.reserve_effects') IS NOT NULL AS ready",
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
            target_amount::text AS "targetAmount",
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
) {
  const ready = await bankReconciliationReady(client);
  // One snapshot for the bank projection and reserves. No fund-linked credit
  // commitments exist yet; those will earmark money within existing reserves.
  const { rows } = await client.query<FundAvailability>(
    `WITH balances AS (${bankBalanceQuery(ready)}), reserved AS (
       SELECT currency, sum(reserved_amount) AS amount
         FROM finance.savings_funds
        WHERE owner_id = $1 AND currency = ANY($2::finance.currency[])
        GROUP BY currency
     )
     SELECT b.currency,
            round(coalesce(b."calculatedAmount", b.amount)::numeric - coalesce(r.amount, 0), 4)::text AS amount
       FROM balances b LEFT JOIN reserved r USING (currency)
      ORDER BY array_position($2::finance.currency[], b.currency)`,
    [ownerId, currencies],
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
  configuration: Record<string, string>,
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
      return conflict(
        `Configurá el saldo bancario en ${currency} antes de reservar.`,
      );
    // Both amounts have exactly four fractional digits. Availability can exceed
    // the per-fund numeric range, so compare units without narrowing the total.
    if (
      BigInt(amount.replace(".", "")) >
      BigInt(available.amount.replace(".", ""))
    )
      return conflict(
        `Disponible libre: ${formatBankAmount(available)}. Reducí el importe de la reserva.`,
      );
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
      return conflict("El importe supera el máximo admitido para el fondo.");
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

// Runs inside withGoogleOwner's transaction; bank balances are read only.
export async function saveSavingsFund(
  client: pg.PoolClient,
  ownerId: string,
  command: FundCommand,
) {
  if ("amount" in command) {
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
  if (command.action === "create") {
    id = randomUUID();
    version = 1;
    await client.query(
      `INSERT INTO finance.savings_funds (owner_id, id, name, currency, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [ownerId, id, command.name, command.currency],
    );
  } else {
    id = command.fundId;
    const {
      rows: [current],
    } = await client.query<Pick<SavingsFund, "status" | "version">>(
      `SELECT status, version FROM finance.savings_funds
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
    version = current.version + 1;
    await client.query(
      `UPDATE finance.savings_funds
          SET name = $3, status = $4, version = $5, updated_at = clock_timestamp()
        WHERE owner_id = $1 AND id = $2`,
      [ownerId, id, command.name, command.status, version],
    );
  }

  await recordFundChange(
    client,
    ownerId,
    command,
    hash,
    id,
    version,
    command.action === "create"
      ? { name: command.name, currency: command.currency, status: "active" }
      : { name: command.name, status: command.status },
  );
  return {
    status: command.action === "create" ? "created" : "saved",
    id,
  } as const;
}
