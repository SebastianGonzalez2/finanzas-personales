"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  bankCurrencies,
  formatBankReference,
  type BankBalance,
} from "@/domain/bank-balances";
import {
  conceptLimit,
  movementMethods,
  noteLimit,
  type MovementCategory,
  type MovementKind,
} from "@/domain/movements";
import type { Currency } from "@/domain/money";
import { Card } from "./ui/card";

const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";
const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";

export function MovementForm({
  today,
  balances,
  categories,
}: {
  today: string;
  balances: BankBalance[];
  categories: MovementCategory[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind>("expense");
  const [currency, setCurrency] = useState<Currency>();
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [revisionUncertain, setRevisionUncertain] = useState(false);
  const submitLock = useRef(false);
  const requestKey = useRef<string>(null);
  const sentBody = useRef<string>(null);
  const sentRevision = useRef<{ action: "void" | "correct"; body: string }>(
    null,
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const correctionInput = useRef<HTMLInputElement>(null);
  const correctionTrigger = useRef<HTMLButtonElement>(null);
  const retryRevision = useRef<HTMLButtonElement>(null);
  const configured = bankCurrencies.filter((code) =>
    balances.some((balance) => balance.currency === code),
  );
  const selectedCurrency = currency ?? configured[0];
  const bank = balances.find(
    (balance) => balance.currency === selectedCurrency,
  );
  const income = kind === "income";

  useEffect(() => {
    if (revisionUncertain && !pending) retryRevision.current?.focus();
  }, [pending, revisionUncertain]);

  function toggle() {
    if (submitLock.current || revisionUncertain) return;
    if (open) {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!uncertain) {
      setKind("expense");
      setCurrency(configured[0]);
      setError("");
      setMessage("");
      setSavedId(null);
      setEditing(false);
      setRevisionError("");
      requestKey.current = null;
      sentBody.current = null;
    }
    setOpen(true);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setPending(true);
    setError("");
    try {
      if (!uncertain) {
        requestKey.current ??= crypto.randomUUID();
        sentBody.current = JSON.stringify({
          ...Object.fromEntries(new FormData(event.currentTarget)),
          idempotencyKey: requestKey.current,
        });
      }
      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sentBody.current,
      });
      const data: { id?: string; error?: string } = await response.json();
      if (response.ok && data.id) {
        setUncertain(false);
        setSavedId(data.id);
        setMessage(income ? "Ingreso registrado." : "Gasto registrado.");
        setOpen(false);
        trigger.current?.focus();
        router.refresh();
      } else if (
        response.status >= 500 ||
        !data.error ||
        (uncertain && response.status === 401)
      ) {
        throw new Error();
      } else {
        setUncertain(false);
        requestKey.current = null;
        sentBody.current = null;
        setError(data.error);
      }
    } catch {
      setUncertain(sentBody.current !== null);
      setError(
        "No pudimos confirmar el guardado. Reintentá con los mismos datos.",
      );
      router.refresh();
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  async function revise(
    action: "void" | "correct",
    amount?: FormDataEntryValue | null,
  ) {
    if (!savedId || submitLock.current) return;
    submitLock.current = true;
    setPending(true);
    setRevisionError("");
    try {
      const command = (sentRevision.current ??= {
        action,
        body: JSON.stringify({
          action,
          eventId: savedId,
          idempotencyKey: crypto.randomUUID(),
          ...(action === "correct" ? { amount } : {}),
        }),
      });
      const response = await fetch("/api/movements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: command.body,
      });
      const data: { id?: string; error?: string } = await response.json();
      if (response.ok && data.id) {
        setMessage(
          command.action === "void"
            ? "Registro anulado."
            : "Importe corregido.",
        );
        setSavedId(null);
        setEditing(false);
        trigger.current?.focus();
        router.refresh();
      } else if (
        response.status >= 500 ||
        !data.error ||
        (revisionUncertain && response.status === 401)
      ) {
        throw new Error();
      } else {
        setRevisionError(data.error);
        router.refresh();
      }
      sentRevision.current = null;
      setRevisionUncertain(false);
    } catch {
      setRevisionUncertain(sentRevision.current !== null);
      setRevisionError(
        "No pudimos confirmar el cambio. Reintentá el mismo envío.",
      );
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        ref={trigger}
        type="button"
        className={primary}
        aria-expanded={open}
        aria-controls="nueva-transaccion"
        aria-disabled={pending || revisionUncertain}
        onClick={toggle}
      >
        + Nueva transacción
      </button>
      <p role="status" className={message ? "mt-2 text-sm" : "sr-only"}>
        {message}
      </p>
      {savedId && (
        <div className="mt-2 grid gap-2 text-sm">
          <p className="text-muted-foreground">
            Estas acciones solo cambian el registro en la aplicación.
          </p>
          {revisionUncertain ? (
            <button
              ref={retryRevision}
              type="button"
              className={`${primary} justify-self-start`}
              disabled={pending}
              onClick={() => {
                const action = sentRevision.current?.action;
                if (action) void revise(action);
              }}
            >
              Reintentar cambio
            </button>
          ) : editing ? (
            <form
              method="post"
              action="/api/movements"
              aria-label="Corregir importe"
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void revise(
                  "correct",
                  new FormData(event.currentTarget).get("amount"),
                );
              }}
            >
              <label className="min-w-0 space-y-1">
                <span>Importe correcto</span>
                <input
                  ref={correctionInput}
                  name="amount"
                  required
                  inputMode="decimal"
                  maxLength={22}
                  autoComplete="off"
                  disabled={pending}
                  className={control}
                />
              </label>
              <button type="submit" className={primary} disabled={pending}>
                Guardar corrección
              </button>
              <button
                type="button"
                disabled={pending}
                className="min-h-11 rounded-lg px-2 hover:bg-accent"
                onClick={() => {
                  setEditing(false);
                  setRevisionError("");
                  requestAnimationFrame(() =>
                    correctionTrigger.current?.focus(),
                  );
                }}
              >
                Cancelar
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className={primary}
                onClick={() => void revise("void")}
              >
                Deshacer
              </button>
              <button
                ref={correctionTrigger}
                type="button"
                disabled={pending}
                className="min-h-11 rounded-lg px-2 font-semibold hover:bg-accent"
                onClick={() => {
                  setRevisionError("");
                  setEditing(true);
                  requestAnimationFrame(() => correctionInput.current?.focus());
                }}
              >
                Corregir importe
              </button>
            </div>
          )}
          <p role="alert" className={revisionError ? "" : "sr-only"}>
            {revisionError}
          </p>
        </div>
      )}
      <div id="nueva-transaccion" hidden={!open}>
        {(open || uncertain) && (
          <Card className="mt-3 gap-3 rounded-[1.125rem] p-4 shadow-none sm:p-6">
            <h2
              ref={heading}
              tabIndex={-1}
              id="titulo-transaccion"
              className="text-lg font-semibold"
            >
              Nueva transacción
            </h2>
            {!configured.length ? (
              <p className="text-sm text-muted-foreground">
                Configurá un saldo inicial en «Dinero disponible» para registrar
                un ingreso o gasto.
              </p>
            ) : (
              <form
                method="post"
                action="/api/movements"
                aria-labelledby="titulo-transaccion"
                onSubmit={submit}
              >
                <fieldset
                  disabled={pending || uncertain}
                  className="grid min-w-0 gap-3 sm:grid-cols-2"
                >
                  <label className="space-y-1 text-sm">
                    <span>Tipo de movimiento</span>
                    <select
                      name="kind"
                      className={control}
                      value={kind}
                      onChange={(event) =>
                        setKind(
                          event.target.value === "income"
                            ? "income"
                            : "expense",
                        )
                      }
                    >
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Medio bancario</span>
                    <select name="method" key={kind} className={control}>
                      {income ? (
                        <option value="deposit">
                          {movementMethods.deposit}
                        </option>
                      ) : (
                        <>
                          <option value="debit">{movementMethods.debit}</option>
                          <option value="transfer">
                            {movementMethods.transfer}
                          </option>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Importe</span>
                    <input
                      name="amount"
                      required
                      inputMode="decimal"
                      maxLength={22}
                      autoComplete="off"
                      placeholder="0,00"
                      className={control}
                      aria-describedby="importe-transaccion-ayuda"
                    />
                    <span
                      id="importe-transaccion-ayuda"
                      className="block text-xs text-muted-foreground"
                    >
                      Sin separador de miles, hasta 4 decimales.
                    </span>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Moneda</span>
                    <select
                      name="currency"
                      required
                      value={selectedCurrency}
                      className={control}
                      onChange={(event) =>
                        setCurrency(event.target.value as Currency)
                      }
                    >
                      {configured.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Fecha</span>
                    <input
                      name="effectiveOn"
                      type="date"
                      required
                      max={today}
                      defaultValue={today}
                      className={control}
                      aria-describedby="fecha-transaccion-ayuda"
                    />
                    <span
                      id="fecha-transaccion-ayuda"
                      className="block text-xs text-muted-foreground"
                    >
                      {bank
                        ? `Las fechas anteriores al ${formatBankReference(bank.asOfDate)} quedan en el historial. Para el día del saldo inicial, registrá los movimientos posteriores a ese saldo.`
                        : "Ingresá la fecha en que ocurrió."}
                    </span>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Categoría (opcional)</span>
                    <select name="categoryId" key={kind} className={control}>
                      <option value="">Sin categorizar</option>
                      {categories
                        .filter((category) => category.kind === kind)
                        .map(({ id, name }) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>{income ? "Concepto (opcional)" : "Concepto"}</span>
                    <input
                      name="concept"
                      required={!income}
                      maxLength={conceptLimit}
                      className={control}
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Nota (opcional)</span>
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={noteLimit}
                      className={`${control} py-2`}
                    />
                  </label>
                </fieldset>
                <p role="alert" className={error ? "mt-3 text-sm" : "sr-only"}>
                  {error}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="submit" disabled={pending} className={primary}>
                    {pending
                      ? "Guardando…"
                      : uncertain
                        ? "Reintentar guardado"
                        : "Guardar movimiento"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-11 rounded-lg px-2 text-sm hover:bg-accent"
                    onClick={toggle}
                  >
                    {uncertain ? "Cerrar formulario" : "Cancelar"}
                  </button>
                </div>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
