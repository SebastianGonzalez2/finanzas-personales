import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type { FundCommand, SavingsFund } from "../domain/savings-funds.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function savingsFundsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.savings_funds') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

// Serialize fund metadata commands per titular, including retries with the
// same key. Future money operations must take the bank lock before this one.
export async function lockFundWrites(client: pg.PoolClient, ownerId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:funds:' || $1::text, 0))",
    [ownerId],
  );
}

export async function listSavingsFunds(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<SavingsFund>(
    `SELECT id, name, currency, reserved_amount::text AS "reservedAmount",
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

// Runs inside withGoogleOwner's transaction. It never changes reserved_amount
// or any bank balance: reserves, releases and transfers are outside this mix.
export async function saveSavingsFund(
  client: pg.PoolClient,
  ownerId: string,
  command: FundCommand,
) {
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
      command.action === "create"
        ? { name: command.name, currency: command.currency, status: "active" }
        : { name: command.name, status: command.status },
    ],
  );
  return {
    status: command.action === "create" ? "created" : "saved",
    id,
  } as const;
}
