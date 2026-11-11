// F4-03 (RF-035/CA-047): pausa y reactivación explícita de una serie.
// Validación pura; la persistencia, los permisos y la titularidad corresponden
// al servidor. Pausar no modifica períodos ni historial.

import { movementUuid } from "./movements.ts";

export type RecurrencePauseAction = "pause" | "resume";

export type RecurrencePauseCommand = {
  seriesId: string;
  idempotencyKey: string;
  action: RecurrencePauseAction;
};

const allowed = new Set(["seriesId", "idempotencyKey", "action"]);

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
