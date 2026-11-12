import "server-only";
import type pg from "pg";
import {
  allocationError,
  allocationSumMatches,
  type CategoryAllocation,
  type ClassificationCommand,
  type ClassificationInput,
  type MovementTag,
  type TagCommand,
} from "../domain/classification.ts";
import type { MovementKind } from "../domain/movements.ts";
import { lockBankWrites } from "./bank-balances.ts";
import { commandHash, resolveMovementCategory } from "./movements.ts";
import { hasLinkedRefund } from "./refund-schema.ts";

type CommandResult = { id: string } | { error: string; status: number };
type Snapshot = {
  version: number;
  allocations: (CategoryAllocation & { category: string | null })[];
  tagIds: string[];
};
type Target = {
  kind: string;
  status: string;
  amount: string | null;
};

export const emptyClassification: Snapshot = {
  version: 0,
  allocations: [],
  tagIds: [],
};

export async function classificationReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.current_classifications') IS NOT NULL AS ready",
  );
  return row.ready;
}

export async function listTags(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<MovementTag>(
    `SELECT id,name,version,archived_at IS NOT NULL AS archived
       FROM finance.tags WHERE owner_id=$1 ORDER BY archived_at IS NOT NULL, name, id`,
    [ownerId],
  );
  return rows;
}

export async function saveTag(
  client: pg.PoolClient,
  ownerId: string,
  command: TagCommand,
): Promise<CommandResult> {
  await lockBankWrites(client, ownerId);
  const tags = await listTags(client, ownerId);
  const current = tags.find(({ id }) => id === command.id);
  if (command.action === "create" && current)
    return current.name === command.name
      ? { id: current.id }
      : { error: "Este envío ya se usó.", status: 409 };
  if (command.action !== "create") {
    if (!current) return { error: "Etiqueta no disponible.", status: 404 };
    if (current.version !== command.version)
      return { error: "La etiqueta cambió. Actualizá la página.", status: 409 };
  }
  if ("name" in command) {
    const duplicate = await client.query(
      "SELECT 1 FROM finance.tags WHERE owner_id=$1 AND id<>$2 AND name_key=lower($3)",
      [ownerId, command.id, command.name],
    );
    if (duplicate.rowCount)
      return { error: "Ya existe una etiqueta con ese nombre.", status: 409 };
  }
  if (command.action === "create") {
    await client.query(
      "INSERT INTO finance.tags(owner_id,id,name) VALUES ($1,$2,$3)",
      [ownerId, command.id, command.name],
    );
  } else if (command.action === "rename") {
    await client.query(
      "UPDATE finance.tags SET name=$3,version=version+1 WHERE owner_id=$1 AND id=$2",
      [ownerId, command.id, command.name],
    );
  } else {
    await client.query(
      "UPDATE finance.tags SET archived_at=CASE WHEN $3 THEN coalesce(archived_at,clock_timestamp()) END,version=version+1 WHERE owner_id=$1 AND id=$2",
      [ownerId, command.id, command.action === "archive"],
    );
  }
  return { id: command.id };
}

export async function readClassification(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
): Promise<Snapshot> {
  return (
    (await listClassificationVersions(client, ownerId, eventId, 1))[0] ??
    emptyClassification
  );
}

export async function listClassificationVersions(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  limit = 10,
) {
  const { rows } = await client.query<Snapshot & { recordedOn: string }>(
    `SELECT x.version, to_char(x.recorded_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD') AS "recordedOn",
       coalesce((SELECT jsonb_agg(jsonb_build_object('categoryId',a.category_id,'amount',a.amount::text,'category',c.name) ORDER BY a.position)
          FROM finance.movement_allocations a LEFT JOIN finance.categories c ON (c.owner_id,c.id)=(a.owner_id,a.category_id)
         WHERE (a.owner_id,a.event_id,a.version)=(x.owner_id,x.event_id,x.version)), '[]') AS allocations,
       ARRAY(SELECT t.tag_id FROM finance.event_tags t
         WHERE (t.owner_id,t.event_id,t.version)=(x.owner_id,x.event_id,x.version) ORDER BY t.tag_id) AS "tagIds"
       FROM finance.classification_changes x WHERE owner_id=$1 AND event_id=$2 ORDER BY version DESC LIMIT $3`,
    [ownerId, eventId, limit],
  );
  return rows;
}

export async function classificationTarget(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const {
    rows: [row],
  } = await client.query<Target>(
    `SELECT f.kind,f.status,coalesce(abs(i.amount_signed),b.amount)::text AS amount
       FROM finance.financial_events f
       LEFT JOIN finance.ordinary_movements m ON (m.owner_id,m.event_id)=(f.owner_id,f.id) AND f.kind='income'
       LEFT JOIN finance.bank_effects i ON (i.owner_id,i.event_id,i.id)=(m.owner_id,m.event_id,m.event_id)
       LEFT JOIN LATERAL (
         SELECT amount FROM finance.budget_expenses_base b
          WHERE (b.owner_id,b.event_id)=(f.owner_id,f.id)
            AND f.kind IN ('expense','card_purchase')
            AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases x WHERE (x.owner_id,x.event_id)=(f.owner_id,f.id))
            AND NOT EXISTS (SELECT 1 FROM finance.current_installment_plans p WHERE (p.owner_id,p.event_id)=(f.owner_id,f.id))
       ) b ON true
      WHERE f.owner_id=$1 AND f.id=$2`,
    [ownerId, eventId],
  );
  return row;
}

// Callers hold the owner write lock and pass the amount of the actual event.
export async function prepareClassification(
  client: pg.PoolClient,
  ownerId: string,
  input: ClassificationInput,
  amount: string | null,
  kind: MovementKind,
  previous = emptyClassification,
): Promise<
  | { error: string }
  | {
      allocations: CategoryAllocation[];
      tagIds: string[];
      allocatedTotal: string | null;
    }
> {
  const proposed = input.allocations ?? previous.allocations;
  const tagIds = input.tagIds ?? previous.tagIds;
  if (
    proposed.length &&
    (amount === null || !allocationSumMatches(proposed, amount))
  )
    return { error: allocationError };

  if (tagIds.length) {
    const { rowCount } = await client.query(
      "SELECT id FROM finance.tags WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND (archived_at IS NULL OR id=ANY($3::uuid[]))",
      [ownerId, tagIds, previous.tagIds],
    );
    if (rowCount !== tagIds.length)
      return { error: "Hay etiquetas que ya no están disponibles." };
  }
  const allocations: CategoryAllocation[] = [];
  await client.query("SAVEPOINT resolve_allocations");
  for (const { categoryId, amount } of proposed) {
    const resolved = previous.allocations.some(
      (part) => part.categoryId === categoryId,
    )
      ? categoryId
      : await resolveMovementCategory(client, ownerId, kind, categoryId);
    if (
      resolved === undefined ||
      allocations.some((part) => part.categoryId === resolved)
    ) {
      await client.query("ROLLBACK TO SAVEPOINT resolve_allocations");
      await client.query("RELEASE SAVEPOINT resolve_allocations");
      return {
        error: "Elegí categorías distintas y disponibles para este movimiento.",
      };
    }
    allocations.push({ categoryId: resolved, amount });
  }
  await client.query("RELEASE SAVEPOINT resolve_allocations");
  return {
    allocations,
    tagIds,
    allocatedTotal: allocations.length ? amount : null,
  };
}

type Prepared = Exclude<
  Awaited<ReturnType<typeof prepareClassification>>,
  { error: string }
>;

export async function insertClassification(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  version: number,
  idempotencyKey: string,
  hash: string,
  { allocations, tagIds, allocatedTotal }: Prepared,
) {
  await client.query(
    `INSERT INTO finance.classification_changes(owner_id,event_id,version,idempotency_key,command_hash,allocated_total)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [ownerId, eventId, version, idempotencyKey, hash, allocatedTotal],
  );
  if (allocations.length)
    await client.query(
      `INSERT INTO finance.movement_allocations(owner_id,event_id,version,category_id,amount,position)
       SELECT $1,$2,$3,category_id,amount,position FROM unnest($4::uuid[],$5::numeric[]) WITH ORDINALITY AS p(category_id,amount,position)`,
      [
        ownerId,
        eventId,
        version,
        allocations.map(({ categoryId }) => categoryId),
        allocations.map(({ amount }) => amount),
      ],
    );
  if (tagIds.length)
    await client.query(
      "INSERT INTO finance.event_tags(owner_id,event_id,version,tag_id) SELECT $1,$2,$3,unnest($4::uuid[])",
      [ownerId, eventId, version, tagIds],
    );
}

export async function saveClassification(
  client: pg.PoolClient,
  ownerId: string,
  command: ClassificationCommand,
): Promise<CommandResult> {
  const { eventId, idempotencyKey, version, allocations } = command;
  const hash = commandHash(["edit-classification-v1", JSON.stringify(command)]);
  await lockBankWrites(client, ownerId);
  const {
    rows: [receipt],
  } = await client.query<{ hash: string }>(
    "SELECT command_hash AS hash FROM finance.classification_changes WHERE owner_id=$1 AND idempotency_key=$2",
    [ownerId, idempotencyKey],
  );
  if (receipt)
    return receipt.hash === hash
      ? { id: eventId }
      : { error: "Este envío ya se usó.", status: 409 };
  const target = await classificationTarget(client, ownerId, eventId);
  if (!target) return { error: "Movimiento no disponible.", status: 404 };
  if (target.status !== "confirmed")
    return { error: "El movimiento ya fue corregido o anulado.", status: 409 };
  const previous = await readClassification(client, ownerId, eventId);
  if (version !== previous.version)
    return {
      error: "La clasificación cambió. Actualizá la página.",
      status: 409,
    };
  if (
    allocations !== undefined &&
    (!target.amount || (await hasLinkedRefund(client, ownerId, eventId)))
  )
    return {
      error: "El desglose de este movimiento no se puede modificar desde aquí.",
      status: 409,
    };
  const prepared = await prepareClassification(
    client,
    ownerId,
    command,
    target.amount,
    target.kind === "income" ? "income" : "expense",
    previous,
  );
  if ("error" in prepared) return { error: prepared.error, status: 400 };
  await insertClassification(
    client,
    ownerId,
    eventId,
    version + 1,
    idempotencyKey,
    hash,
    prepared,
  );
  return { id: eventId };
}
