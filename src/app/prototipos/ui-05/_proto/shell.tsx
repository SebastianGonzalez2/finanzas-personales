import type { ReactNode } from "react";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand, type Destination } from "@/components/finance-navigation";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ProtoNav } from "./nav";
import { ProtoCurrency, ProtoMobileNav } from "./shell-client";
import {
  destinationHref,
  protoBase,
  protoHref,
  stateLabel,
  type ProtoScreen,
  type ProtoState,
} from "./screens";

// UI-05-DESIGN — Shell de los prototipos. Usa las mismas clases, el mismo
// fondo ambiental, la marca, los grupos del menú y los iconos del shell real
// (UI-02); solo cambian los destinos (apuntan a otros prototipos) y el
// selector de moneda y «Registrar movimiento» no tienen efecto.

function ProtoBar({
  screen,
  state,
}: {
  screen?: ProtoScreen;
  state?: ProtoState;
}) {
  return (
    <div className="ui05-protobar" role="note" aria-label="Aviso de prototipo">
      <span className="ui05-protobar__badge">
        <Icon name="sparkle" duotone={false} className="size-3.5" />
        Prototipo UI-05 · Datos ficticios
      </span>
      {screen && (
        <nav
          aria-label="Estados del prototipo"
          className="ui05-protobar__states"
        >
          {screen.states.map((item) => (
            <a
              key={item}
              href={protoHref(screen.key, item)}
              aria-current={item === state ? "true" : undefined}
              className="ui05-protobar__state"
            >
              {stateLabel[item]}
            </a>
          ))}
        </nav>
      )}
      <a href={protoBase} className="ui05-protobar__index">
        Índice
        <Icon name="chevronRight" duotone={false} className="size-3.5" />
      </a>
    </div>
  );
}

export function ProtoShell({
  current,
  screen,
  state,
  children,
}: {
  current: Destination;
  screen?: ProtoScreen;
  state?: ProtoState;
  children: ReactNode;
}) {
  return (
    <div className="finance-shell glaciar-root">
      <AmbientBackground />
      <div className="finance-frame">
        <ProtoBar screen={screen} state={state} />
        <header className="finance-topbar">
          <Brand subtitle={false} />
          <div className="finance-topbar__actions">
            <a
              href={destinationHref("ayuda")}
              className="ui-icon-btn"
              aria-label="Ayuda"
              title="Ayuda"
            >
              <Icon name="help" />
            </a>
            <ProtoCurrency />
            <button
              type="button"
              className={buttonClass("primary")}
              title="Sin efecto en el prototipo"
            >
              <Icon name="plus" duotone={false} className="size-4" />
              <span className="hidden sm:inline">Registrar movimiento</span>
              <span className="sr-only sm:hidden">Registrar movimiento</span>
            </button>
          </div>
        </header>
        <aside className="finance-sidebar" aria-label="Menú lateral">
          <Brand />
          <ProtoNav current={current} />
        </aside>
        <main id="contenido" tabIndex={-1} className="finance-main">
          {children}
        </main>
      </div>
      <ProtoMobileNav current={current} />
    </div>
  );
}
