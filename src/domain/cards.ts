import { bankCurrencies } from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import { movementUuid as uuid } from "./movements.ts";

export const cardKinds = { debit: "Débito", credit: "Crédito" } as const;
export type CardKind = keyof typeof cardKinds;
type CardCurrency = { currency: Currency; limit: string | null };
type CardFields = {
  name: string;
  issuer: string | null;
  currencies: CardCurrency[];
};
type CardTarget = { cardId: string; version: number };
export type CardCommand = { idempotencyKey: string } & (
  | ({ action: "create"; kind: CardKind } & CardFields)
  | ({ action: "update" } & CardTarget & CardFields)
  | ({ action: "archive" } & CardTarget)
);
export type CatalogCard = Omit<CardFields, "currencies"> & {
  id: string;
  kind: CardKind;
  version: number;
  archived: boolean;
  currencies: (CardCurrency & {
    debt: string | null;
    creditBalance: string | null;
  })[];
};

const keys = {
  create: ["kind", "name", "issuer", "currencies"],
  update: ["cardId", "version", "name", "issuer", "currencies"],
  archive: ["cardId", "version"],
};

export function parseCardCommand(
  input: unknown,
): CardCommand | { error: string } {
  const invalid = { error: "Revisá los datos de la tarjeta." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const {
    action,
    kind,
    cardId,
    version,
    name,
    issuer,
    currencies,
    idempotencyKey,
  } = input as Record<string, unknown>;
  if (action !== "create" && action !== "update" && action !== "archive")
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
  let target: CardTarget | undefined;
  if (action !== "create") {
    if (
      typeof cardId !== "string" ||
      !uuid.test(cardId) ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      version > 2147483647
    )
      return invalid;
    target = { cardId: cardId.toLowerCase(), version };
    if (action === "archive")
      return { action, ...target, idempotencyKey: commandKey };
  }

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    name.includes("\0") ||
    (issuer != null &&
      (typeof issuer !== "string" ||
        issuer.trim().length > 100 ||
        issuer.includes("\0")))
  )
    return invalid;
  if (
    !Array.isArray(currencies) ||
    currencies.length < 1 ||
    currencies.length > bankCurrencies.length
  )
    return { error: "Elegí al menos una moneda para la tarjeta." };

  const positions = new Map<Currency, CardCurrency>();
  for (const row of currencies) {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      Object.keys(row).some((key) => key !== "currency" && key !== "limit")
    )
      return invalid;
    const currency = bankCurrencies.find((code) => code === row.currency);
    if (!currency || positions.has(currency)) return invalid;
    let limit: string | null = null;
    if (row.limit != null && row.limit !== "") {
      try {
        if (kind === "debit" || typeof row.limit !== "string")
          throw new Error();
        limit = normalizeDecimalAmount(row.limit.trim().replace(",", "."));
        if (limit === "0.0000" || limit.startsWith("-")) throw new Error();
      } catch {
        return {
          error:
            "Ingresá un límite positivo de hasta cuatro decimales para cada moneda que corresponda.",
        };
      }
    }
    positions.set(currency, { currency, limit });
  }
  const fields = {
    name: name.trim(),
    issuer: typeof issuer === "string" ? issuer.trim() || null : null,
    currencies: bankCurrencies.flatMap(
      (currency) => positions.get(currency) ?? [],
    ),
    idempotencyKey: commandKey,
  };
  if (action === "update" && target) return { action, ...target, ...fields };
  if (action === "create" && (kind === "credit" || kind === "debit"))
    return { action, kind, ...fields };
  return invalid;
}
