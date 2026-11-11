// F4-01 (RF-033/CA-044): calendario puro de ingresos y gastos recurrentes.
// No crea movimientos ni efectos bancarios: solo define períodos y vencimientos.
// La persistencia, los permisos y la validación de solicitudes corresponden al servidor.

export const recurrenceFrequencies = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

/** La frecuencia mensual queda preseleccionada al crear una recurrencia (v9.43). */
export const defaultRecurrenceFrequency: RecurrenceFrequency = "monthly";

export type RecurrenceSchedule = {
  frequency: RecurrenceFrequency;
  /** Primer período explícito; no existen períodos anteriores a esta fecha (CA-044). */
  firstPeriod: string;
  /**
   * Día habitual 1–31 para frecuencias de calendario. Si se omite, se conserva
   * el día del primer período. `null` indica fecha aproximada/desconocida y no
   * se inventa un vencimiento exacto. En frecuencia semanal solo se usa `null`
   * para indicar que el día de inicio no es un vencimiento.
   */
  dueDay?: number | null;
  /** Último día inclusive en que puede existir un período. */
  endDate?: string | null;
};

export type RecurrencePeriod = {
  /** Posición desde el primer período, comenzando en cero. */
  index: number;
  /** Clave estable dentro de la serie; el día flexible no la modifica. */
  key: string;
  /** Inicio del período calendario; para semanal coincide con su fecha ancla. */
  startsOn: string;
  /** Vencimiento conocido o `null` si la fecha es aproximada (v9.37/v9.43). */
  dueOn: string | null;
};

export type RecurrenceLifecycle = "active" | "paused" | "finished";

export type RecurrencePeriodStatus =
  "expected" | "partial" | "completed" | "skipped";

const datePattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isRecurrenceFrequency(
  value: unknown,
): value is RecurrenceFrequency {
  return (
    typeof value === "string" &&
    (recurrenceFrequencies as readonly string[]).includes(value)
  );
}

export function daysInRecurrenceMonth(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new Error("El año y el mes deben ser válidos.");
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isRecurrenceDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length !== 10 ||
    !datePattern.test(value)
  )
    return false;
  const [year, month, day] = value.split("-").map(Number);
  return day <= daysInRecurrenceMonth(year, month);
}

export function isRecurrenceDay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 31
  );
}

export function isRecurrencePeriodStatus(
  value: unknown,
): value is RecurrencePeriodStatus {
  return (
    value === "expected" ||
    value === "partial" ||
    value === "completed" ||
    value === "skipped"
  );
}

export function isRecurrenceSchedule(
  value: unknown,
): value is RecurrenceSchedule {
  try {
    assertRecurrenceSchedule(value);
    return true;
  } catch {
    return false;
  }
}

function assertRecurrenceSchedule(
  schedule: unknown,
): asserts schedule is RecurrenceSchedule {
  if (!schedule || typeof schedule !== "object")
    throw new Error("La recurrencia debe ser un objeto válido.");
  const { frequency, firstPeriod, dueDay, endDate } = schedule as Record<
    string,
    unknown
  >;
  if (!isRecurrenceFrequency(frequency))
    throw new Error(
      "La frecuencia debe ser semanal, mensual, trimestral o anual.",
    );
  if (!isRecurrenceDate(firstPeriod))
    throw new Error("El primer período debe ser un día calendario válido.");
  if (dueDay !== undefined && dueDay !== null && !isRecurrenceDay(dueDay))
    throw new Error("El día habitual debe estar entre 1 y 31.");
  if (endDate !== undefined && endDate !== null && !isRecurrenceDate(endDate))
    throw new Error("La fecha final debe ser un día calendario válido.");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(year: number, month: number, day: number) {
  if (year < 1 || year > 9999)
    throw new Error("La fecha supera el rango de programación.");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function addCalendarDays(date: string, days: number) {
  if (!isRecurrenceDate(date))
    throw new Error("La fecha debe ser un día calendario válido.");
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, month - 1, day + days);
  return formatDate(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

function monthStep(frequency: RecurrenceFrequency) {
  return frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
}

function calendarPeriodAt(schedule: RecurrenceSchedule, offset: number) {
  const [firstYear, firstMonth, firstDay] = schedule.firstPeriod
    .split("-")
    .map(Number);
  const step = monthStep(schedule.frequency);
  const monthIndex = firstYear * 12 + (firstMonth - 1) + offset * step;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  if (year < 1 || year > 9999)
    throw new Error("La fecha supera el rango de programación.");

  const preferredDay =
    schedule.dueDay === undefined ? firstDay : schedule.dueDay;
  const dueOn =
    preferredDay === null
      ? null
      : offset === 0
        ? schedule.firstPeriod
        : formatDate(
            year,
            month,
            Math.min(preferredDay, daysInRecurrenceMonth(year, month)),
          );

  const startsOn =
    schedule.frequency === "monthly"
      ? formatDate(year, month, 1)
      : schedule.frequency === "quarterly"
        ? formatDate(year, Math.floor((month - 1) / 3) * 3 + 1, 1)
        : formatDate(year, 1, 1);

  const calendarYear = startsOn.slice(0, 4);
  const key =
    schedule.frequency === "monthly"
      ? `${calendarYear}-${pad(month)}`
      : schedule.frequency === "quarterly"
        ? `${calendarYear}-Q${Math.floor((month - 1) / 3) + 1}`
        : calendarYear;

  return { index: offset, key, startsOn, dueOn };
}

/**
 * Período de una recurrencia. El primer período usa exactamente la fecha
 * configurada como comienzo; los siguientes conservan el día habitual aunque
 * un mes sea más corto (por ejemplo, enero 31 → febrero 28 → marzo 31).
 */
export function recurrencePeriodAt(
  schedule: RecurrenceSchedule,
  offset: number,
): RecurrencePeriod {
  assertRecurrenceSchedule(schedule);
  if (!Number.isInteger(offset) || offset < 0)
    throw new Error("La posición del período debe ser un entero no negativo.");

  if (schedule.frequency === "weekly") {
    const startsOn = addCalendarDays(schedule.firstPeriod, offset * 7);
    return {
      index: offset,
      key: startsOn,
      startsOn,
      dueOn: schedule.dueDay === null ? null : startsOn,
    };
  }

  return calendarPeriodAt(schedule, offset);
}

export function recurrencePeriodKeyAt(
  schedule: RecurrenceSchedule,
  offset: number,
) {
  return recurrencePeriodAt(schedule, offset).key;
}

export function recurrencePeriodDueDate(
  schedule: RecurrenceSchedule,
  offset: number,
) {
  return recurrencePeriodAt(schedule, offset).dueOn;
}

function periodBoundary(
  schedule: RecurrenceSchedule,
  period: RecurrencePeriod,
) {
  return (
    period.dueOn ??
    (period.index === 0 ? schedule.firstPeriod : period.startsOn)
  );
}

/** Último período previsto a la fecha, sin recorrer la historia de la serie. */
export function latestRecurrencePeriod(
  schedule: RecurrenceSchedule,
  through: string,
) {
  assertRecurrenceSchedule(schedule);
  if (!isRecurrenceDate(through))
    throw new Error("Fecha de consulta inválida.");
  const lastDay =
    schedule.endDate && schedule.endDate < through ? schedule.endDate : through;
  if (lastDay < schedule.firstPeriod) return null;

  const first = recurrencePeriodAt(schedule, 0);
  const anchor = first.dueOn ?? first.startsOn;
  const index =
    schedule.frequency === "weekly"
      ? Math.floor(
          (Date.parse(lastDay) - Date.parse(anchor)) / (7 * 86_400_000),
        )
      : Math.floor(
          (monthIndex(lastDay) - monthIndex(anchor)) /
            monthStep(schedule.frequency),
        );
  const period = recurrencePeriodAt(schedule, index);
  return periodBoundary(schedule, period) <= lastDay
    ? period
    : recurrencePeriodAt(schedule, index - 1);
}

function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

/**
 * Períodos existentes hasta una fecha inclusive, sin generar nada antes del
 * primer período ni después de la fecha final. La fecha final nunca elimina
 * períodos anteriores ya creados en la persistencia.
 */
export function recurrencePeriods(
  schedule: RecurrenceSchedule,
  through: string,
  limit = 1000,
): RecurrencePeriod[] {
  assertRecurrenceSchedule(schedule);
  if (!isRecurrenceDate(through))
    throw new Error("La fecha de consulta debe ser un día calendario válido.");
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error("El límite de períodos debe ser un entero no negativo.");

  const periods: RecurrencePeriod[] = [];
  const endDate = schedule.endDate ?? null;
  for (let index = 0; index < limit; index += 1) {
    const period = recurrencePeriodAt(schedule, index);
    const boundary = periodBoundary(schedule, period);
    if (boundary > through) break;
    if (endDate !== null && boundary > endDate) break;
    periods.push(period);
  }
  return periods;
}

/** Una recurrencia finaliza al superar su fecha final; el día de fin todavía existe. */
export function recurrenceIsFinished(
  endDate: string | null | undefined,
  today: string,
) {
  if (!isRecurrenceDate(today))
    throw new Error(
      "La fecha de referencia debe ser un día calendario válido.",
    );
  if (endDate === null || endDate === undefined) return false;
  if (!isRecurrenceDate(endDate))
    throw new Error("La fecha final debe ser un día calendario válido.");
  return today > endDate;
}

export function recurrenceLifecycle(
  recurrence: { paused: boolean; endDate?: string | null },
  today: string,
): RecurrenceLifecycle {
  if (recurrenceIsFinished(recurrence.endDate, today)) return "finished";
  return recurrence.paused ? "paused" : "active";
}

/** Un período pendiente todavía admite confirmación manual de pago o cobro. */
export function periodIsPending(status: RecurrencePeriodStatus) {
  return status === "expected" || status === "partial";
}

/** Un período resuelto no vuelve a descontar ni sumar dinero automáticamente. */
export function periodIsSettled(status: RecurrencePeriodStatus) {
  return status === "completed" || status === "skipped";
}
