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
  "a[href],button,input,select,textarea,summary,label,[tabindex],[contenteditable='true'],[role='button'],[role='menuitem']";

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

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (root.current?.contains(target as Node)) return;
      setOpen(false);
      // Clic en otro control: el foco es suyo. Solo se restaura al disparador
      // si se pulsó una zona sin control y el foco quedó en el documento.
      if (target?.closest?.(interactive)) return;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (
          !active ||
          active === document.body ||
          active === document.documentElement
        )
          summary.current?.focus();
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      summary.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
