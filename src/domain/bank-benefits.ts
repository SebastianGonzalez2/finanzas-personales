import {
  bankCurrencies,
  bankReferenceToday,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import { movementUuid } from "./movements.ts";
import { amountUnits } from "./refunds.ts";

// F5-09 etapa A · RF-053 / CA-067. Beneficio bancario sin compra asociada.
// Una devolución identificada de una compra usa el flujo de F2-09.
export const benefitConceptLimit = 120;
export const benefitNoteLimit = 500;
export const defaultBenefitConcept = "Beneficio bancario";
export const benefitMaxUnits = amountUnits("9999999999999999.9999");

export type BankBenefitDestination = "bank" | "card";

export type BankBenefitCommand = { idempotencyKey: string } & (
  | {
      action: "register";
      destination: BankBenefitDestination;
      cardId: string | null;
      currency: Currency;
      amount: string;
      effectiveOn: string;
      concept: string;
      note: string | null;
    }
  | { action: "void"; eventId: string }
);

export type BankBenefitEntry = {
  id: string;
  concept: string;
  note: string | null;
  effectiveOn: string;
  currency: Currency;
  amount: string;
  destination: BankBenefitDestination;
  status: "confirmed" | "voided" | "corrected";
  cardId: string | null;
  card: string | null;
  debtReduced: string;
  creditDelta: string;
};

const registerFields = [
  "action",
  "idempotencyKey",
  "destination",
  "cardId",
  "currency",
  "amount",
  "effectiveOn",
  "concept",
  "note",
  "credited",
];
const voidFields = ["action", "idempotencyKey", "eventId"];

function uuid(value: unknown) {
  if (typeof value !== "string" || !movementUuid.test(value)) throw new Error();
  return value.toLowerCase();
}

function text(value: unknown, limit: number) {
  if (value == null) return "";
  if (
    typeof value !== "string" ||
    value.length > limit ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new Error();
  return value.trim();
}

export function parseBankBenefitCommand(
  input: unknown,
  today = bankReferenceToday(),
): BankBenefitCommand | { error: string } {
  const invalid = {
    error:
      "Revisá el importe, la fecha y el destino. Solo se registra un beneficio ya acreditado.",
  };
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input))
      throw new Error();
    const data = input as Record<string, unknown>;
    const action = data.action;
    if (action !== "register" && action !== "void") throw new Error();
    const allowed = action === "void" ? voidFields : registerFields;
    if (Object.keys(data).some((key) => !allowed.includes(key)))
      throw new Error();
    const idempotencyKey = uuid(data.idempotencyKey);
    if (action === "void")
      return { action, idempotencyKey, eventId: uuid(data.eventId) };

    // Solo un beneficio efectivamente acreditado se anota: nada estimado ni
    // prometido. La confirmación explícita es parte del contrato.
    if (data.credited !== true) throw new Error();
    const destination = data.destination;
    if (destination !== "bank" && destination !== "card") throw new Error();
    if (destination === "bank" && data.cardId != null) throw new Error();
    const cardId = destination === "card" ? uuid(data.cardId) : null;
    const currency = bankCurrencies.find((code) => code === data.currency);
    if (!currency || !isBankReferenceDate(data.effectiveOn, today))
      throw new Error();
    const amount = normalizeDecimalAmount(
      typeof data.amount === "string"
        ? data.amount.trim().replace(",", ".")
        : data.amount,
    );
    if (
      amountUnits(amount) <= BigInt(0) ||
      amountUnits(amount) > benefitMaxUnits
    )
      throw new Error();
    const concept = text(data.concept, benefitConceptLimit);
    const note = text(data.note, benefitNoteLimit);
    return {
      action,
      idempotencyKey,
      destination,
      cardId,
      currency,
      amount,
      effectiveOn: data.effectiveOn,
      concept: concept || defaultBenefitConcept,
      note: note || null,
    };
  } catch {
    return invalid;
  }
}
