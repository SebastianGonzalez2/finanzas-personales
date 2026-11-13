"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// F6-03 (RF-051/052, CA-065): aviso de conexión para lectores de pantalla y
// pantalla. Es solo informativo: no persiste datos ni reintenta por su cuenta.
// Usa aria-live sin el rol «status» para no duplicar los estados de cada página.

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const online = () => navigator.onLine;
const serverOnline = () => true;

export function ConnectionStatus() {
  const connected = useSyncExternalStore(subscribe, online, serverOnline);
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!connected) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    const show = setTimeout(() => setRestored(true), 0);
    const hide = setTimeout(() => setRestored(false), 6000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [connected]);

  const message = !connected
    ? "Sin conexión. Los cambios no se guardan hasta que vuelva la conexión; lo que escribiste sigue en pantalla."
    : restored
      ? "Conexión restablecida. Si un guardado quedó sin confirmar, reintentá el mismo envío."
      : "";

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      data-connection={connected ? "online" : "offline"}
      className={
        message
          ? "fixed inset-x-0 bottom-0 z-40 border-t border-amber-400 bg-(--finance-well) px-4 py-3 text-center text-sm text-amber-200"
          : "sr-only"
      }
    >
      {message}
    </div>
  );
}
