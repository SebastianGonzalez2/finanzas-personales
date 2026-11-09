import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type { CardCommand, CatalogCard } from "../domain/cards.ts";
import { lockBankWrites } from "./bank-balances.ts";
import { lockCardWrites, saveOpeningDebt } from "./credit-operations.ts";
import { creditOperationsReady, findReplay } from "./movements.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function cardsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.cards') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function listCards(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<CatalogCard>(
    `SELECT c.id, c.kind, c.name, c.issuer, c.version, (c.archived_at IS NOT NULL) AS archived,
            jsonb_agg(jsonb_build_object(
              'currency', p.currency, 'limit', p.credit_limit::text,
              'debt', CASE WHEN c.kind = 'credit' THEN coalesce(p.debt, 0)::text END,
              'creditBalance', CASE WHEN c.kind = 'credit' THEN coalesce(p.credit_balance, 0)::text END
            ) ORDER BY array_position(ARRAY['UYU','USD','EUR'], p.currency::text)) AS currencies
       FROM finance.cards c JOIN finance.card_currencies p
         ON (p.owner_id, p.card_id) = (c.owner_id, c.id)
      WHERE c.owner_id = $1
      GROUP BY c.owner_id, c.id
      ORDER BY (c.archived_at IS NOT NULL), lower(c.name), c.id`,
    [ownerId],
  );
  return rows;
}

// Runs inside withGoogleOwner's transaction. Serialize commands for a titular,
// including retries with the same key against different cards.
export async function saveCard(
  client: pg.PoolClient,
  ownerId: string,
  command: CardCommand,
) {
  const opening = command.action === "create" ? command.opening : undefined;
  if (opening) await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const {
    rows: [previous],
  } = await client.query<{ id: string; hash: string }>(
    `SELECT card_id AS id, command_hash AS hash FROM finance.card_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, command.idempotencyKey],
  );
  if (previous) {
    if (previous.hash !== hash)
      return conflict("Este envío ya se usó con otros datos.");
    return { status: "replayed", id: previous.id } as const;
  }

  if (opening) {
    if (!(await creditOperationsReady(client)))
      return conflict(
        "La deuda inicial estará disponible cuando se actualice la base de datos.",
      );
    if (await findReplay(client, ownerId, command.idempotencyKey, hash))
      return conflict("Este envío ya se usó con otros datos.");
  }

  const id = command.action === "create" ? randomUUID() : command.cardId;
  let kind;
  let version = 1;
  if (command.action === "create") {
    kind = command.kind;
    await client.query(
      "INSERT INTO finance.cards (owner_id, id, kind, name, issuer) VALUES ($1, $2, $3, $4, $5)",
      [ownerId, id, kind, command.name, command.issuer],
    );
  } else {
    const {
      rows: [current],
    } = await client.query<Pick<CatalogCard, "kind" | "version" | "archived">>(
      `SELECT kind, version, (archived_at IS NOT NULL) AS archived FROM finance.cards
        WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
      [ownerId, id],
    );
    if (!current) return { status: "not-found" } as const;
    if (current.archived || current.version !== command.version)
      return conflict(
        "La tarjeta cambió. Actualizá la página y revisá su estado.",
      );
    kind = current.kind;
    version = current.version + 1;
    if (command.action === "archive") {
      await client.query(
        "UPDATE finance.cards SET archived_at = clock_timestamp(), version = $3 WHERE owner_id = $1 AND id = $2",
        [ownerId, id, version],
      );
    } else {
      if (
        kind === "debit" &&
        command.currencies.some(({ limit }) => limit !== null)
      )
        return { status: "invalid-limit" } as const;
      const currencies = command.currencies.map(({ currency }) => currency);
      const args = [ownerId, id, currencies];
      const { rows: removed } = await client.query<{ recorded: boolean }>(
        `SELECT debt IS NOT NULL OR credit_balance IS NOT NULL AS recorded
           FROM finance.card_currencies
          WHERE owner_id = $1 AND card_id = $2 AND currency::text <> ALL($3::text[])
          FOR UPDATE`,
        args,
      );
      if (removed.some(({ recorded }) => recorded))
        return conflict("Conservá las monedas con posiciones registradas.");
      if (removed.length)
        await client.query(
          `DELETE FROM finance.card_currencies
            WHERE owner_id = $1 AND card_id = $2 AND currency::text <> ALL($3::text[])`,
          args,
        );
      await client.query(
        "UPDATE finance.cards SET name = $3, issuer = $4, version = $5 WHERE owner_id = $1 AND id = $2",
        [ownerId, id, command.name, command.issuer, version],
      );
    }
  }

  if (command.action !== "archive") {
    for (const { currency, limit } of command.currencies) {
      await client.query(
        `INSERT INTO finance.card_currencies (owner_id, card_id, kind, currency, credit_limit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (owner_id, card_id, currency) DO UPDATE SET credit_limit = excluded.credit_limit`,
        [ownerId, id, kind, currency, limit],
      );
    }
  }

  if (command.action === "create" && opening)
    await saveOpeningDebt(
      client,
      ownerId,
      id,
      command.name,
      command.idempotencyKey,
      opening,
      hash,
    );

  const configuration =
    command.action === "archive"
      ? {}
      : {
          kind,
          name: command.name,
          issuer: command.issuer,
          currencies: command.currencies,
        };
  await client.query(
    `INSERT INTO finance.card_changes (owner_id, idempotency_key, command_hash, card_id, version, action, configuration)
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
  return {
    status: command.action === "create" ? "created" : "saved",
    id,
  } as const;
}
