"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brand,
  FinanceNavigation,
  navHref,
  type Destination,
} from "./finance-navigation";
import { RegisterMovementLink } from "./register-movement-link";
import { Icon } from "./ui/icon";

// UI-02 — Barra flotante inferior (móvil): Resumen, Historial, Registrar,
// Estadísticas y Menú. El menú abre la navegación completa en un <dialog>
// modal: foco atrapado y Escape nativos, clic en el fondo cierra y el foco
// vuelve al botón (CA-066).
export function FinanceMobileNav({ current }: { current: Destination }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => drawer.current?.close();

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    function closeOnDesktop() {
      const dialog = drawer.current;
      if (!desktop.matches || !dialog?.open) return;

      const focusedLink = dialog.contains(document.activeElement)
        ? document.activeElement?.getAttribute("href")
        : null;
      dialog.close();

      // En escritorio el riel lateral queda fijo: el foco pasa al enlace
      // equivalente o, si no había uno, a la página actual.
      const sidebarLinks =
        document.querySelectorAll<HTMLElement>(".finance-sidebar a");
      const equivalent = Array.from(sidebarLinks).find(
        (link) => link.getAttribute("href") === focusedLink,
      );
      (
        equivalent ??
        document.querySelector<HTMLElement>(
          '.finance-sidebar [aria-current="page"]',
        )
      )?.focus();
    }

    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const quick = [
    { key: "resumen", href: "/resumen", label: "Resumen", icon: "summary" },
    {
      key: "historial",
      href: "/historial",
      label: "Historial",
      icon: "history",
    },
  ] as const;

  return (
    <>
      <nav aria-label="Accesos rápidos" className="finance-dock">
        {quick.map((item) => (
          <a
            key={item.key}
            href={navHref(item.href)}
            aria-current={current === item.key ? "page" : undefined}
            className="finance-dock__item"
          >
            <Icon name={item.icon} />
            <span className="sr-only">{item.label}</span>
          </a>
        ))}
        <RegisterMovementLink className="finance-dock__add" compact />
        <a
          href={navHref("/estadisticas")}
          aria-current={current === "estadisticas" ? "page" : undefined}
          className="finance-dock__item"
        >
          <Icon name="stats" />
          <span className="sr-only">Estadísticas</span>
        </a>
        <button
          type="button"
          className="ui-icon-btn"
          aria-label="Abrir navegación"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            drawer.current?.showModal();
            setOpen(true);
          }}
        >
          <Icon name="menu" duotone={false} />
        </button>
      </nav>

      <dialog
        ref={drawer}
        aria-label="Navegación"
        className="finance-drawer"
        onClose={() => setOpen(false)}
        // Clic en el fondo (el propio <dialog>): cierra y devuelve el foco.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="finance-drawer__inner">
          <div className="flex items-center justify-between gap-3">
            <Brand />
            <button
              type="button"
              className="ui-icon-btn"
              aria-label="Cerrar navegación"
              onClick={close}
            >
              <Icon name="close" duotone={false} />
            </button>
          </div>
          <FinanceNavigation current={current} onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}
