"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { adjustmentNoteLimit } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { useFinancialCommand } from "./financial-command";
import { Icon } from "./ui/icon";

const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

export function BalanceAdjustmentForm({
  currency,
  today,
  firstDate,
}: {
  currency: Currency;
  today: string;
  firstDate: string;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/bank-balances/adjustments",
    "POST",
  );
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const amount = useRef<HTMLInputElement>(null);
  const prefix = `ajuste-${currency}`;

  function close() {
    setOpen(false);
    clearError();
    trigger.current?.focus();
  }

  return (
    <div className="contents text-sm">
      <button
        ref={trigger}
        type="button"
        aria-label={`Confirmar saldo real de Bancos ${currency}`}
        aria-expanded={open}
        aria-controls={`${prefix}-formulario`}
        aria-disabled={pending || uncertain}
        className="ui-btn ui-btn--glass"
        data-tour="confirmar-saldo"
        onClick={() => {
          if (pending || uncertain) return;
          if (open) return close();
          setMessage("");
          setOpen(true);
          requestAnimationFrame(() => amount.current?.focus());
        }}
      >
        <Icon name="check" duotone={false} className="size-4" />
        Confirmar saldo
      </button>
      <p role="status" className={message ? "basis-full text-sm" : "sr-only"}>
        {message}
      </p>
      <div
        id={`${prefix}-formulario`}
        hidden={!open}
        className="min-w-0 basis-full"
      >
        {open && (
          <form
            method="post"
            action="/api/bank-balances/adjustments"
            aria-label={`Confirmar saldo real de Bancos ${currency}`}
            className="space-y-3 py-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              if (await send({ ...fields, currency })) {
                setMessage(`Saldo confirmado en ${currency}.`);
                close();
                router.refresh();
              }
            }}
          >
            <p id={`${prefix}-ayuda`} className="text-muted-foreground">
              Ingresá el total real que tenías en tus bancos en {currency} para
              esa fecha, sin separador de miles. El ajuste queda registrado por
              separado de ingresos y gastos.
            </p>
            <fieldset
              disabled={pending || uncertain}
              className="min-w-0 space-y-2"
            >
              <label className="block space-y-1">
                <span>Saldo real ({currency})</span>
                <input
                  ref={amount}
                  name="amount"
                  required
                  inputMode="decimal"
                  maxLength={22}
                  autoComplete="off"
                  aria-describedby={`${prefix}-ayuda`}
                  placeholder="0,00"
                  className={control}
                />
              </label>
              <label className="block space-y-1">
                <span>Fecha de referencia</span>
                <input
                  name="asOfDate"
                  type="date"
                  required
                  defaultValue={today}
                  min={firstDate}
                  max={today}
                  className={control}
                />
              </label>
              <label className="block space-y-1">
                <span>Nota (opcional)</span>
                <textarea
                  name="note"
                  maxLength={adjustmentNoteLimit}
                  rows={2}
                  className={`${control} py-2`}
                />
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {pending
                  ? "Guardando…"
                  : uncertain
                    ? "Reintentar confirmación"
                    : "Confirmar saldo"}
              </button>
              {!uncertain && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={close}
                  className="min-h-11 rounded-md px-2 hover:bg-accent"
                >
                  Cancelar
                </button>
              )}
            </div>
            <p role="alert" className={error ? "" : "sr-only"}>
              {error}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
