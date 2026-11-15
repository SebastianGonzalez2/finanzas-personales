import {
  footerItems,
  navGroups,
  type Destination,
} from "@/components/finance-navigation";
import { Icon } from "@/components/ui/icon";
import { destinationHref } from "./screens";

// Mismo marcado que `FinanceNavigation` (UI-02) con destinos de prototipo.
// Sin hooks: se usa en el riel (servidor) y en el cajón móvil (cliente).
export function ProtoNav({
  current,
  onNavigateClass,
}: {
  current: Destination;
  onNavigateClass?: string;
}) {
  const link = (item: (typeof footerItems)[number]) => (
    <a
      href={destinationHref(item.key)}
      aria-current={item.key === current ? "page" : undefined}
      className={`finance-nav__item ${onNavigateClass ?? ""}`}
    >
      <span className="finance-nav__icon">
        <Icon name={item.icon} />
      </span>
      <span className="finance-nav__label">{item.label}</span>
    </a>
  );
  return (
    <nav aria-label="Navegación principal" className="finance-nav">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="finance-nav__heading">{group.title}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.key}>{link(item)}</li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="finance-nav__footer">
        {footerItems.map((item) => (
          <li key={item.key}>{link(item)}</li>
        ))}
      </ul>
    </nav>
  );
}
