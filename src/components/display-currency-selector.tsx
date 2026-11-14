"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { bankCurrencies } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { connectionAwareMessage } from "./connection";
import { Segmented, SegmentedOption } from "./ui/segmented";

// UI-02 — Selector global de la moneda de visualización (v9.46) en la barra
// superior. Usa el mismo endpoint y la misma preferencia guardada en la cuenta
// (`POST /api/display-currency`); solo cambia cómo se muestran los totales:
// no convierte ni mueve dinero. Mientras guarda, el grupo queda ocupado; si
// falla, vuelve a la moneda guardada y avisa.
export function DisplayCurrencySelector({
  currency,
  ready,
}: {
  /** Moneda guardada; `null` si no se pudo leer. */
  currency: Currency | null;
  /** `false` si las cotizaciones todavía no están disponibles. */
  ready: boolean;
}) {
  const router = useRouter();
  const hint = useId();
  const [refreshing, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [requested, setRequested] = useState<Currency | null>(null);
  const [error, setError] = useState("");
  const busy = saving || refreshing;
  const available = ready && currency !== null;
  const shown = busy && requested ? requested : currency;

  async function choose(next: Currency) {
    if (busy || !available || next === currency) return;
    setError("");
    setRequested(next);
    setSaving(true);
    try {
      const response = await fetch("/api/display-currency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: next }),
      });
      if (!response.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setRequested(null);
      setError(
        connectionAwareMessage(
          "No pudimos guardar la moneda. Volvé a intentarlo.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="finance-currency" data-tour="moneda-app">
      <Segmented
        label="Moneda de visualización"
        aria-busy={busy}
        aria-describedby={available ? undefined : hint}
        title={
          available
            ? "Moneda en la que se muestran los totales de la aplicación"
            : undefined
        }
      >
        {bankCurrencies.map((code) => (
          <SegmentedOption
            key={code}
            pressed={shown === code}
            pending={busy && requested === code}
            // Ocupado: sigue enfocable (el foco no se pierde) pero no actúa.
            aria-disabled={busy || undefined}
            disabled={!available}
            onClick={() => void choose(code)}
          >
            {code}
          </SegmentedOption>
        ))}
      </Segmented>
      {!available && (
        <span id={hint} className="sr-only">
          La moneda de visualización no está disponible por ahora.
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {busy ? "Guardando la moneda de visualización…" : ""}
      </span>
      {error && (
        <p role="alert" className="finance-currency__error">
          {error}
        </p>
      )}
    </div>
  );
}
