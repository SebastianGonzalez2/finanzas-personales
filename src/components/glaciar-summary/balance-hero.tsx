"use client";

import { useId, useState, type ReactNode } from "react";
import type { Currency } from "@/domain/money";
import { Icon } from "../ui/icon";

export function BalanceHero({
  balances,
  hint = false,
}: {
  balances: { currency: Currency; content: ReactNode }[];
  hint?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const hintId = `${id}-hint`;
  const panelId = (currency: Currency) => `${id}-panel-${currency}`;
  const tabId = (currency: Currency) => `${id}-tab-${currency}`;
  return (
    <section aria-labelledby={id} className="lab-panel b-hero">
      <span className="b-hero__orb" aria-hidden="true" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="b-eyebrow">
          <span className="b-eyebrow__icon">
            <Icon name="wallet" className="size-4" />
          </span>
          Disponible libre
        </h2>
        <div className="b-hero__switch">
          <div
            role="tablist"
            aria-label="Moneda del saldo"
            aria-describedby={hint ? hintId : undefined}
            className="lab-segment"
            data-tour="moneda-cuenta"
          >
            {balances.map((item, index) => (
              <button
                key={item.currency}
                type="button"
                role="tab"
                id={tabId(item.currency)}
                aria-selected={index === selected}
                aria-controls={panelId(item.currency)}
                tabIndex={index === selected ? 0 : -1}
                className="lab-segment__option"
                onClick={() => setSelected(index)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                    return;
                  event.preventDefault();
                  const next =
                    (index +
                      (event.key === "ArrowRight" ? 1 : balances.length - 1)) %
                    balances.length;
                  setSelected(next);
                  document
                    .getElementById(tabId(balances[next].currency))
                    ?.focus();
                }}
              >
                {item.currency}
              </button>
            ))}
          </div>
          {hint && (
            <p id={hintId} className="b-hero__hint">
              Cambiá entre tu cuenta en pesos, dólares o euros
            </p>
          )}
        </div>
      </header>
      <ul aria-label="Saldos bancarios por moneda">
        {balances.map(({ currency, content }, index) => (
          <li key={currency} hidden={index !== selected}>
            <div
              id={panelId(currency)}
              role="tabpanel"
              aria-labelledby={tabId(currency)}
            >
              {content}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
