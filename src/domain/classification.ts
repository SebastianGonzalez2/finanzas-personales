import { normalizeDecimalAmount } from "./money.ts";
import { movementUuid } from "./movements.ts";

export type CategoryAllocation = { categoryId: string | null; amount: string };
export type ClassificationInput = {
  allocations?: CategoryAllocation[];
  tagIds?: string[];
};
export type ClassificationCommand = ClassificationInput & {
  eventId: string;
  idempotencyKey: string;
  version: number;
};
export type MovementTag = {
  id: string;
  name: string;
  archived: boolean;
  version: number;
};
export type TagCommand =
  | { action: "create"; id: string; name: string }
  | { action: "rename"; id: string; name: string; version: number }
  | { action: "archive" | "restore"; id: string; version: number };

export const classificationLimit = 20;
export const allocationError =
  "Asigná importes positivos a categorías distintas. La suma debe coincidir con el total.";
const invalid = { error: "Solicitud de clasificación inválida." };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function uuid(value: unknown) {
  return typeof value === "string" && movementUuid.test(value)
    ? value.toLowerCase()
    : null;
}

function version(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 2147483647
  );
}

function allocationUnits(amount: unknown) {
  const normalized = normalizeDecimalAmount(
    typeof amount === "string" ? amount.trim().replace(",", ".") : amount,
  );
  return BigInt(normalized.replace(".", ""));
}

export function allocationSumMatches(
  allocations: CategoryAllocation[],
  amount: string,
) {
  return (
    allocations.reduce(
      (sum, row) => sum + allocationUnits(row.amount),
      BigInt(0),
    ) === allocationUnits(amount)
  );
}

export function parseClassification(input: {
  allocations?: unknown;
  tagIds?: unknown;
}): ClassificationInput | { error: string } {
  const parsed: ClassificationInput = {};
  if (input.allocations !== undefined) {
    if (
      !Array.isArray(input.allocations) ||
      input.allocations.length > classificationLimit
    )
      return { error: allocationError };
    try {
      const allocations = input.allocations.map((row: unknown) => {
        if (
          !object(row) ||
          Object.keys(row).some(
            (key) => key !== "categoryId" && key !== "amount",
          )
        )
          throw new Error();
        const categoryId =
          row.categoryId === null ? null : uuid(row.categoryId);
        if (categoryId === null && row.categoryId !== null) throw new Error();
        const amount = normalizeDecimalAmount(
          typeof row.amount === "string"
            ? row.amount.trim().replace(",", ".")
            : row.amount,
        );
        if (allocationUnits(amount) <= BigInt(0)) throw new Error();
        return { categoryId, amount };
      });
      if (
        new Set(allocations.map(({ categoryId }) => categoryId)).size !==
        allocations.length
      )
        return { error: allocationError };
      parsed.allocations = allocations;
    } catch {
      return { error: allocationError };
    }
  }
  if (input.tagIds !== undefined) {
    if (
      !Array.isArray(input.tagIds) ||
      input.tagIds.length > classificationLimit
    )
      return { error: "Elegí hasta 20 etiquetas válidas." };
    const ids = input.tagIds.map(uuid);
    if (ids.some((id) => id === null))
      return { error: "Elegí etiquetas válidas." };
    parsed.tagIds = [...new Set(ids as string[])].sort();
  }
  return parsed;
}

export function parseClassificationCommand(
  input: unknown,
): ClassificationCommand | { error: string } {
  if (
    !object(input) ||
    Object.keys(input).some(
      (key) =>
        ![
          "eventId",
          "idempotencyKey",
          "version",
          "allocations",
          "tagIds",
        ].includes(key),
    )
  )
    return invalid;
  const eventId = uuid(input.eventId);
  const idempotencyKey = uuid(input.idempotencyKey);
  if (!eventId || !idempotencyKey || !version(input.version)) return invalid;
  const fields = parseClassification(input);
  if ("error" in fields) return fields;
  if (!Object.keys(fields).length) return invalid;
  return { eventId, idempotencyKey, version: input.version, ...fields };
}

export function parseTagCommand(
  input: unknown,
): TagCommand | { error: string } {
  if (!object(input)) return invalid;
  const { action, version: currentVersion } = input;
  const keys =
    action === "create"
      ? ["action", "idempotencyKey", "name"]
      : ["action", "idempotencyKey", "id", "version", "name"];
  if (
    Object.keys(input).some((key) => !keys.includes(key)) ||
    !uuid(input.idempotencyKey)
  )
    return invalid;
  const id = uuid(action === "create" ? input.idempotencyKey : input.id);
  if (!id) return invalid;
  if (action === "create" || action === "rename") {
    const name =
      typeof input.name === "string"
        ? input.name.normalize("NFC").trim().replace(/\s+/g, " ")
        : "";
    if (!name || name.length > 60 || /\p{Cc}/u.test(name))
      return { error: "Ingresá un nombre de etiqueta de hasta 60 caracteres." };
    if (action === "create") return { action, id, name };
    if (version(currentVersion))
      return { action, id, name, version: currentVersion };
  }
  if ((action === "archive" || action === "restore") && version(currentVersion))
    return { action, id, version: currentVersion };
  return invalid;
}

export function classificationHashFields(input: ClassificationInput) {
  return input.allocations?.length || input.tagIds?.length
    ? [
        "classification-v1",
        JSON.stringify([input.allocations ?? [], input.tagIds ?? []]),
      ]
    : [];
}
