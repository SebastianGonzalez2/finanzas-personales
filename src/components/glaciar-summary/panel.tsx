import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/icon";

export function Panel({
  title,
  icon,
  action,
  className = "",
  children,
  id,
}: {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const headingId =
    id ?? `panel-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className={`lab-panel ${className}`}>
      <header className="lab-panel__head">
        <h2 id={headingId} className="lab-panel__title">
          {icon && (
            <span className="lab-panel__icon">
              <Icon name={icon} className="size-4.5" />
            </span>
          )}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PanelLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="lab-link">
      {children}
      <Icon name="chevronRight" duotone={false} className="size-3.5" />
    </Link>
  );
}
