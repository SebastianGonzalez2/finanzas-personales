import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  normalizeFilterName,
  type SavedFilter,
  type SavedFilterCommand,
} from "../domain/history-filters.ts";
import { rememberSchema, schemaKnown } from "./schema-ready.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function savedFiltersReady(client: pg.PoolClient) {
  if (schemaKnown.has("savedFiltersReady")) return true;
  const { rows } = await client.query<{ ready: boolean }>(
    `SELECT to_regclass('finance.saved_history_filters') IS NOT NULL AS ready`,
  );
  return rememberSchema("savedFiltersReady", rows[0].ready);
}

export async function listSavedFilters(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<{
    id: string;
    name: string;
    version: number;
    criteria: Record<string, unknown>;
  }>(
    `SELECT id, name, version, criteria
       FROM finance.saved_history_filters
      WHERE owner_id = $1
      ORDER BY name, id`,
    [ownerId],
  );
  return rows.map<SavedFilter>(({ id, name, version, criteria }) => ({
    id,
    name,
    version,
    criteria: Object.fromEntries(
      Object.entries(criteria).filter(
        ([key, value]) =>
          typeof value === "string" && value && key !== "before",
      ),
    ),
  }));
}

// Corre dentro de la transacción de withGoogleOwner. Cada envío lleva una
// clave de idempotencia: repetir el mismo envío no duplica filtros y reutilizar
// la clave con otros datos se rechaza, igual que en el catálogo de nombres.
export async function saveSavedFilterCommand(
  client: pg.PoolClient,
  ownerId: string,
  command: SavedFilterCommand,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:filtros-guardados:' || $1::text, 0))",
    [ownerId],
  );
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const {
    rows: [previous],
  } = await client.query<{ entry_id: string; hash: string }>(
    `SELECT entry_id, command_hash AS hash FROM finance.saved_filter_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, command.idempotencyKey],
  );
  if (previous) {
    if (previous.hash !== hash)
      return conflict("Este envío ya se usó con otros datos.");
    return { status: "replayed", id: previous.entry_id } as const;
  }

  const normalized = "name" in command ? normalizeFilterName(command.name) : "";

  if (command.action === "create") {
    const {
      rows: [existing],
    } = await client.query<{ id: string }>(
      `SELECT id FROM finance.saved_history_filters
        WHERE owner_id = $1 AND normalized_name = $2`,
      [ownerId, normalized],
    );
    if (existing)
      return conflict("Ya tenés un filtro guardado con ese nombre.");
    const id = randomUUID();
    await client.query(
      `INSERT INTO finance.saved_history_filters
         (owner_id, id, name, normalized_name, criteria)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [ownerId, id, command.name, normalized, JSON.stringify(command.criteria)],
    );
    await recordSavedFilterChange(client, ownerId, command, id, hash, 1);
    return { status: "created", id } as const;
  }

  const {
    rows: [current],
  } = await client.query<{ version: number }>(
    `SELECT version FROM finance.saved_history_filters
      WHERE owner_id = $1 AND id = $2`,
    [ownerId, command.entryId],
  );
  if (!current) return { status: "not-found" } as const;
  if (current.version !== command.version)
    return conflict(
      "El filtro cambió. Actualizá la página y volvé a intentarlo.",
    );

  if (command.action === "rename") {
    const {
      rows: [taken],
    } = await client.query<{ id: string }>(
      `SELECT id FROM finance.saved_history_filters
        WHERE owner_id = $1 AND normalized_name = $2 AND id <> $3`,
      [ownerId, normalized, command.entryId],
    );
    if (taken) return conflict("Ya tenés un filtro guardado con ese nombre.");
    const version = current.version + 1;
    await client.query(
      `UPDATE finance.saved_history_filters
          SET name = $3, normalized_name = $4, version = $5
        WHERE owner_id = $1 AND id = $2`,
      [ownerId, command.entryId, command.name, normalized, version],
    );
    await recordSavedFilterChange(
      client,
      ownerId,
      command,
      command.entryId,
      hash,
      version,
    );
    return { status: "saved", id: command.entryId } as const;
  }

  if (command.action === "update-criteria") {
    const version = current.version + 1;
    await client.query(
      `UPDATE finance.saved_history_filters SET criteria = $3::jsonb, version = $4
        WHERE owner_id = $1 AND id = $2`,
      [ownerId, command.entryId, JSON.stringify(command.criteria), version],
    );
    await recordSavedFilterChange(
      client,
      ownerId,
      command,
      command.entryId,
      hash,
      version,
    );
    return { status: "saved", id: command.entryId } as const;
  }

  await client.query(
    "DELETE FROM finance.saved_history_filters WHERE owner_id = $1 AND id = $2",
    [ownerId, command.entryId],
  );
  await recordSavedFilterChange(
    client,
    ownerId,
    command,
    command.entryId,
    hash,
    current.version,
  );
  return { status: "saved", id: command.entryId } as const;
}

async function recordSavedFilterChange(
  client: pg.PoolClient,
  ownerId: string,
  command: SavedFilterCommand,
  entryId: string,
  hash: string,
  version: number,
) {
  await client.query(
    `INSERT INTO finance.saved_filter_changes
       (owner_id, idempotency_key, command_hash, entry_id, action, version)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ownerId, command.idempotencyKey, hash, entryId, command.action, version],
  );
}
