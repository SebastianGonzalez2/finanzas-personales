"use client";

import { DateInput } from "./ui/date-fields";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  formatBankAmount,
  formatBankReference,
  type BankAvailability,
  type BankBalance,
} from "@/domain/bank-balances";
import { connectionAwareMessage } from "./connection";
import type { Currency } from "@/domain/money";
import { Icon } from "./ui/icon";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

export function BankBalanceRow({
  currency,
  initialBalance,
  today,
  transfer,
  children,
  history,
}: {
  currency: Currency;
  initialBalance?: BankAvailability;
  today: string;
  transfer: ReactNode;
  children?: ReactNode;
  history?: ReactNode;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<BankBalance>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const amountInput = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLParagraphElement>(null);
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
        router.refresh();
      } else {
        setError(
          data.error ?? "No pudimos confirmar el guardado. Intentá de nuevo.",
        );
      }
    } catch {
      setError(
        connectionAwareMessage(
          "No pudimos confirmar el guardado. Revisá tu conexión e intentá de nuevo.",
        ),
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

  const available =
    initialBalance &&
    formatBankAmount({
      currency,
      amount: initialBalance.availableAmount,
    });
  const [whole, cents] = available ? available.split(" ")[0].split(",") : [];

  return (
    <>
      <div role="status" aria-atomic="true">
        <p ref={heading} tabIndex={-1} className="b-hero__value tabular-nums">
          <span className="b-hero__currency" aria-hidden={Boolean(available)}>
            {currency}
          </span>
          {whole ? (
            <>
              <span aria-hidden="true" className="wrap-anywhere">
                {whole}
                <span className="b-hero__cents">,{cents}</span>
              </span>
              <span className="sr-only">{available}</span>
            </>
          ) : (
            <span className="text-2xl tracking-normal">
              {balance ? "Actualizando…" : "Sin configurar"}
            </span>
          )}
        </p>
        {balance && (
          <>
            <div className="b-hero__meta">
              <p className="lab-tag lab-tag--good">
                <Icon name="check" duotone={false} className="size-3" />
                <span>
                  Saldo confirmado el{" "}
                  <time
                    dateTime={balance.asOfDate}
                    title={formatBankReference(balance.asOfDate)}
                  >
                    {formatBankReference(balance.asOfDate)}
                  </time>
                </span>
              </p>
              <p className="lab-muted text-sm">
                Ya descuenta fondos reservados
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums wrap-anywhere">
              Saldo bancario{" "}
              {formatBankAmount({
                currency,
                amount: balance.calculatedAmount ?? balance.amount,
              })}
              {initialBalance && initialBalance.reservedAmount !== "0.0000" && (
                <>
                  {" "}
                  ·{" "}
                  <span>
                    Reservado{" "}
                    {formatBankAmount({
                      currency,
                      amount: initialBalance.reservedAmount,
                    })}
                  </span>
                </>
              )}
              {balance.calculatedAmount !== undefined && (
                <> · Confirmado {formatBankAmount(balance)}</>
              )}
            </p>
          </>
        )}
      </div>
      <div className="b-hero__actions mt-5">
        {transfer}
        {children}
        {!balance && !open && (
          <button
            ref={openButton}
            type="button"
            className="ui-btn ui-btn--glass"
            aria-label={`Configurar Bancos ${currency}`}
            onClick={showForm}
          >
            <Icon name="check" duotone={false} className="size-4" />
            Configurar saldo
          </button>
        )}
      </div>
      {history}
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
              <DateInput
                id={`${prefix}-fecha`}
                name="asOfDate"
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
    </>
  );
}
