const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isContributionMonth(value: unknown): value is string {
  return typeof value === "string" && monthPattern.test(value);
}

export function isContributionDay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 31
  );
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const [year, month, day] = value.split("-");
  return Number(day) <= daysInContributionMonth(`${year}-${month}`);
}

export function daysInContributionMonth(month: string) {
  if (!isContributionMonth(month))
    throw new Error("El mes debe tener el formato AAAA-MM.");
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(monthNumber) ? 30 : 31;
}

/**
 * Día efectivo de la aportación: si el día elegido no existe en el mes,
 * se usa el último día calendario disponible sin modificar la preferencia.
 */
export function contributionDayInMonth(month: string, preferredDay: number) {
  if (!isContributionDay(preferredDay))
    throw new Error("El día de la aportación debe estar entre 1 y 31.");
  return Math.min(preferredDay, daysInContributionMonth(month));
}

export function contributionDate(month: string, preferredDay: number) {
  const day = contributionDayInMonth(month, preferredDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * Primera ejecución y reactivación: siempre el mes calendario siguiente a la
 * fecha de activación, aunque el día elegido todavía no haya llegado.
 */
export function contributionMonthAfter(date: string) {
  if (!isCalendarDate(date))
    throw new Error("La fecha debe ser un día calendario válido AAAA-MM-DD.");
  const [year, month] = date.split("-").map(Number);
  if (year === 9999 && month === 12)
    throw new Error("La fecha supera el rango de programación.");
  const index = year * 12 + month;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function firstContributionDate(
  activationDate: string,
  preferredDay: number,
) {
  return contributionDate(contributionMonthAfter(activationDate), preferredDay);
}

/**
 * Comparación pura de fechas AAAA-MM-DD: la aportación vence el día efectivo
 * y no se reintenta ni se adelanta por comparar varias veces.
 */
export function contributionIsDue(
  month: string,
  preferredDay: number,
  today: string,
) {
  if (!isCalendarDate(today))
    throw new Error(
      "La fecha de referencia debe ser un día calendario válido.",
    );
  return contributionDate(month, preferredDay) <= today;
}
