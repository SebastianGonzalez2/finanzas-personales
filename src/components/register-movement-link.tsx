"use client";

import { useEffect, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/icon";

// UI-02 — Acceso global «Registrar movimiento». No registra nada por sí mismo:
// abre el formulario existente de Resumen («Nueva transacción», F1-03), que
// conserva todas sus validaciones e idempotencia. Desde otra pantalla navega a
// Resumen con `?registrar=1` y el formulario se abre al llegar.

const formTrigger = 'button[aria-controls="nueva-transaccion"]';
const requestParam = "registrar";
const target = `/resumen?${requestParam}=1`;

/** Abre (o enfoca) el formulario si está en la página. */
function openMovementForm() {
  const trigger = document.querySelector<HTMLButtonElement>(formTrigger);
  if (!trigger) return false;
  if (trigger.getAttribute("aria-expanded") === "true") {
    const heading = document.getElementById("titulo-transaccion");
    (heading ?? trigger).focus();
    (heading ?? trigger).scrollIntoView({ block: "start" });
    return true;
  }
  trigger.click();
  // Si el formulario no puede abrirse ahora (envío en curso o confirmación
  // pendiente), el foco queda en su botón para que se vea el motivo.
  requestAnimationFrame(() => {
    if (trigger.getAttribute("aria-expanded") !== "true") {
      trigger.focus();
      trigger.scrollIntoView({ block: "center" });
    }
  });
  return true;
}

export function RegisterMovementLink({
  className,
  compact = false,
  handleRequest = false,
}: {
  className: string;
  /** Solo icono (barra móvil); el nombre accesible se mantiene. */
  compact?: boolean;
  /** Atiende `?registrar=1` al llegar a Resumen (una sola instancia). */
  handleRequest?: boolean;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!handleRequest || pathname !== "/resumen") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(requestParam) !== "1") return;
    url.searchParams.delete(requestParam);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    const frame = requestAnimationFrame(() => {
      if (!openMovementForm())
        document.getElementById("titulo-pagina")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [handleRequest, pathname]);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (pathname === "/resumen" && openMovementForm()) event.preventDefault();
  }

  return (
    <a
      href={target}
      className={className}
      onClick={onClick}
      aria-label={compact ? "Registrar movimiento" : undefined}
      data-tour="registrar"
    >
      <Icon name="plus" duotone={false} className={compact ? "" : "size-4"} />
      {!compact && (
        <>
          <span className="hidden sm:inline">Registrar movimiento</span>
          <span className="sr-only sm:hidden">Registrar movimiento</span>
        </>
      )}
    </a>
  );
}
