import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

// UI-02 — Panel de vidrio. Niveles (guía §3): `hero` = vidrio 1 (saldo
// destacado), `default` = vidrio 2 (paneles), `dense` = vidrio 3 (tablas y
// formularios). `feature` agrega el brillo del acento en la esquina.
export type PanelLevel = "hero" | "default" | "dense" | "feature";

export function Panel({
  level = "default",
  title,
  icon,
  action,
  headingLevel = 2,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  level?: PanelLevel;
  title?: React.ReactNode;
  icon?: IconName;
  action?: React.ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section
      data-slot="panel"
      className={cn(
        "ui-panel",
        level !== "default" && `ui-panel--${level}`,
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="ui-panel__head">
          {title && (
            <Heading className="ui-panel__title">
              {icon && (
                <span className="ui-panel__icon" aria-hidden="true">
                  <Icon name={icon} className="size-4" />
                </span>
              )}
              {title}
            </Heading>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
