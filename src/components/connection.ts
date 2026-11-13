"use client";

// F6-03 (RF-051, CA-065): la app es solo en línea. Estas utilidades solo
// informan el estado de la red en la interfaz; no guardan nada, no ponen
// operaciones en cola y no cambian las llaves de idempotencia.

export const offlineSaveMessage =
  "Sin conexión: no pudimos confirmar el guardado. Tus datos siguen en el formulario; cuando vuelva la conexión, reintentá el mismo envío.";

export function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/** Mensaje de fallo de red: específico si el navegador informa que no hay conexión. */
export function connectionAwareMessage(fallback: string) {
  return isOffline() ? offlineSaveMessage : fallback;
}

/**
 * Sin conexión, `router.refresh()` puede degradar a una recarga completa y
 * perder el formulario en memoria (hallazgo CA-065 de F6-01). Solo refresca
 * cuando hay red.
 */
export function refreshIfOnline(refresh: () => void) {
  if (!isOffline()) refresh();
}
