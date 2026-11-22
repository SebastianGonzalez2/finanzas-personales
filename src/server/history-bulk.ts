import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { classificationLimit } from "../domain/classification.ts";
import type { BulkClassificationCommand } from "../domain/history-bulk.ts";
import { lockOwnerWrites } from "./owner-lock.ts";
import {
  classificationTarget,
  insertClassification,
  readClassification,
} from "./classification.ts";
import { commandHash } from "./movements.ts";
import { rememberSchema, schemaKnown } from "./schema-ready.ts";

const conflict = (error: string) => ({ error, status: 409 }) as const;

export async function bulkClassificationReady(client: pg.PoolClient) {
  if (schemaKnown.has("bulkClassificationReady")) return true;
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.bulk_classification_changes') IS NOT NULL AS ready",
  );
  return rememberSchema("bulkClassificationReady", rows[0].ready);
}

export async function saveBulkClassification(
  client: pg.PoolClient,
  ownerId: string,
  command: BulkClassificationCommand,
): Promise<{ updated: number } | { error: string; status: 403 | 409 }> {
  const { entries, idempotencyKey } = command;
  const hash = commandHash(["bulk-classification-v1", JSON.stringify(command)]);
  // Shared with corrections, refunds and individual classification edits.
  await lockOwnerWrites(client, ownerId);
  const {
    rows: [receipt],
  } = await client.query<{ command_hash: string; updated: number }>(
    `SELECT command_hash, updated FROM finance.bulk_classification_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, idempotencyKey],
  );
  if (receipt)
    return receipt.command_hash === hash
      ? { updated: receipt.updated }
      : conflict("Este envío ya se usó con otros datos.");

  const categoryId = "categoryId" in command ? command.categoryId : null;
  const tagId = "tagId" in command ? command.tagId : null;
  if (categoryId) {
    // Same lock as F5-01 catalog edits. Keep bank → catalog lock order.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:categories:' || $1::text, 0))",
      [ownerId],
    );
    const {
      rows: [category],
    } = await client.query<{ kind: string }>(
      `SELECT c.kind FROM finance.categories c
        LEFT JOIN finance.categories p ON (p.owner_id, p.id) = (c.owner_id, c.parent_id)
        WHERE c.owner_id = $1 AND c.id = $2 AND c.archived_at IS NULL
          AND (c.parent_id IS NULL OR (p.id IS NOT NULL AND p.archived_at IS NULL))`,
      [ownerId, categoryId],
    );
    if (!category)
      return conflict("La categoría seleccionada ya no está disponible.");
    if (
      entries.some(
        ({ kind }) =>
          category.kind !== (kind === "income" ? "income" : "expense"),
      )
    )
      return conflict(
        "Elegí una categoría del mismo tipo que los movimientos seleccionados.",
      );
  } else {
    const activeTag = await client.query(
      "SELECT 1 FROM finance.tags WHERE owner_id = $1 AND id = $2 AND archived_at IS NULL",
      [ownerId, tagId],
    );
    if (!activeTag.rowCount)
      return conflict("La etiqueta seleccionada ya no está disponible.");
  }

  const updates = [];
  for (const { id, kind, version } of entries) {
    const target = await classificationTarget(client, ownerId, id);
    if (!target)
      return {
        error: "Hay movimientos que no están disponibles.",
        status: 403,
      } as const;
    if (target.kind !== kind || target.status !== "confirmed")
      return conflict(
        "Hay movimientos que cambiaron. Actualizá el historial y revisá la selección.",
      );

    const current = await readClassification(client, ownerId, id);
    if (current.version !== version)
      return conflict(
        "Una clasificación cambió. Actualizá el historial y revisá la selección.",
      );

    const { allocations, tagIds } = current;
    if (categoryId) {
      if (allocations.length > 1 || !target.amount)
        return conflict(
          "La selección incluye un movimiento que requiere revisar sus categorías en el detalle.",
        );
      if (allocations[0]?.categoryId === categoryId) continue;
      updates.push({
        id,
        version,
        allocations: [{ categoryId, amount: target.amount }],
        tagIds,
        allocatedTotal: target.amount,
      });
    } else if (tagId && !tagIds.includes(tagId)) {
      if (tagIds.length >= classificationLimit)
        return conflict("Un movimiento ya tiene el máximo de etiquetas.");
      updates.push({
        id,
        version,
        allocations,
        tagIds: [...tagIds, tagId],
        allocatedTotal: current.allocatedTotal,
      });
    }
  }

  for (const { id, version, ...snapshot } of updates) {
    const changeId = randomUUID();
    await insertClassification(
      client,
      ownerId,
      id,
      version + 1,
      changeId,
      hash,
      snapshot,
    );
    await client.query(
      `INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type)
       VALUES ($1, $2, $3, 'classification_bulk')`,
      [ownerId, changeId, id],
    );
  }
  await client.query(
    `INSERT INTO finance.bulk_classification_changes (owner_id, idempotency_key, command_hash, updated)
     VALUES ($1, $2, $3, $4)`,
    [ownerId, idempotencyKey, hash, updates.length],
  );
  return { updated: updates.length };
}
