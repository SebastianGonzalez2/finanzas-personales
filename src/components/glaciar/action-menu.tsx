"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

// UI-05A · P-04 — Menú «Más acciones». `<details>` nativo: Escape y clic
// afuera lo cierran (el foco vuelve al disparador) y elegir un ítem lo cierra
// antes de ejecutar la acción, que recibe el `summary` como disparador.
export type ActionMenuItem = {
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onSelect: (trigger: HTMLElement) => void;
};

const interactive =
  "a[href],button,input,select,textarea,summary,label,[tabindex]:not([tabindex='-1']),[contenteditable='true'],[role='button'],[role='menuitem']";

export function ActionMenu({
  label,
  items,
  variant = "card",
}: {
  label: string;
  items: ActionMenuItem[];
  variant?: "card" | "panel";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  // El `<details>` se abre de forma nativa y su evento `toggle` llega en una
  // tarea posterior: si los listeners dependieran del estado de React, un
  // Escape o clic afuera en ese intervalo se perdería con el menú visible.
  // Por eso se registran una vez y deciden según el estado real del DOM.
  useEffect(() => {
    const close = () => {
      const details = root.current;
      if (!details?.open) return false;
      details.open = false;
      setOpen(false);
      return true;
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!root.current?.open || root.current.contains(target as Node)) return;
      close();
      // Clic en otro control: el foco es suyo. En una zona sin control (aunque
      // el navegador enfoque un contenedor con tabindex -1) vuelve al
      // disparador una vez resuelto el foco propio del clic.
      if (target?.closest?.(interactive)) return;
      // `click` llega tras mousedown/mouseup, cuando el foco del clic ya se resolvió.
      document.addEventListener("click", () => summary.current?.focus(), {
        once: true,
        capture: true,
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !close()) return;
      summary.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details
      ref={root}
      className={`gs-menu ${variant === "panel" ? "gs-menu--panel" : ""}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={summary} aria-label={label}>
        <Icon name="more" duotone={false} className="size-4" />
      </summary>
      <div className="gs-menu__list">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-label={item.ariaLabel}
            disabled={item.disabled}
            onClick={() => {
              if (root.current) root.current.open = false;
              setOpen(false);
              if (summary.current) item.onSelect(summary.current);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
