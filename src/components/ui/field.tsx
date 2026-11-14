import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

// UI-02 — Campos Glaciar: etiqueta visible asociada, 44 px de alto y foco con
// halo del acento. Los estilos viven en globals.css (`.ui-field`, `.ui-control`).

export function Field({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("ui-field", className)}>
      <span className="ui-field__label">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn("ui-control", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn("ui-control", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("ui-control", className)}
      {...props}
    />
  );
}

/** Buscador con icono; el nombre accesible llega por `aria-label` o etiqueta. */
export function SearchField({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span className={cn("ui-search", className)}>
      <Icon name="search" className="size-4" duotone={false} />
      <input type="search" data-slot="search" {...props} />
    </span>
  );
}
