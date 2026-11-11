// F4-03 (RF-035/CA-047): pausa y reactivación explícita de una serie.
// Validación pura; la persistencia, los permisos y la titularidad corresponden
// al servidor. Pausar no modifica períodos ni historial.

import { movementUuid } from "./movements.ts";
import { isRecurrenceDate, isRecurrenceDay } from "./recurrences.ts";

export type RecurrencePauseAction = "pause" | "resume";

export type RecurrencePauseCommand = {
  seriesId: string;
  idempotencyKey: string;
  action: RecurrencePauseAction;
};

const allowed = new Set(["seriesId", "idempotencyKey", "action"]);

export type RecurrenceSeriesCommand =
  | RecurrencePauseCommand
  | {
      seriesId: string;
      idempotencyKey: string;
      action: "due-day";
      dueDay: number;
      effectiveMonth: string;
      version: number;
    };

export function parseRecurrenceSeriesCommand(
  input: unknown,
): RecurrenceSeriesCommand | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Solicitud inválida." };
  const { action, dueDay, effectiveMonth, version, ...ids } = input as Record<
    string,
    unknown
  >;
  if (action !== "due-day") return parseRecurrencePause(input);
  const identity = parseRecurrencePause({ ...ids, action: "pause" });
  if ("error" in identity) return identity;
  if (
    !isRecurrenceDay(dueDay) ||
    typeof effectiveMonth !== "string" ||
    !isRecurrenceDate(`${effectiveMonth}-01`) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > 2_147_483_647
  )
    return { error: "Revisá el día de vencimiento y el mes de aplicación." };
  return { ...identity, action, dueDay, effectiveMonth, version };
}

export function parseRecurrencePause(
  input: unknown,
): RecurrencePauseCommand | { error: string } {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.has(key))
  )
    return { error: "Solicitud inválida." };
  const { seriesId, idempotencyKey, action } = input as Record<string, unknown>;
  if (
    typeof seriesId !== "string" ||
    !movementUuid.test(seriesId) ||
    typeof idempotencyKey !== "string" ||
    !movementUuid.test(idempotencyKey) ||
    (action !== "pause" && action !== "resume")
  )
    return { error: "Elegí una acción válida para la recurrencia." };
  return {
    seriesId: seriesId.toLowerCase(),
    idempotencyKey: idempotencyKey.toLowerCase(),
    action,
  };
}
