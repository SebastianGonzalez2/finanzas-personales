"use client";

import { DateInput } from "./ui/date-fields";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bankCurrencies } from "@/domain/bank-balances";
import { conceptLimit, noteLimit } from "@/domain/movements";
import { formInstallmentPlan, InstallmentFields } from "./installment-fields";
import type { Currency } from "@/domain/money";
import type { CatalogCategory } from "@/domain/categories";
import { CategorySelect } from "./category-select";
import { catalogNameLimit } from "@/domain/catalog";
import type { MovementTag } from "@/domain/classification";
import {
  AllocationFields,
  TagFields,
  formClassification,
} from "./classification-fields";
import { connectionAwareMessage } from "./connection";
import { useWarnOnUnconfirmedCommand } from "./unconfirmed-command";
import { NameAutocomplete } from "./name-autocomplete";
import { Card } from "./ui/card";

const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";
const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";

// SIMP-03 — Formulario de gasto: sin saldo, medio bancario, ingresos,
// cambio de moneda, tarjetas ni fondos. El servidor sigue validando todo.
export function MovementForm({
  today,
  categories,
  tags,
}: {
  today: string;
  categories: CatalogCategory[];
  tags?: MovementTag[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>();
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState(false);
  const [effectiveOn, setEffectiveOn] = useState(today);
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
  const returnFocus = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const correctionInput = useRef<HTMLInputElement>(null);
  const correctionTrigger = useRef<HTMLButtonElement>(null);
  const retryRevision = useRef<HTMLButtonElement>(null);
  const save = useRef<HTMLButtonElement>(null);
  const selectedCurrency = currency ?? bankCurrencies[0];

  useWarnOnUnconfirmedCommand(pending || uncertain || revisionUncertain);

  useEffect(() => {
    if (revisionUncertain && !pending) retryRevision.current?.focus();
  }, [pending, revisionUncertain]);

  useEffect(() => {
    if (uncertain && !pending && document.activeElement === document.body)
      save.current?.focus();
  }, [pending, uncertain]);

  function focusRegistrationTrigger() {
    const target = returnFocus.current;
    if (target && target !== document.body && target.isConnected)
      target.focus();
    else
      document
        .querySelector<HTMLElement>('.finance-topbar [data-tour="registrar"]')
        ?.focus();
  }

  function closeForm() {
    setOpen(false);
    focusRegistrationTrigger();
  }

  function openForm() {
    if (submitLock.current || revisionUncertain) return;
    if (open) {
      heading.current?.focus();
      return;
    }
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement ? active : null;
    if (!uncertain) {
      setCurrency(undefined);
      setAmount("");
      setInstallments(false);
      setEffectiveOn(today);
      setError("");
      setMessage("");
      setSavedId(null);
      setEditing(false);
      setRevisionError("");
      requestKey.current = null;
      sentBody.current = null;
    }
    setOpen(true);
    requestAnimationFrame(() => {
      if (
        document.activeElement === active ||
        document.activeElement === document.body
      )
        heading.current?.focus();
    });
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
        const form = new FormData(event.currentTarget);
        const classification = formClassification(form);
        const plan = formInstallmentPlan(form);
        sentBody.current = JSON.stringify({
          ...Object.fromEntries(form),
          ...classification,
          ...(plan && { plan }),
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
        setMessage("Gasto registrado.");
        closeForm();
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
        connectionAwareMessage(
          "No pudimos confirmar el guardado. Reintentá el mismo envío.",
        ),
      );
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
        focusRegistrationTrigger();
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
        connectionAwareMessage(
          "No pudimos confirmar el cambio. Reintentá el mismo envío.",
        ),
      );
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        hidden
        aria-expanded={open}
        aria-controls="nueva-transaccion"
        aria-disabled={pending || revisionUncertain}
        onClick={() => openForm()}
      >
        + Nuevo gasto
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
              Nuevo gasto
            </h2>
            <form
              method="post"
              action="/api/movements"
              aria-labelledby="titulo-transaccion"
              onSubmit={submit}
            >
              <input type="hidden" name="kind" value="expense" />
              <fieldset
                disabled={pending || uncertain}
                className="grid min-w-0 gap-3 sm:grid-cols-2"
              >
                <label className="flex min-h-11 items-center gap-2 self-end text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="installments"
                    checked={installments}
                    onChange={(event) => setInstallments(event.target.checked)}
                    className="size-5"
                  />
                  <span>En cuotas</span>
                </label>
                {installments ? (
                  <InstallmentFields
                    key={effectiveOn.slice(0, 7)}
                    currency={selectedCurrency}
                    firstPeriod={effectiveOn.slice(0, 7)}
                  />
                ) : (
                  <label className="space-y-1 text-sm">
                    <span>Importe</span>
                    <input
                      name="amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
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
                )}
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
                    {bankCurrencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Fecha</span>
                  <DateInput
                    name="effectiveOn"
                    required
                    max={today}
                    value={effectiveOn}
                    onValueChange={setEffectiveOn}
                    className={control}
                    aria-describedby="fecha-transaccion-ayuda"
                  />
                  <span
                    id="fecha-transaccion-ayuda"
                    className="block text-xs text-muted-foreground"
                  >
                    {installments
                      ? "Fecha de la compra. Cada cuota cuenta en su mes."
                      : "Ingresá la fecha en que ocurrió."}
                  </span>
                </label>
                <AllocationFields
                  categories={categories.filter(
                    (category) => category.kind === "expense",
                  )}
                  available={!!tags}
                >
                  <CategorySelect
                    kind="expense"
                    categories={categories}
                    controlClassName={control}
                  />
                </AllocationFields>
                {tags && <TagFields tags={tags} />}
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span>Concepto</span>
                  <input
                    name="concept"
                    required
                    maxLength={conceptLimit}
                    className={control}
                  />
                </label>
                <NameAutocomplete
                  kind="merchant"
                  name="merchantName"
                  label="Comercio (opcional)"
                  maxLength={catalogNameLimit}
                  className={control}
                />
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
                <button
                  ref={save}
                  type="submit"
                  disabled={pending}
                  className={primary}
                >
                  {pending
                    ? "Guardando…"
                    : uncertain
                      ? "Reintentar guardado"
                      : "Guardar gasto"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="min-h-11 rounded-lg px-2 text-sm hover:bg-accent"
                  onClick={closeForm}
                >
                  {uncertain ? "Cerrar formulario" : "Cancelar"}
                </button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
