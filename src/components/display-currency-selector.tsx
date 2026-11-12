"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { bankCurrencies } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { HistoryField, historyButton, historyControl } from "./history-fields";

export function DisplayCurrencySelector({
  currency,
  ready,
}: {
  currency: Currency;
  ready: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = saving || refreshing;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = new FormData(event.currentTarget).get("currency");
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/display-currency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: selected }),
      });
      if (!response.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setError("No pudimos guardar la moneda. Volvé a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      <HistoryField label="Moneda de visualización">
        <select
          name="currency"
          defaultValue={currency}
          className={historyControl}
          disabled={busy || !ready}
        >
          {bankCurrencies.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </select>
      </HistoryField>
      <button type="submit" className={historyButton} disabled={busy || !ready}>
        {busy ? "Guardando…" : "Guardar moneda"}
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
