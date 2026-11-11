import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  normalizeName,
  type CatalogCommand,
  type CatalogEntry,
  type CatalogKind,
} from "../domain/catalog.ts";

const tables = {
  merchant: "finance.merchants",
  person: "finance.people",
} as const;

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function nameCatalogReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    `SELECT to_regclass('finance.merchants') IS NOT NULL
       AND to_regclass('finance.people') IS NOT NULL AS ready`,
  );
  return rows[0].ready;
}

export async function listNameCatalog(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<CatalogEntry>(
    `SELECT id, 'merchant'::text AS kind, name, version,
            (archived_at IS NOT NULL) AS archived
       FROM finance.merchants WHERE owner_id = $1
     UNION ALL
     SELECT id, 'person'::text AS kind, name, version,
            (archived_at IS NOT NULL) AS archived
       FROM finance.people WHERE owner_id = $1
     ORDER BY (kind = 'person'), (archived), lower(name), id`,
    [ownerId],
  );
  return rows;
}

// Autocompletado solo con entradas activas; archivadas no se sugieren (v9.45).
export async function searchNameCatalog(
  client: pg.PoolClient,
  ownerId: string,
  kind: CatalogKind,
  query: string,
  limit = 8,
) {
  const normalized = normalizeName(query);
  if (!normalized) return [];
  const pattern = `${normalized.replace(/[\\%_]/g, "\\$1")}%`;
  const { rows } = await client.query<CatalogEntry>(
    `SELECT id, name, version, false AS archived FROM ${tables[kind]}
      WHERE owner_id = $1 AND archived_at IS NULL AND normalized_name LIKE $2
      ORDER BY normalized_name, id LIMIT $3`,
    [ownerId, pattern, limit],
  );
  return rows;
}

// Corre dentro de la transacción de withGoogleOwner. Los comandos llevan
// idempotencia por envío; el alta por coincidencia normalizada nunca crea
// duplicados tipográficos ni reactiva entradas archivadas por su cuenta.
export async function saveCatalogCommand(
  client: pg.PoolClient,
  ownerId: string,
  command: CatalogCommand,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const table = tables[command.kind];
  const {
    rows: [previous],
  } = await client.query<{ entry_id: string; hash: string }>(
    `SELECT entry_id, command_hash AS hash FROM finance.name_catalog_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, command.idempotencyKey],
  );
  if (previous) {
    if (previous.hash !== hash)
      return conflict("Este envío ya se usó con otros datos.");
    return { status: "replayed", id: previous.entry_id } as const;
  }

  if (command.action === "create") {
    const normalized = normalizeName(command.name);
    const {
      rows: [existing],
    } = await client.query<{ id: string; archived: boolean }>(
      `SELECT id, (archived_at IS NOT NULL) AS archived FROM ${table}
        WHERE owner_id = $1 AND normalized_name = $2 FOR UPDATE`,
      [ownerId, normalized],
    );
    if (existing) {
      if (existing.archived)
        return conflict(
          "Ese nombre está archivado. Restauralo desde el catálogo para volver a usarlo.",
        );
      return { status: "created", id: existing.id } as const;
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO ${table} (owner_id, id, name, normalized_name) VALUES ($1, $2, $3, $4)`,
      [ownerId, id, command.name, normalized],
    );
    await recordCatalogChange(client, ownerId, command, id, 1);
    return { status: "created", id } as const;
  }

  const id = command.entryId;
  const {
    rows: [current],
  } = await client.query<{ version: number; archived: boolean }>(
    `SELECT version, (archived_at IS NOT NULL) AS archived FROM ${table}
      WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
    [ownerId, id],
  );
  if (!current) return { status: "not-found" } as const;
  if (current.version !== command.version)
    return conflict(
      "El catálogo cambió. Actualizá la página y revisá su estado.",
    );
  if (current.archived === (command.action === "archive"))
    return { status: "saved", id } as const;
  const version = current.version + 1;
  await client.query(
    `UPDATE ${table}
        SET archived_at = ${
          command.action === "archive" ? "clock_timestamp()" : "NULL"
        }, version = $3
      WHERE owner_id = $1 AND id = $2`,
    [ownerId, id, version],
  );
  await recordCatalogChange(client, ownerId, command, id, version);
  return { status: "saved", id } as const;
}

async function recordCatalogChange(
  client: pg.PoolClient,
  ownerId: string,
  command: CatalogCommand,
  entryId: string,
  version: number,
) {
  await client.query(
    `INSERT INTO finance.name_catalog_changes
       (owner_id, idempotency_key, command_hash, kind, entry_id, action, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ownerId,
      command.idempotencyKey,
      createHash("sha256").update(JSON.stringify(command)).digest("hex"),
      command.kind,
      entryId,
      command.action,
      version,
    ],
  );
}
