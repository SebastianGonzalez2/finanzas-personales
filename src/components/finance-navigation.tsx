import Link from "next/link";
import { Icon, type IconName } from "./ui/icon";

// SIMP-03 — Navegación de la aplicación dedicada a gastos. Los destinos
// retirados conservan su clave para que las páginas heredadas sigan
// compilando mientras SIMP-04 elimina el código, pero ya no se muestran.
// Solo presentación: no cambia rutas ni permisos. Sin hooks, para usarse en
// el riel (servidor) y en el cajón móvil (cliente).

export type Destination =
  | "resumen"
  | "historial"
  | "estadisticas"
  | "informes"
  | "presupuestos"
  | "recurrentes"
  | "categorias"
  | "etiquetas"
  | "catalogo"
  | "ayuda"
  | "account"
  | "avisos";

type NavItem = {
  key: Destination;
  href: string;
  label: string;
  icon: IconName;
};

export const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "General",
    items: [
      { key: "resumen", href: "/resumen", label: "Resumen", icon: "summary" },
      {
        key: "historial",
        href: "/historial",
        label: "Historial",
        icon: "history",
      },
      {
        key: "estadisticas",
        href: "/estadisticas",
        label: "Estadísticas",
        icon: "stats",
      },
      {
        key: "informes",
        href: "/informes",
        label: "Informes",
        icon: "reports",
      },
    ],
  },
  {
    title: "Control",
    items: [
      {
        key: "presupuestos",
        href: "/presupuestos",
        label: "Presupuestos",
        icon: "budgets",
      },
      {
        key: "recurrentes",
        href: "/recurrentes",
        label: "Recurrentes",
        icon: "recurring",
      },
    ],
  },
  {
    title: "Organización",
    items: [
      {
        key: "categorias",
        href: "/categorias",
        label: "Categorías",
        icon: "categories",
      },
      {
        key: "etiquetas",
        href: "/etiquetas",
        label: "Etiquetas",
        icon: "tags",
      },
      {
        key: "catalogo",
        href: "/catalogo",
        label: "Comercios y contactos",
        icon: "merchants",
      },
    ],
  },
];

// SIMP-03: Avisos (presupuestos y recurrentes), Ayuda y Mi cuenta cierran la
// navegación.
export const footerItems: NavItem[] = [
  { key: "avisos", href: "/avisos", label: "Avisos", icon: "notices" },
  { key: "ayuda", href: "/ayuda", label: "Ayuda", icon: "help" },
  { key: "account", href: "/account", label: "Mi cuenta", icon: "account" },
];

export const destinationLabel = Object.fromEntries(
  [...navGroups.flatMap(({ items }) => items), ...footerItems].map(
    ({ key, label }) => [key, label],
  ),
) as Record<Destination, string>;

/** El ancla lleva el foco al título de la página de destino (CA-066). */
export const navHref = (href: string) => `${href}#titulo-pagina`;

function NavLink({
  item,
  current,
  onNavigate,
}: {
  item: NavItem;
  current: Destination;
  onNavigate?: () => void;
}) {
  return (
    // PERF-01: navegación del lado del cliente (sin recargar el documento, el
    // JavaScript ni el fondo). Las pantallas son dinámicas: sin prefetch.
    <Link
      href={navHref(item.href)}
      prefetch={false}
      aria-current={item.key === current ? "page" : undefined}
      className="finance-nav__item"
      onClick={onNavigate}
    >
      <span className="finance-nav__icon">
        <Icon name={item.icon} />
      </span>
      <span className="finance-nav__label">{item.label}</span>
    </Link>
  );
}

export function FinanceNavigation({
  current,
  onNavigate,
}: {
  current: Destination;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegación principal" className="finance-nav">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="finance-nav__heading">{group.title}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  item={item}
                  current={current}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="finance-nav__footer">
        {footerItems.map((item) => (
          <li key={item.key}>
            <NavLink item={item} current={current} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <p className="finance-brand">
      <span className="finance-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-5">
          <path
            d="M5 16.5c3-5.5 6-8.5 14-11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="5.5" cy="17" r="2.2" fill="currentColor" />
          <circle cx="18.5" cy="6" r="1.6" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="finance-brand__name">Finanzas</span>
        {subtitle && (
          <>
            {" "}
            <span className="finance-brand__sub">personales</span>
          </>
        )}
      </span>
    </p>
  );
}
