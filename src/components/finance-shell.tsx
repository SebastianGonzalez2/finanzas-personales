import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { Currency } from "@/domain/money";
import { withGoogleOwner } from "@/server/google-auth";
import { displayCurrency, exchangeRatesReady } from "@/server/exchange-rates";
import { AmbientBackground } from "./ambient-background";
import { DisplayCurrencySelector } from "./display-currency-selector";
import { FinanceMobileNav } from "./finance-mobile-nav";
import {
  Brand,
  FinanceNavigation,
  navHref,
  type Destination,
} from "./finance-navigation";
import { IntroTour } from "./intro-tour";
import { RegisterMovementLink } from "./register-movement-link";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export type { Destination } from "./finance-navigation";

// UI-02 — Shell Glaciar: fondo ambiental, barra superior (Ayuda, moneda de
// visualización y «Registrar movimiento»), riel lateral flotante en
// escritorio y barra flotante con cajón en móvil. Cada página ya verificó la
// sesión y el titular en servidor; el shell vuelve a pasar por
// `withGoogleOwner` para leer solo la preferencia de moneda del titular de la
// sesión (nunca de la URL). Si no puede leerla, el selector queda deshabilitado.
type DisplayPreference = { currency: Currency | null; ready: boolean };

async function readDisplayCurrency(): Promise<DisplayPreference> {
  const request = new Request("https://internal.invalid", {
    headers: await headers(),
  });
  return withGoogleOwner(request, async (client, ownerId) => ({
    currency: await displayCurrency(client, ownerId),
    ready: await exchangeRatesReady(client),
  })).catch(() => ({ currency: null, ready: false }));
}

export async function FinanceShell({
  current,
  children,
}: {
  current: Destination;
  children: ReactNode;
}) {
  return (
    <FinanceShellView current={current} display={await readDisplayCurrency()}>
      {children}
    </FinanceShellView>
  );
}

/** Marcado del shell, sin acceso a datos (la preferencia llega resuelta). */
export function FinanceShellView({
  current,
  display,
  children,
}: {
  current: Destination;
  display: DisplayPreference;
  children: ReactNode;
}) {
  return (
    <div className="finance-shell glaciar-root">
      <AmbientBackground />
      <div className="finance-frame">
        <header className="finance-topbar">
          <Brand subtitle={false} />
          <div className="finance-topbar__actions">
            <a
              href={navHref("/ayuda")}
              className="ui-icon-btn"
              aria-label="Ayuda"
              title="Ayuda"
            >
              <Icon name="help" />
            </a>
            <DisplayCurrencySelector
              key={display.currency ?? "sin-moneda"}
              currency={display.currency}
              ready={display.ready}
            />
            <RegisterMovementLink
              className={buttonClass("primary")}
              handleRequest
            />
          </div>
        </header>

        {/* Después de la barra superior en el orden de foco: Tab recorre
            barra → menú → contenido; visualmente el riel queda fijo a la izquierda. */}
        <aside className="finance-sidebar" aria-label="Menú lateral">
          <Brand />
          <FinanceNavigation current={current} />
        </aside>

        <main id="contenido" tabIndex={-1} className="finance-main">
          {children}
        </main>
      </div>
      <FinanceMobileNav current={current} />
      {current === "resumen" && <IntroTour />}
    </div>
  );
}
