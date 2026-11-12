export const catalogNameLimit = 100;
export const personNameLimit = 200;

// Coincidencia sin mayúsculas, acentos ni espacios redundantes (CA-054).
// La ñ se conserva: no es un acento y sí diferencia identidades reales. Se usa
// un marcador de uso privado, imposible en nombres reales, para blindarla.
export function normalizeName(value: string) {
  return value
    .normalize("NFC")
    .replace(/\uE000/gu, "")
    .replace(/ñ/giu, "\uE000")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\uE000/g, "ñ");
}

// undefined permite que los clientes anteriores omitan el campo; null
// representa un campo vacío enviado explícitamente.
export function parseOptionalCatalogName(
  value: unknown,
  max = catalogNameLimit,
) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.trim().length > max
  )
    throw new Error("Nombre inválido.");
  const name = value.trim();
  if (name && !normalizeName(name)) throw new Error("Nombre inválido.");
  return name || null;
}
