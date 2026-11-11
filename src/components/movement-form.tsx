"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  bankCurrencies,
  formatBankReference,
  type BankAvailability,
} from "@/domain/bank-balances";
import {
  conceptLimit,
  movementMethods,
  noteLimit,
  type MovementKind,
} from "@/domain/movements";
import type { Currency } from "@/domain/money";
import type { CatalogCard } from "@/domain/cards";
import type { CatalogCategory } from "@/domain/categories";
import { CategorySelect } from "./category-select";
import { SharedExpenseForm } from "./shared-expense-form";
import { CreditOperationForm } from "./credit-operation-form";
import type { FundSource } from "@/domain/fund-coverage";
import {
  expenseFundsField,
  formFundPortions,
  FundPortionFields,
} from "./fund-portion-fields";
import { Card } from "./ui/card";

const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";
const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";

export function MovementForm({
  today,
  balances,
  fundSources,
  categories,
  bankTransfersReady,
  creditCards,
  debitCards,
  installmentsReady,
  sharedExpensesReady,
}: {
  today: string;
  balances: BankAvailability[];
  fundSources?: FundSource[] | null;
  categories: CatalogCategory[];
  bankTransfersReady: boolean;
  creditCards: CatalogCard[];
  debitCards?: CatalogCard[];
  installmentsReady: boolean;
  sharedExpensesReady: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind | "bank_transfer">("expense");
  const [currency, setCurrency] = useState<Currency>();
  const [amount, setAmount] = useState("");
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
  const transfer = kind === "bank_transfer";
  const needsBalances = transfer && configured.length < 2;

  useEffect(() => {
    if (revisionUncertain && !pending) retryRevision.current?.focus();
  }, [pending, revisionUncertain]);

  function toggle() {
    if (creditOpen || sharedOpen || submitLock.current || revisionUncertain)
      return;
    if (open) {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!uncertain) {
      setKind("expense");
      setCurrency(configured[0]);
      setAmount("");
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
        const form = new FormData(event.currentTarget);
        const fundPortions = formFundPortions(form, expenseFundsField);
        form.delete(expenseFundsField);
        sentBody.current = JSON.stringify({
          ...Object.fromEntries(form),
          ...(fundPortions?.length && { fundPortions }),
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
        setMessage(
          transfer
            ? "Cambio de moneda registrado."
            : income
              ? "Ingreso registrado."
              : "Gasto registrado.",
        );
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
        aria-disabled={pending || revisionUncertain || creditOpen || sharedOpen}
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
              {!transfer && (
                <button
                  ref={correctionTrigger}
                  type="button"
                  disabled={pending}
                  className="min-h-11 rounded-lg px-2 font-semibold hover:bg-accent"
                  onClick={() => {
                    setRevisionError("");
                    setEditing(true);
                    requestAnimationFrame(() =>
                      correctionInput.current?.focus(),
                    );
                  }}
                >
                  Corregir importe
                </button>
              )}
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
            {!sharedOpen &&
              !creditOpen &&
              !pending &&
              !uncertain &&
              creditCards.length > 0 && (
                <button
                  type="button"
                  className="min-h-11 justify-self-start rounded-lg border px-3 text-sm font-semibold"
                  onClick={() => {
                    setMessage("");
                    setCreditOpen(true);
                  }}
                >
                  Compra con tarjeta de crédito
                </button>
              )}
            {sharedExpensesReady &&
              !creditOpen &&
              !sharedOpen &&
              !pending &&
              !uncertain && (
                <button
                  type="button"
                  className="min-h-11 justify-self-start rounded-lg border px-3 text-sm font-semibold"
                  onClick={() => {
                    setMessage("");
                    setSharedOpen(true);
                  }}
                >
                  Gasto con otras personas
                </button>
              )}
            {sharedOpen ? (
              <SharedExpenseForm
                today={today}
                categories={categories}
                cards={creditCards}
                banks={configured}
                plansReady={installmentsReady}
                onClose={() => {
                  setSharedOpen(false);
                  requestAnimationFrame(() => heading.current?.focus());
                }}
              />
            ) : creditOpen ? (
              <CreditOperationForm
                action="purchase"
                cards={creditCards}
                banks={configured}
                categories={categories}
                fundSources={fundSources}
                bankAvailability={balances}
                debitCards={debitCards}
                today={today}
                installmentsReady={installmentsReady}
                close={(result) => {
                  setCreditOpen(false);
                  if (result) {
                    setMessage(result);
                    setOpen(false);
                    router.refresh();
                  }
                  requestAnimationFrame(() =>
                    (result ? trigger.current : heading.current)?.focus(),
                  );
                }}
              />
            ) : !configured.length ? (
              <p className="text-sm text-muted-foreground">
                Configurá un saldo inicial en «Disponible libre» para registrar
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
                  onChange={transfer ? () => setError("") : undefined}
                  className="grid min-w-0 gap-3 sm:grid-cols-2"
                >
                  <label
                    className={`space-y-1 text-sm ${transfer ? "sm:col-span-2" : ""}`}
                  >
                    <span>Tipo de movimiento</span>
                    <select
                      name="kind"
                      className={control}
                      value={kind}
                      onChange={(event) => {
                        setKind(event.target.value as typeof kind);
                        setError("");
                      }}
                    >
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                      {bankTransfersReady && (
                        <option value="bank_transfer">Cambio de moneda</option>
                      )}
                    </select>
                  </label>
                  {transfer ? (
                    <BankTransferFields currencies={configured} />
                  ) : (
                    <>
                      <label className="space-y-1 text-sm">
                        <span>Medio bancario</span>
                        <select name="method" key={kind} className={control}>
                          {income ? (
                            <option value="deposit">
                              {movementMethods.deposit}
                            </option>
                          ) : (
                            <>
                              <option value="debit">
                                {movementMethods.debit}
                              </option>
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
                    </>
                  )}
                  {!needsBalances && (
                    <label className="space-y-1 text-sm">
                      <span>Fecha</span>
                      <input
                        name="effectiveOn"
                        type="date"
                        required
                        max={today}
                        value={effectiveOn}
                        onChange={(event) => setEffectiveOn(event.target.value)}
                        className={control}
                        aria-describedby="fecha-transaccion-ayuda"
                      />
                      <span
                        id="fecha-transaccion-ayuda"
                        className="block text-xs text-muted-foreground"
                      >
                        {transfer
                          ? "Usá la fecha real del cambio. Si un saldo confirmado cubre esa fecha, el efecto se refleja en su conciliación."
                          : bank
                            ? `Las fechas anteriores al ${formatBankReference(bank.asOfDate)} quedan en el historial. Para el día del saldo inicial, registrá los movimientos posteriores a ese saldo.`
                            : "Ingresá la fecha en que ocurrió."}
                      </span>
                    </label>
                  )}
                  {!transfer && !income && selectedCurrency && fundSources && (
                    <FundPortionFields
                      key={selectedCurrency}
                      funds={fundSources}
                      currency={selectedCurrency}
                      amount={amount}
                      available={
                        bank && effectiveOn >= bank.asOfDate
                          ? bank.availableAmount
                          : undefined
                      }
                    />
                  )}
                  {!transfer && (
                    <>
                      <CategorySelect
                        key={kind}
                        kind={kind}
                        categories={categories}
                        controlClassName={control}
                      />
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span>
                          {income ? "Concepto (opcional)" : "Concepto"}
                        </span>
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
                    </>
                  )}
                </fieldset>
                <p role="alert" className={error ? "mt-3 text-sm" : "sr-only"}>
                  {error}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!needsBalances && (
                    <button
                      type="submit"
                      disabled={pending}
                      className={primary}
                    >
                      {pending
                        ? "Guardando…"
                        : uncertain
                          ? "Reintentar guardado"
                          : transfer
                            ? "Guardar cambio de moneda"
                            : "Guardar movimiento"}
                    </button>
                  )}
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

function BankTransferFields({ currencies }: { currencies: Currency[] }) {
  const [source, setSource] = useState(currencies[0]);
  const [destination, setDestination] = useState<Currency | "">("");
  if (currencies.length < 2)
    return (
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Configurá el saldo inicial de ambas monedas en «Disponible libre».
      </p>
    );

  return (
    <>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Cargá los dos importes reales. Las transferencias entre bancos propios
        de la misma moneda ya están incluidas en el saldo agregado.
      </p>
      <label className="space-y-1 text-sm">
        <span>Moneda de origen</span>
        <select
          name="sourceCurrency"
          value={source}
          onChange={(event) => {
            const code = event.target.value as Currency;
            setSource(code);
            if (destination === code) setDestination("");
          }}
          className={control}
        >
          {currencies.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>Importe entregado</span>
        <input
          key={source}
          name="sourceAmount"
          required
          inputMode="decimal"
          maxLength={22}
          autoComplete="off"
          placeholder="0,00"
          className={control}
          aria-describedby="cambio-importes-ayuda"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Moneda de destino</span>
        <select
          name="destinationCurrency"
          required
          value={destination}
          onChange={(event) =>
            setDestination(event.target.value as Currency | "")
          }
          className={control}
        >
          <option value="" disabled>
            Elegí una moneda
          </option>
          {currencies
            .filter((code) => code !== source)
            .map((code) => (
              <option key={code}>{code}</option>
            ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>Importe recibido</span>
        <input
          key={destination}
          name="destinationAmount"
          required
          inputMode="decimal"
          maxLength={22}
          autoComplete="off"
          placeholder="0,00"
          className={control}
          aria-describedby="cambio-importes-ayuda"
        />
      </label>
      <p
        id="cambio-importes-ayuda"
        className="text-xs text-muted-foreground sm:col-span-2"
      >
        Sin separador de miles, hasta 4 decimales.
      </p>
    </>
  );
}
