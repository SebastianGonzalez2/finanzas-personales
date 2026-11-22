"use client";

import { useEffect } from "react";

// CA-066: el enlace del menú termina en `#titulo-pagina` para llevar el foco al
// título de la página de destino. Con la navegación del lado del cliente
// (PERF-01) el navegador ya no hace ese salto al cargar el documento: se hace
// aquí al montarse la página nueva.
export function RouteFocus() {
  useEffect(() => {
    if (window.location.hash !== "#titulo-pagina") return;
    const title = document.getElementById("titulo-pagina");
    if (title && document.activeElement !== title) title.focus();
  }, []);
  return null;
}
