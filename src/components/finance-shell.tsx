"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FinanceIcon } from "./finance-icon";

const destinations = {
  resumen: { href: "/resumen", label: "Resumen", icon: "summary" },
  historial: { href: "/historial", label: "Historial", icon: "calendar" },
  estadisticas: {
    href: "/estadisticas",
    label: "Estadísticas",
    icon: "chart",
  },
  recurrentes: { href: "/recurrentes", label: "Recurrentes", icon: "calendar" },
  presupuestos: {
    href: "/presupuestos",
    label: "Presupuestos",
    icon: "wallet",
  },
  categorias: {
    href: "/categorias",
    label: "Categorías",
    icon: "savings",
  },
  tarjetas: { href: "/tarjetas", label: "Tarjetas", icon: "card" },
  catalogo: {
    href: "/catalogo",
    label: "Comercios y contactos",
    icon: "store",
  },
  fondos: { href: "/fondos", label: "Fondos de ahorro", icon: "savings" },
  avisos: { href: "/avisos", label: "Avisos", icon: "bell" },
  deudas: { href: "/deudas", label: "Deudas y préstamos", icon: "finance" },
  informes: { href: "/informes", label: "Informes", icon: "report" },
  account: { href: "/account", label: "Mi cuenta", icon: "account" },
} as const;

type Destination = keyof typeof destinations;

function FinanceNavigation({
  current,
  onNavigate,
}: {
  current: Destination;
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className="flex flex-1 flex-col gap-6"
    >
      {Object.entries(destinations).map(([key, destination]) => (
        <a
          key={key}
          href={`${destination.href}#titulo-pagina`}
          aria-current={key === current ? "page" : undefined}
          className="finance-nav-link last:mt-auto"
          onClick={onNavigate}
        >
          <FinanceIcon name={destination.icon} />
          {destination.label}
        </a>
      ))}
    </nav>
  );
}

export function FinanceShell({
  current,
  children,
}: {
  current: Destination;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const closeDrawer = () => drawer.current?.close();

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    function closeOnDesktop() {
      const dialog = drawer.current;
      if (!desktop.matches || !dialog?.open) return;

      const focusedLink = dialog.contains(document.activeElement)
        ? document.activeElement?.getAttribute("href")
        : null;
      dialog.close();

      const sidebarLinks = sidebar.current?.querySelectorAll("a");
      const equivalent = Array.from(sidebarLinks ?? []).find(
        (link) => link.getAttribute("href") === focusedLink,
      );
      (
        equivalent ??
        sidebar.current?.querySelector<HTMLElement>('[aria-current="page"]')
      )?.focus();
    }

    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="finance-shell">
      <aside ref={sidebar} className="finance-sidebar">
        <p className="flex min-h-11 items-center gap-3 font-semibold">
          <FinanceIcon name="finance" className="text-ring" />
          Finanzas personales
        </p>
        <FinanceNavigation current={current} />
      </aside>

      <dialog
        ref={drawer}
        aria-labelledby="titulo-navegacion"
        className="finance-drawer"
      >
        <div className="flex min-h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="titulo-navegacion" className="text-lg font-semibold">
              Navegación
            </h2>
            <button
              type="button"
              className="finance-icon-button"
              aria-label="Cerrar navegación"
              onClick={closeDrawer}
            >
              <FinanceIcon name="close" />
            </button>
          </div>
          <FinanceNavigation current={current} onNavigate={closeDrawer} />
        </div>
      </dialog>

      <div className="min-w-0">
        <header className="border-b">
          <div className="finance-content flex min-h-16 items-center gap-3">
            <button
              type="button"
              className="finance-icon-button lg:hidden"
              aria-label="Abrir navegación"
              aria-haspopup="dialog"
              onClick={() => drawer.current?.showModal()}
            >
              <FinanceIcon name="menu" />
            </button>
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="hidden items-center gap-2 text-muted-foreground lg:flex">
                <FinanceIcon name="finance" />
                Finanzas
                <FinanceIcon name="chevron" className="size-4" />
              </span>
              {destinations[current].label}
            </p>
          </div>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="finance-content pt-5 pb-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
