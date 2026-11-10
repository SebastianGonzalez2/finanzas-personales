import { bankCurrencies } from "./bank-balances.ts";
import type { Currency } from "./money.ts";
import { movementUuid as uuid } from "./movements.ts";

export const fundStatuses = {
  active: "Activo",
  paused_manual: "Pausado",
  paused_target_reached: "Meta alcanzada · Aportes automáticos pausados",
  closed: "Cerrado",
} as const;
export type FundStatus = keyof typeof fundStatuses;
export type EditableFundStatus = "active" | "paused_manual";

export type SavingsFund = {
  id: string;
  name: string;
  currency: Currency;
  reservedAmount: string;
  targetAmount: string | null;
  targetDate: string | null;
  status: FundStatus;
  version: number;
};

type FundTarget = { fundId: string; version: number };
export type FundCommand = { idempotencyKey: string } & (
  | { action: "create"; name: string; currency: Currency }
  | ({
      action: "update";
      name: string;
      status: EditableFundStatus;
    } & FundTarget)
);

const editableStatuses: EditableFundStatus[] = ["active", "paused_manual"];
const keys = {
  create: ["name", "currency"],
  update: ["fundId", "version", "name", "status"],
};

export function parseFundCommand(
  input: unknown,
): FundCommand | { error: string } {
  const invalid = { error: "Revisá los datos del fondo." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const { action, fundId, version, name, currency, status, idempotencyKey } =
    input as Record<string, unknown>;
  if (action !== "create" && action !== "update") return invalid;
  if (
    Object.keys(input).some(
      (key) => !["action", "idempotencyKey", ...keys[action]].includes(key),
    ) ||
    typeof idempotencyKey !== "string" ||
    !uuid.test(idempotencyKey)
  )
    return invalid;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    name.includes("\0")
  )
    return { error: "Indicá un nombre de hasta 100 caracteres." };
  const commandKey = idempotencyKey.toLowerCase();

  if (action === "create") {
    const code = bankCurrencies.find((item) => item === currency);
    if (!code) return { error: "Elegí UYU, USD o EUR para el fondo." };
    return {
      action,
      name: name.trim(),
      currency: code,
      idempotencyKey: commandKey,
    };
  }

  if (
    typeof fundId !== "string" ||
    !uuid.test(fundId) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > 2147483647
  )
    return invalid;
  if (!editableStatuses.includes(status as EditableFundStatus))
    return { error: "Solo podés activar o pausar un fondo desde el catálogo." };
  return {
    action,
    fundId: fundId.toLowerCase(),
    version,
    name: name.trim(),
    status: status as EditableFundStatus,
    idempotencyKey: commandKey,
  };
}
