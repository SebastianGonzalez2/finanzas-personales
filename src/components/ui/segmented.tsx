import * as React from "react";
import { cn } from "@/lib/utils";

// UI-02 — Control segmentado: grupo con nombre y botones `aria-pressed`.
// El estado y los efectos los decide quien lo usa (sin lógica propia).

export function Segmented({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("ui-segment", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SegmentedOption({
  pressed,
  pending,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { pressed: boolean; pending?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      data-pending={pending ? "true" : undefined}
      className={cn("ui-segment__option", className)}
      {...props}
    />
  );
}
