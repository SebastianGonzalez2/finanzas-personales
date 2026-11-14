import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

// UI-02 — Etiquetas de estado. Nunca solo color: icono + texto (guía §3).
export type TagTone = "neutral" | "good" | "warning" | "critical";

const toneIcon: Record<TagTone, IconName | null> = {
  neutral: null,
  good: "check",
  warning: "alert",
  critical: "alert",
};

export function Tag({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: TagTone; icon?: IconName | null }) {
  const name = icon === undefined ? toneIcon[tone] : icon;
  return (
    <span className={cn("ui-tag", `ui-tag--${tone}`, className)} {...props}>
      {name && <Icon name={name} duotone={false} className="size-3" />}
      {children}
    </span>
  );
}
