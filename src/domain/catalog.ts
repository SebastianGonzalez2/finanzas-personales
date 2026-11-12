import { movementUuid as uuid } from "./movements.ts";
import {
  catalogNameLimit,
  parseOptionalCatalogName,
  personNameLimit,
} from "./catalog-names.ts";
export {
  catalogNameLimit,
  normalizeName,
  personNameLimit,
} from "./catalog-names.ts";

export const catalogKinds = {
  merchant: "Comercio",
  person: "Persona",
} as const;
export type CatalogKind = keyof typeof catalogKinds;

export type CatalogEntry = {
  id: string;
  kind: CatalogKind;
  name: string;
  version: number;
  archived: boolean;
};

export type CatalogCommand = { idempotencyKey: string } & (
  | { action: "create"; kind: CatalogKind; name: string }
  | {
      action: "archive" | "restore";
      kind: CatalogKind;
      entryId: string;
      version: number;
    }
  | ({
      action: "merge";
      kind: "merchant";
      sourceVersion: number;
      targetVersion: number;
      movementCount: number;
    } & MerchantPair)
);

export type MerchantPair = { sourceId: string; targetId: string };
export type MerchantMergePreview = {
  source: CatalogEntry;
  target: CatalogEntry;
  movementCount: number;
};

type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;
export type CatalogCommandInput = DistributiveOmit<
  CatalogCommand,
  "idempotencyKey"
>;

const keys = {
  create: ["kind", "name"],
  archive: ["kind", "entryId", "version"],
  restore: ["kind", "entryId", "version"],
  merge: [
    "kind",
    "sourceId",
    "targetId",
    "sourceVersion",
    "targetVersion",
    "movementCount",
  ],
};

const isCatalogKind = (value: unknown): value is CatalogKind =>
  value === "merchant" || value === "person";

const isId = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
const isVersion = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 2147483647;

export function parseMerchantPair(
  sourceId: unknown,
  targetId: unknown,
): MerchantPair | null {
  if (
    !isId(sourceId) ||
    !isId(targetId) ||
    sourceId.toLowerCase() === targetId.toLowerCase()
  )
    return null;
  return { sourceId: sourceId.toLowerCase(), targetId: targetId.toLowerCase() };
}

export function parseCatalogCommand(
  input: unknown,
): CatalogCommand | { error: string } {
  const invalid = { error: "Revisá los datos del catálogo." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const { action, kind, name, entryId, version, idempotencyKey } =
    input as Record<string, unknown>;
  if (
    (action !== "create" &&
      action !== "archive" &&
      action !== "restore" &&
      action !== "merge") ||
    !isCatalogKind(kind)
  )
    return invalid;
  if (
    Object.keys(input).some(
      (key) => !["action", "idempotencyKey", ...keys[action]].includes(key),
    ) ||
    typeof idempotencyKey !== "string" ||
    !uuid.test(idempotencyKey)
  )
    return invalid;
  const commandKey = idempotencyKey.toLowerCase();
  if (action === "create") {
    try {
      const parsed = parseOptionalCatalogName(
        name,
        kind === "person" ? personNameLimit : catalogNameLimit,
      );
      if (!parsed) return invalid;
      return { action, kind, name: parsed, idempotencyKey: commandKey };
    } catch {
      return invalid;
    }
  }
  if (action === "merge") {
    const { sourceId, targetId, sourceVersion, targetVersion, movementCount } =
      input as Record<string, unknown>;
    const pair = parseMerchantPair(sourceId, targetId);
    if (
      kind !== "merchant" ||
      !pair ||
      !isVersion(sourceVersion) ||
      !isVersion(targetVersion) ||
      typeof movementCount !== "number" ||
      !Number.isSafeInteger(movementCount) ||
      movementCount < 0
    )
      return invalid;
    return {
      action,
      kind,
      ...pair,
      sourceVersion,
      targetVersion,
      movementCount,
      idempotencyKey: commandKey,
    };
  }
  if (!isId(entryId) || !isVersion(version)) return invalid;
  return {
    action,
    kind,
    entryId: entryId.toLowerCase(),
    version,
    idempotencyKey: commandKey,
  };
}
