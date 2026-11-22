// F4-05: RF-037/038; CA-049. Avisos internos por vencimientos CIERTOS
// registrados en la aplicación (§11.1, v9.36, v9.44). Reglas irrenunciables:
// - Sin fecha conocida no hay aviso de vencimiento: nunca se inventa una.
// - Un aviso por obligación (período recurrente): antirruido, sin
//   duplicados diarios; resolver o confirmar el pago cierra o actualiza.
// - Los avisos no mueven dinero ni declaran mora: informan según registros.
import {
  formatBankAmount,
  formatBankReference,
  isBankReferenceDate,
} from "./bank-balances.ts";
import type { Currency } from "./money.ts";
import {
  isRecurrenceDate,
  periodIsPending,
  type RecurrencePeriodStatus,
} from "./recurrences.ts";

/** Antelación predeterminada confirmada: 3 días calendario (v9.9/v9.36/v9.44). */
export const defaultNoticeLeadDays = 3;

export type DueNoticeState = "upcoming" | "due-today" | "unconfirmed-past";

export type DueNoticeWindow = {
  dueOn: string;
  /** Días desde hoy hasta la fecha registrada; negativo si ya pasó. */
  daysUntil: number;
  state: DueNoticeState;
};

/** Ventana de aviso para una fecha cierta. `null` si falta la fecha o aún no entra en la antelación configurada. */
export function dueNoticeWindow({
  today,
  dueOn,
  leadDays = defaultNoticeLeadDays,
}: {
  today: string;
  dueOn: string | null;
  leadDays?: number | null;
}): DueNoticeWindow | null {
  if (!isRecurrenceDate(today)) throw new Error("Fecha de consulta inválida.");
  const lead =
    leadDays === null || leadDays === undefined
      ? defaultNoticeLeadDays
      : leadDays;
  if (
    !Number.isInteger(lead) ||
    lead < 0 ||
    lead > 365 ||
    !dueOn ||
    !isBankReferenceDate(dueOn, "9999-12-31")
  )
    return null;
  const daysUntil = Math.round(
    (Date.parse(dueOn) - Date.parse(today)) / 86_400_000,
  );
  if (daysUntil > lead) return null;
  return {
    dueOn,
    daysUntil,
    state:
      daysUntil === 0
        ? "due-today"
        : daysUntil > 0
          ? "upcoming"
          : "unconfirmed-past",
  };
}

/** Texto temporal del aviso: nunca afirma atraso ni mora bancaria. */
export function dueNoticeTimingText(window: DueNoticeWindow): string {
  const date = formatBankReference(window.dueOn);
  switch (window.state) {
    case "upcoming":
      return window.daysUntil === 1
        ? `Vence mañana, ${date}, según la fecha registrada`
        : `Vence el ${date}, en ${window.daysUntil} días, según la fecha registrada`;
    case "due-today":
      return `Vence hoy, ${date}, según la fecha registrada`;
    case "unconfirmed-past":
      return `La fecha registrada (${date}) ya pasó y seguimos sin confirmar el pago en la aplicación`;
  }
}

export type DueNoticeLevel = "warning";

export type DueNotice = {
  key: string;
  kind: "recurrence";
  title: string;
  currency: string;
  dueOn: string;
  timing: string;
  amount: string | null;
  level: DueNoticeLevel;
  href: string;
  linkLabel: string;
};

const pendingStatus = (status: RecurrencePeriodStatus) =>
  periodIsPending(status);
export type RecurrenceDueNoticeInput = {
  seriesId: string;
  concept: string;
  currency: Currency;
  index: number;
  key: string;
  dueOn: string | null;
  status: RecurrencePeriodStatus;
  referenceAmount: string | null;
  remaining: string | null;
  today: string;
  leadDays?: number;
};

/**
 * Aviso de un período recurrente con fecha cierta pendiente (v9.36).
 * Requiere fecha conocida y pago sin confirmar; `null` en cualquier otro caso.
 */
export function recurrenceDueNotice(
  input: RecurrenceDueNoticeInput,
): DueNotice | null {
  const window = dueNoticeWindow({
    today: input.today,
    dueOn: input.dueOn,
    leadDays: input.leadDays,
  });
  if (!window || !pendingStatus(input.status)) return null;
  const amount =
    input.status === "partial" ? input.remaining : input.referenceAmount;
  return {
    key: `recurrence:${input.seriesId}:${input.index}`,
    kind: "recurrence",
    title: `${input.concept} · ${input.currency}`,
    currency: input.currency,
    dueOn: window.dueOn,
    timing: dueNoticeTimingText(window),
    amount:
      amount && amount !== "0.0000"
        ? `Importe ${input.status === "partial" ? "pendiente" : "de referencia"}: ${formatBankAmount({ amount, currency: input.currency })}`
        : null,
    level: "warning",
    href: `/recurrentes?serie=${encodeURIComponent(input.seriesId)}`,
    linkLabel: "Ver recurrentes",
  };
}
