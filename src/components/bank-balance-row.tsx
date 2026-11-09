"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  formatBankAmount,
  formatBankReference,
  type BankBalance,
} from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

export function BankBalanceRow({
  currency,
  initialBalance,
  today,
}: {
  currency: Currency;
  initialBalance?: BankBalance;
  today: string;
}) {
  const [saved, setSaved] = useState<BankBalance>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const amountInput = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const balance = initialBalance ?? saved;
  const prefix = `saldo-${currency}`;

  useEffect(() => {
    if (saved) heading.current?.focus();
  }, [saved]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/bank-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          amount: fields.get("amount"),
          asOfDate: fields.get("asOfDate"),
        }),
      });
      const data: { balance?: BankBalance; error?: string } =
        await response.json();
      if (response.ok && data.balance?.currency === currency) {
        setSaved(data.balance);
        setOpen(false);
      } else {
        setError(
          data.error ?? "No pudimos confirmar el guardado. Intentá de nuevo.",
        );
      }
    } catch {
      setError(
        "No pudimos confirmar el guardado. Revisá tu conexión e intentá de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  function showForm() {
    setOpen(true);
    requestAnimationFrame(() => amountInput.current?.focus());
  }

  function cancel() {
    setOpen(false);
    setError("");
    requestAnimationFrame(() => openButton.current?.focus());
  }

  return (
    <li className="min-w-0 border-t py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h3 ref={heading} tabIndex={-1} className="text-sm font-medium">
          Bancos {currency}
        </h3>
        {!balance && !open && (
          <button
            ref={openButton}
            type="button"
            className="min-h-11 rounded-md px-2 text-sm font-medium text-ring hover:bg-accent"
            aria-label={`Configurar Bancos ${currency}`}
            onClick={showForm}
          >
            Configurar
          </button>
        )}
      </div>
      <div role="status" aria-atomic="true">
        {balance ? (
          <>
            <p className="mt-1 text-lg font-semibold wrap-anywhere tabular-nums">
              {formatBankAmount(balance)}
            </p>
            <p className="text-xs text-muted-foreground">
              Confirmado al{" "}
              <time dateTime={balance.asOfDate}>
                {formatBankReference(balance.asOfDate)}
              </time>
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Sin configurar</p>
        )}
      </div>
      {open && !balance && (
        <form
          method="post"
          action="/api/bank-balances"
          aria-label={`Saldo inicial de Bancos ${currency}`}
          className="mt-3 space-y-3"
          onSubmit={submit}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-3">
            <div className="space-y-1">
              <label htmlFor={`${prefix}-importe`} className="block text-sm">
                Saldo inicial ({currency})
              </label>
              <input
                ref={amountInput}
                id={`${prefix}-importe`}
                name="amount"
                inputMode="decimal"
                required
                maxLength={22}
                autoComplete="off"
                aria-describedby={`${prefix}-ayuda`}
                placeholder="0,00"
                className={inputClass}
              />
              <p
                id={`${prefix}-ayuda`}
                className="text-xs text-muted-foreground"
              >
                Sumá lo que tenías en tus bancos en esta moneda, sin puntos de
                miles. Este saldo no cuenta como ingreso.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${prefix}-fecha`} className="block text-sm">
                Fecha de referencia
              </label>
              <input
                id={`${prefix}-fecha`}
                name="asOfDate"
                type="date"
                required
                defaultValue={today}
                max={today}
                className={inputClass}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar saldo"}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg px-2 text-sm hover:bg-accent"
                onClick={cancel}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
          <p
            role="alert"
            className={error ? "text-sm text-foreground" : "sr-only"}
          >
            {error}
          </p>
        </form>
      )}
    </li>
  );
}
