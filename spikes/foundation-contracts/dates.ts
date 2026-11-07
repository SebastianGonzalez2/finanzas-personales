/** Calendar dates keep their month when the browser/user changes time zone. */
export function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") {
    throw new Error("Fecha inválida");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Fecha inválida");
  }
  return value;
}

export function calendarPeriod(value: unknown): string {
  return calendarDate(value).slice(0, 7);
}

/** Audit instants use a separate, canonical UTC representation. */
export function utcInstant(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Instante UTC inválido");
  }
  calendarDate(value.slice(0, 10));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error("Instante UTC inválido");
  return value;
}
