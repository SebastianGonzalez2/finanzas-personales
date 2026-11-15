"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

// UI-05 · M-01 — Botón «?» con popover compacto. Se abre al pulsar y se cierra
// al pulsar fuera, al volver a pulsarlo o con Escape (devolviendo el foco al
// botón). Solo presentación: no altera importes ni cálculos.
export function HelpPopover({
  label,
  children,
}: {
  /** Nombre accesible del botón, p. ej. «Ayuda: Disponible libre · UYU». */
  label: string;
  children: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="ui05-help">
      <button
        ref={button}
        type="button"
        className="ui05-help__btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="help" duotone={false} className="size-3.5" />
      </button>
      {open && (
        <span id={id} role="note" className="ui05-help__pop">
          {children}
        </span>
      )}
    </span>
  );
}
