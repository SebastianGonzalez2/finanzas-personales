import { bankCurrencies } from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
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
export type FundMovement = {
  idempotencyKey: string;
  amount: string;
} & FundTarget &
  (
    | { action: "reserve" | "release" }
    | {
        action: "transfer";
        destinationFundId: string;
        destinationVersion: number;
      }
  );

export type FundAvailability = { currency: Currency; amount: string };

export type FundCommand =
  | FundMovement
  | ({ idempotencyKey: string } & (
      | { action: "create"; name: string; currency: Currency }
      | ({
          action: "update";
          name: string;
          status: EditableFundStatus;
        } & FundTarget)
    ));

const editableStatuses: EditableFundStatus[] = ["active", "paused_manual"];
const keys = {
  create: ["name", "currency"],
  update: ["fundId", "version", "name", "status"],
  reserve: ["fundId", "version", "amount"],
  release: ["fundId", "version", "amount"],
  transfer: [
    "fundId",
    "version",
    "amount",
    "destinationFundId",
    "destinationVersion",
  ],
};

function fundVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 2147483647
  );
}

export function parseFundAmount(input: unknown) {
  try {
    const amount = normalizeDecimalAmount(
      typeof input === "string" ? input.trim().replace(",", ".") : input,
    );
    if (amount !== "0.0000" && !amount.startsWith("-")) return amount;
  } catch {
    return null;
  }
  return null;
}

export function parseFundCommand(
  input: unknown,
): FundCommand | { error: string } {
  const invalid = { error: "Revisá los datos del fondo." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const {
    action,
    fundId,
    version,
    name,
    currency,
    status,
    idempotencyKey,
    amount,
    destinationFundId,
    destinationVersion,
  } = input as Record<string, unknown>;
  if (
    action !== "create" &&
    action !== "update" &&
    action !== "reserve" &&
    action !== "release" &&
    action !== "transfer"
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
  if (action !== "create" && action !== "update") {
    if (
      typeof fundId !== "string" ||
      !uuid.test(fundId) ||
      !fundVersion(version)
    )
      return invalid;
    const decimal = parseFundAmount(amount);
    if (!decimal)
      return {
        error: "Ingresá un importe positivo con hasta cuatro decimales.",
      };
    const movement = {
      fundId: fundId.toLowerCase(),
      version,
      amount: decimal,
      idempotencyKey: commandKey,
    };
    if (action !== "transfer") return { action, ...movement };
    if (
      typeof destinationFundId !== "string" ||
      !uuid.test(destinationFundId) ||
      !fundVersion(destinationVersion) ||
      destinationFundId.toLowerCase() === movement.fundId
    ) {
      return { error: "Elegí otro fondo como destino del traspaso." };
    }
    return {
      action,
      ...movement,
      destinationFundId: destinationFundId.toLowerCase(),
      destinationVersion,
    };
  }
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    name.includes("\0")
  )
    return { error: "Indicá un nombre de hasta 100 caracteres." };

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

  if (typeof fundId !== "string" || !uuid.test(fundId) || !fundVersion(version))
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
