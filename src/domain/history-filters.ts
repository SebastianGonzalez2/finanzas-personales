import { movementDisplayMethods, movementUuid } from "./movements.ts";
import {
  historyKinds,
  historyPeriods,
  historyStates,
  parseHistoryParams,
  type HistoryFilters,
} from "./history.ts";
import { bankCurrencies } from "./bank-balances.ts";

export const savedFilterNameLimit = 100;

// Coincidencia sin mayúsculas, acentos ni espacios redundantes; la ñ se
// conserva porque diferencia identidades reales (mismo criterio del catálogo).
export function normalizeFilterName(value: string) {
  return value
    .normalize("NFC")
    .replace(/\uE000/gu, "")
    .replace(/ñ/giu, "\uE000")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\uE000/g, "ñ");
}

export type SavedFilter = {
  id: string;
  name: string;
  version: number;
  criteria: HistoryFilters;
};

export type SavedFilterCommand = { idempotencyKey: string } & (
  | { action: "create"; name: string; criteria: HistoryFilters }
  | { action: "rename"; entryId: string; version: number; name: string }
  | { action: "delete"; entryId: string; version: number }
);

// Solo criterios con valor; el cursor de paginación nunca se guarda.
export function savedFilterCriteria(input: HistoryFilters): HistoryFilters {
  const criteria: HistoryFilters = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value && key !== "before")
      criteria[key as keyof HistoryFilters] = value;
  }
  return criteria;
}

function parseCriteria(input: unknown): HistoryFilters | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const criteria = savedFilterCriteria(input as HistoryFilters);
  // Un filtro guardado sin criterios no filtra nada: no tiene utilidad.
  if (!Object.values(criteria).some(Boolean)) return null;
  const parsed = parseHistoryParams(criteria);
  if ("error" in parsed) return null;
  return criteria;
}

const keys = {
  create: ["name", "criteria"],
  rename: ["entryId", "version", "name"],
  delete: ["entryId", "version"],
} as const;

const isId = (value: unknown): value is string =>
  typeof value === "string" && movementUuid.test(value);
const isVersion = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 2147483647;

export function parseSavedFilterCommand(
  input: unknown,
): SavedFilterCommand | { error: string } {
  const invalid = { error: "Revisá los datos del filtro guardado." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const { action, idempotencyKey } = input as Record<string, unknown>;
  if (action !== "create" && action !== "rename" && action !== "delete")
    return invalid;
  if (
    Object.keys(input).some(
      (key) => !["action", "idempotencyKey", ...keys[action]].includes(key),
    ) ||
    typeof idempotencyKey !== "string" ||
    !movementUuid.test(idempotencyKey)
  )
    return invalid;
  const commandKey = idempotencyKey.toLowerCase();

  const parseName = (value: unknown): string | null => {
    if (typeof value !== "string" || value.includes("\0")) return null;
    const name = value.trim();
    if (
      !name ||
      name.length > savedFilterNameLimit ||
      !normalizeFilterName(name)
    )
      return null;
    return name;
  };

  if (action === "create") {
    const name = parseName((input as Record<string, unknown>).name);
    const criteria = parseCriteria((input as Record<string, unknown>).criteria);
    if (!name || !criteria) return invalid;
    return { action, name, criteria, idempotencyKey: commandKey };
  }

  const { entryId, version } = input as Record<string, unknown>;
  if (!isId(entryId) || !isVersion(version)) return invalid;
  if (action === "delete")
    return {
      action,
      entryId: entryId.toLowerCase(),
      version,
      idempotencyKey: commandKey,
    };
  const name = parseName((input as Record<string, unknown>).name);
  if (!name) return invalid;
  return {
    action,
    entryId: entryId.toLowerCase(),
    version,
    name,
    idempotencyKey: commandKey,
  };
}

// Criterios que ya no existen en los catálogos (categoría archivada o
// eliminada): el filtro sigue disponible pero se marca para revisión (v9.47).
export function savedFilterNeedsReview(
  criteria: HistoryFilters,
  categories: { id: string }[],
) {
  return Boolean(
    (criteria.category &&
      criteria.category !== "none" &&
      !categories.some(({ id }) => id === criteria.category)) ||
    (criteria.kind && !Object.hasOwn(historyKinds, criteria.kind)) ||
    (criteria.currency &&
      !bankCurrencies.some((code) => code === criteria.currency)) ||
    (criteria.method &&
      !Object.hasOwn(movementDisplayMethods, criteria.method)) ||
    (criteria.status && !Object.hasOwn(historyStates, criteria.status)) ||
    (criteria.period && !Object.hasOwn(historyPeriods, criteria.period)),
  );
}
