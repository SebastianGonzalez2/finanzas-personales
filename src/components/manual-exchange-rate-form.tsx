"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { formatBankReference } from "@/domain/bank-balances";
import { fxKey, type FxKey } from "@/domain/exchange-rates";
import type { Currency } from "@/domain/money";
import { HistoryField, historyButton, historyControl } from "./history-fields";

export function ManualExchangeRateForm({
  keys,
  target,
}: {
  keys: FxKey[];
  target: Currency;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = refreshing || saving;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const key = keys.find((key) => fxKey(key) === fields.get("key"));
    if (!key) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/manual-exchange-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...key, target, rate: fields.get("rate") }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        setError(error || "No pudimos guardar la tasa.");
        return;
      }
      form.reset();
      startTransition(() => router.refresh());
    } catch {
      setError("No pudimos guardar la tasa. Volvé a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <HistoryField label="Fecha efectiva y par de monedas">
        <select name="key" className={historyControl} required disabled={busy}>
          {keys.map((key) => (
            <option key={fxKey(key)} value={fxKey(key)}>
              {formatBankReference(key.date)} · {key.base} → {target}
            </option>
          ))}
        </select>
      </HistoryField>
      <HistoryField label={`Tasa manual en ${target} por unidad de origen`}>
        <input
          name="rate"
          inputMode="decimal"
          maxLength={31}
          required
          className={historyControl}
          disabled={busy}
        />
      </HistoryField>
      <button type="submit" className={historyButton} disabled={busy}>
        {busy ? "Guardando…" : "Guardar tasa"}
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
