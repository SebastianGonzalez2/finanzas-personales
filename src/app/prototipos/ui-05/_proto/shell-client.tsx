"use client";

import { useRef, useState } from "react";
import { Brand, type Destination } from "@/components/finance-navigation";
import { Icon } from "@/components/ui/icon";
import { Segmented, SegmentedOption } from "@/components/ui/segmented";
import { destinationHref } from "./screens";
import { ProtoNav } from "./nav";

// Selector de moneda del shell, sin efecto: solo estado en memoria.
export function ProtoCurrency() {
  const [shown, setShown] = useState("UYU");
  return (
    <div className="finance-currency">
      <Segmented
        label="Moneda de visualización"
        title="Moneda en la que se muestran los totales de la aplicación"
      >
        {["UYU", "USD", "EUR"].map((code) => (
          <SegmentedOption
            key={code}
            pressed={shown === code}
            onClick={() => setShown(code)}
          >
            {code}
          </SegmentedOption>
        ))}
      </Segmented>
    </div>
  );
}

// Misma barra flotante y cajón que `FinanceMobileNav`, con destinos de prototipo.
export function ProtoMobileNav({ current }: { current: Destination }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => drawer.current?.close();
  const quick = [
    { key: "resumen", label: "Resumen", icon: "summary" },
    { key: "historial", label: "Historial", icon: "history" },
  ] as const;
  return (
    <>
      <nav aria-label="Accesos rápidos" className="finance-dock">
        {quick.map((item) => (
          <a
            key={item.key}
            href={destinationHref(item.key)}
            aria-current={current === item.key ? "page" : undefined}
            className="finance-dock__item"
          >
            <Icon name={item.icon} />
            <span className="sr-only">{item.label}</span>
          </a>
        ))}
        <button
          type="button"
          className="finance-dock__add"
          title="Sin efecto en el prototipo"
        >
          <Icon name="plus" duotone={false} />
          <span className="sr-only">Registrar movimiento</span>
        </button>
        <a
          href={destinationHref("estadisticas")}
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
          <ProtoNav current={current} />
        </div>
      </dialog>
    </>
  );
}
