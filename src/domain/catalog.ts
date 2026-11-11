import { movementUuid as uuid } from "./movements.ts";

export const catalogKinds = {
  merchant: "Comercio",
  person: "Persona",
} as const;
export type CatalogKind = keyof typeof catalogKinds;
export const catalogNameLimit = 100;

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
);

type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;
export type CatalogCommandInput = DistributiveOmit<
  CatalogCommand,
  "idempotencyKey"
>;

// Coincidencia sin mayúsculas, acentos ni espacios redundantes (CA-054).
// La ñ se conserva: no es un acento y sí diferencia identidades reales. Se usa
// un marcador de uso privado, imposible en nombres reales, para blindarla.
export function normalizeName(value: string) {
  return value
    .replace(/\uE000/gu, "")
    .replace(/ñ/giu, "\uE000")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\uE000/g, "ñ");
}

const keys = {
  create: ["kind", "name"],
  archive: ["kind", "entryId", "version"],
  restore: ["kind", "entryId", "version"],
};

const isCatalogKind = (value: unknown): value is CatalogKind =>
  value === "merchant" || value === "person";

export function parseCatalogCommand(
  input: unknown,
): CatalogCommand | { error: string } {
  const invalid = { error: "Revisá los datos del catálogo." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const { action, kind, name, entryId, version, idempotencyKey } =
    input as Record<string, unknown>;
  if (
    (action !== "create" && action !== "archive" && action !== "restore") ||
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
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > catalogNameLimit ||
      name.includes("\0")
    )
      return invalid;
    return {
      action,
      kind,
      name: name.trim(),
      idempotencyKey: commandKey,
    };
  }
  if (
    typeof entryId !== "string" ||
    !uuid.test(entryId) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > 2147483647
  )
    return invalid;
  return {
    action,
    kind,
    entryId: entryId.toLowerCase(),
    version,
    idempotencyKey: commandKey,
  };
}
