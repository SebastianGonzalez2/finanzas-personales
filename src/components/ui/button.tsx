import * as React from "react";
import { cn } from "@/lib/utils";

// UI-02 — Botones Glaciar (`.ui-btn` en globals.css). `buttonClass` sirve para
// enlaces con aspecto de botón sin duplicar estilos.
export type ButtonVariant = "primary" | "outline" | "ghost" | "glass";

export function buttonClass(
  variant: ButtonVariant = "outline",
  className?: string,
) {
  return cn("ui-btn", `ui-btn--${variant}`, className);
}

export function Button({
  variant = "outline",
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      data-slot="button"
      className={buttonClass(variant, className)}
      {...props}
    />
  );
}

/** Botón solo con icono: requiere nombre accesible (`aria-label`). */
export function IconButton({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { "aria-label": string }) {
  return (
    <button
      type={type}
      data-slot="icon-button"
      className={cn("ui-icon-btn", className)}
      {...props}
    />
  );
}
