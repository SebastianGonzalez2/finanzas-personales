import { movementUuid } from "./movements.ts";

export const bulkHistoryKinds = ["income", "expense", "card_purchase"] as const;
type BulkHistoryKind = (typeof bulkHistoryKinds)[number];
type Entry = { id: string; kind: BulkHistoryKind; version: number };

export type BulkClassificationCommand = {
  entries: Entry[];
  idempotencyKey: string;
} & ({ categoryId: string } | { tagId: string });

export function isBulkHistoryKind(kind: unknown): kind is BulkHistoryKind {
  return bulkHistoryKinds.some((allowed) => allowed === kind);
}

function uuid(value: unknown) {
  return typeof value === "string" && movementUuid.test(value)
    ? value.toLowerCase()
    : null;
}

export function parseBulkClassification(input: unknown) {
  const invalid = { error: "Revisá los datos de la edición masiva." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const data = input as Record<string, unknown>;
  const { entries } = data;
  const idempotencyKey = uuid(data.idempotencyKey);
  const categoryId = uuid(data.categoryId);
  const tagId = uuid(data.tagId);
  if (
    !idempotencyKey ||
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > 20 ||
    Object.keys(data).length !== 3 ||
    (!categoryId && !tagId) ||
    (categoryId && tagId)
  )
    return invalid;

  const selected = new Map<string, Entry>();
  for (const row of entries) {
    if (!row || typeof row !== "object" || Object.keys(row).length !== 3)
      return invalid;
    const id = uuid(row.id);
    const { kind, version } = row;
    if (
      !id ||
      selected.has(id) ||
      !isBulkHistoryKind(kind) ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 0 ||
      version >= 2147483647
    )
      return invalid;
    selected.set(id, { id, kind, version });
  }
  const selection = {
    entries: [...selected.values()].sort((a, b) => a.id.localeCompare(b.id)),
    idempotencyKey,
  };
  if (categoryId) return { ...selection, categoryId };
  if (tagId) return { ...selection, tagId };
  return invalid;
}
