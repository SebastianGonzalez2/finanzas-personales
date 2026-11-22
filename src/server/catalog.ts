import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  normalizeName,
  type CatalogCommand,
  type CatalogEntry,
  type CatalogKind,
  type MerchantMergePreview,
  type MerchantPair,
} from "../domain/catalog.ts";
import { rememberSchema, schemaKnown } from "./schema-ready.ts";

const tables = {
  merchant: "finance.merchants",
  person: "finance.people",
} as const;

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

export async function nameCatalogReady(client: pg.PoolClient) {
  if (schemaKnown.has("nameCatalogReady")) return true;
  const { rows } = await client.query<{ ready: boolean }>(
    `SELECT to_regclass('finance.canonical_event_merchants') IS NOT NULL AS ready`,
  );
  return rememberSchema("nameCatalogReady", rows[0].ready);
}

export async function listNameCatalog(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<CatalogEntry>(
    `SELECT id, 'merchant'::text AS kind, name, version,
            (archived_at IS NOT NULL) AS archived
       FROM finance.merchants WHERE owner_id = $1 AND merged_into IS NULL
     UNION ALL
     SELECT id, 'person'::text AS kind, name, version,
            (archived_at IS NOT NULL) AS archived
       FROM finance.people WHERE owner_id = $1
     ORDER BY kind, archived, name, id`,
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
    `SELECT id, name, version, false AS archived, $4::text AS kind FROM ${tables[kind]} entry
      WHERE owner_id = $1 AND archived_at IS NULL AND
        (normalized_name LIKE $2
          ${
            kind === "merchant"
              ? `OR EXISTS (
            SELECT 1 FROM finance.merchants alias
            WHERE (alias.owner_id, alias.merged_into) = (entry.owner_id, entry.id)
              AND alias.normalized_name LIKE $2)`
              : ""
          })
      ORDER BY normalized_name, id LIMIT $3`,
    [ownerId, pattern, limit, kind],
  );
  return rows;
}

// Las escrituras financieras toman este bloqueo después de los bloqueos
// monetarios. Las operaciones del catálogo nunca toman bloqueos monetarios.
async function lockCatalog(client: pg.PoolClient, ownerId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:catalog:' || $1::text, 0))",
    [ownerId],
  );
}

async function findCatalogName(
  client: pg.PoolClient,
  ownerId: string,
  kind: CatalogKind,
  normalized: string,
) {
  const merchant = kind === "merchant";
  const {
    rows: [entry],
  } = await client.query<{ id: string; archived: boolean; version: number }>(
    merchant
      ? `SELECT canonical.id, canonical.version, canonical.archived_at IS NOT NULL AS archived
           FROM finance.merchants named
           JOIN finance.merchants canonical ON (canonical.owner_id, canonical.id) =
             (named.owner_id, coalesce(named.merged_into, named.id))
          WHERE named.owner_id = $1 AND named.normalized_name = $2`
      : `SELECT id, version, archived_at IS NOT NULL AS archived FROM finance.people
          WHERE owner_id = $1 AND normalized_name = $2`,
    [ownerId, normalized],
  );
  return entry;
}

async function insertCatalogName(
  client: pg.PoolClient,
  ownerId: string,
  kind: CatalogKind,
  name: string,
  normalized: string,
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO ${tables[kind]} (owner_id, id, name, normalized_name) VALUES ($1, $2, $3, $4)`,
    [ownerId, id, name, normalized],
  );
  return id;
}

export async function resolveCatalogName(
  client: pg.PoolClient,
  ownerId: string,
  kind: CatalogKind,
  name: string,
) {
  await lockCatalog(client, ownerId);
  const normalized = normalizeName(name);
  const existing = await findCatalogName(client, ownerId, kind, normalized);
  return (
    existing?.id ?? insertCatalogName(client, ownerId, kind, name, normalized)
  );
}

export async function recordEventMerchant(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  name: string,
) {
  const merchantId = await resolveCatalogName(
    client,
    ownerId,
    "merchant",
    name,
  );
  await client.query(
    "INSERT INTO finance.event_merchants (owner_id, event_id, merchant_id) VALUES ($1, $2, $3)",
    [ownerId, eventId, merchantId],
  );
}

export async function copyEventMerchant(
  client: pg.PoolClient,
  ownerId: string,
  fromId: string,
  toId: string,
) {
  if (!(await nameCatalogReady(client))) return;
  await lockCatalog(client, ownerId);
  await client.query(
    `INSERT INTO finance.event_merchants (owner_id, event_id, merchant_id)
     SELECT owner_id, $3, merchant_id FROM finance.event_merchants WHERE owner_id = $1 AND event_id = $2`,
    [ownerId, fromId, toId],
  );
}

export async function findEventMerchant(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (!(await nameCatalogReady(client))) return null;
  const {
    rows: [entry],
  } = await client.query<{ id: string; name: string }>(
    `SELECT m.id, m.name FROM finance.canonical_event_merchants ref
      JOIN finance.merchants m ON (m.owner_id, m.id) = (ref.owner_id, ref.merchant_id)
      WHERE ref.owner_id = $1 AND ref.event_id = $2`,
    [ownerId, eventId],
  );
  return entry ?? null;
}

export async function previewMerchantMerge(
  client: pg.PoolClient,
  ownerId: string,
  { sourceId, targetId }: MerchantPair,
): Promise<MerchantMergePreview | null> {
  const {
    rows: [result],
  } = await client.query<MerchantMergePreview>(
    `SELECT jsonb_build_object('id', s.id, 'name', s.name, 'version', s.version,
              'kind', 'merchant', 'archived', s.archived_at IS NOT NULL) AS source,
            jsonb_build_object('id', t.id, 'name', t.name, 'version', t.version,
              'kind', 'merchant', 'archived', false) AS target,
            (SELECT count(*)::float8 FROM finance.canonical_event_merchants ref
              WHERE ref.owner_id = $1 AND ref.merchant_id IN (s.id, t.id)) AS "movementCount"
       FROM finance.merchants s JOIN finance.merchants t ON t.owner_id = s.owner_id
      WHERE s.owner_id = $1 AND s.id = $2 AND t.id = $3 AND s.id <> t.id
        AND s.merged_into IS NULL AND t.archived_at IS NULL`,
    [ownerId, sourceId, targetId],
  );
  return result ?? null;
}

async function mergeMerchants(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<CatalogCommand, { action: "merge" }>,
) {
  const preview = await previewMerchantMerge(client, ownerId, command);
  if (!preview) return { status: "not-found" } as const;
  if (
    preview.source.version !== command.sourceVersion ||
    preview.target.version !== command.targetVersion ||
    preview.movementCount !== command.movementCount
  )
    return conflict(
      "Cambió el catálogo o la cantidad de movimientos. Volvé a revisar la vista previa.",
    );

  const { sourceId, targetId } = command;
  await client.query(
    `UPDATE finance.merchants
        SET merged_into = $3, archived_at = coalesce(archived_at, clock_timestamp()),
            version = version + CASE WHEN id = $2 THEN 1 ELSE 0 END
      WHERE owner_id = $1 AND (id = $2 OR merged_into = $2)`,
    [ownerId, sourceId, targetId],
  );
  const version = preview.target.version + 1;
  await client.query(
    "UPDATE finance.merchants SET version = $3 WHERE owner_id = $1 AND id = $2",
    [ownerId, targetId, version],
  );
  await recordCatalogChange(client, ownerId, command, targetId, version);
  return { status: "saved", id: targetId } as const;
}

// Corre dentro de la transacción de withGoogleOwner. Los comandos llevan
// idempotencia por envío; el alta por coincidencia normalizada nunca crea
// duplicados tipográficos ni reactiva entradas archivadas por su cuenta.
export async function saveCatalogCommand(
  client: pg.PoolClient,
  ownerId: string,
  command: CatalogCommand,
) {
  await lockCatalog(client, ownerId);
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

  if (command.action === "merge")
    return mergeMerchants(client, ownerId, command);

  if (command.action === "create") {
    const normalized = normalizeName(command.name);
    const existing = await findCatalogName(
      client,
      ownerId,
      command.kind,
      normalized,
    );
    if (existing?.archived)
      return conflict(
        "Ese nombre está archivado. Restauralo desde el catálogo para volver a usarlo.",
      );
    const id =
      existing?.id ??
      (await insertCatalogName(
        client,
        ownerId,
        command.kind,
        command.name,
        normalized,
      ));
    await recordCatalogChange(
      client,
      ownerId,
      command,
      id,
      existing?.version ?? 1,
    );
    return { status: "created", id } as const;
  }

  const id = command.entryId;
  const {
    rows: [current],
  } = await client.query<{ version: number; archived: boolean }>(
    `SELECT version, (archived_at IS NOT NULL) AS archived FROM ${table}
      WHERE owner_id = $1 AND id = $2 ${command.kind === "merchant" ? "AND merged_into IS NULL" : ""}`,
    [ownerId, id],
  );
  if (!current) return { status: "not-found" } as const;
  if (current.version !== command.version)
    return conflict(
      "El catálogo cambió. Actualizá la página y revisá su estado.",
    );
  if (current.archived === (command.action === "archive")) {
    await recordCatalogChange(client, ownerId, command, id, current.version);
    return { status: "saved", id } as const;
  }
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
       (owner_id, idempotency_key, command_hash, kind, entry_id, action, version, merged_source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ownerId,
      command.idempotencyKey,
      createHash("sha256").update(JSON.stringify(command)).digest("hex"),
      command.kind,
      entryId,
      command.action,
      version,
      command.action === "merge" ? command.sourceId : null,
    ],
  );
}
