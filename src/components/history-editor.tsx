"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { type HistoryEntry } from "@/domain/history";
import {
  conceptLimit,
  movementMethods,
  noteLimit,
  type MovementCategory,
} from "@/domain/movements";
import type { Currency } from "@/domain/money";
import { useFinancialCommand } from "./financial-command";
import {
  historyButton,
  historyControl,
  HistoryField,
  historyPrimary,
} from "./history-fields";

function CurrencyField({
  name,
  label,
  value,
  currencies,
}: {
  name: string;
  label: string;
  value: Currency | null;
  currencies: Currency[];
}) {
  return (
    <HistoryField label={label}>
      <select
        name={name}
        defaultValue={value ?? ""}
        required
        className={historyControl}
      >
        {currencies.map((code) => (
          <option key={code}>{code}</option>
        ))}
      </select>
    </HistoryField>
  );
}

export function HistoryEditor({
  entry,
  categories,
  currencies,
  today,
}: {
  entry: HistoryEntry;
  categories: MovementCategory[];
  currencies: Currency[];
  today: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"edit" | "void" | null>(null);
  const [done, setDone] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const voidButton = useRef<HTMLButtonElement>(null);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/movements",
    "PATCH",
  );
  const transfer = entry.kind === "bank_transfer";

  function begin(next: "edit" | "void") {
    setAction(next);
    requestAnimationFrame(() => editorHeading.current?.focus());
  }

  function cancel() {
    const trigger = action === "edit" ? editButton : voidButton;
    clearError();
    setAction(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const movement = {
      kind: entry.kind,
      ...Object.fromEntries(new FormData(event.currentTarget)),
    };
    if (
      await send(
        action === "edit"
          ? { action, eventId: entry.id, movement }
          : { action, eventId: entry.id },
      )
    ) {
      setDone(true);
      router.refresh();
    }
  }

  if (done)
    return <p role="status">Cambio guardado. Actualizando el registro…</p>;

  return (
    <section
      className="grid gap-3 border-t pt-4"
      aria-label="Acciones del movimiento"
    >
      {!action ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={historyButton}
            ref={editButton}
            onClick={() => begin("edit")}
          >
            Editar movimiento
          </button>
          <button
            type="button"
            className={historyButton}
            ref={voidButton}
            onClick={() => begin("void")}
          >
            Anular registro
          </button>
        </div>
      ) : (
        <form className="grid gap-3" onSubmit={submit}>
          <h2 ref={editorHeading} tabIndex={-1} className="font-semibold">
            {action === "edit" ? "Corregir movimiento" : "Confirmar anulación"}
          </h2>
          {action === "edit" ? (
            <fieldset
              disabled={pending || uncertain}
              className="grid min-w-0 gap-3 sm:grid-cols-2"
            >
              <HistoryField label="Fecha">
                <input
                  type="date"
                  name="effectiveOn"
                  required
                  max={today}
                  defaultValue={entry.effectiveOn}
                  className={historyControl}
                />
              </HistoryField>
              {transfer ? (
                <>
                  <CurrencyField
                    name="sourceCurrency"
                    label="Moneda entregada"
                    value={entry.currency}
                    currencies={currencies}
                  />
                  <HistoryField label="Importe entregado">
                    <input
                      name="sourceAmount"
                      inputMode="decimal"
                      required
                      defaultValue={entry.amount}
                      className={historyControl}
                    />
                  </HistoryField>
                  <CurrencyField
                    name="destinationCurrency"
                    label="Moneda recibida"
                    value={entry.otherCurrency}
                    currencies={currencies}
                  />
                  <HistoryField label="Importe recibido">
                    <input
                      name="destinationAmount"
                      inputMode="decimal"
                      required
                      defaultValue={entry.otherAmount ?? ""}
                      className={historyControl}
                    />
                  </HistoryField>
                </>
              ) : (
                <>
                  <CurrencyField
                    name="currency"
                    label="Moneda"
                    value={entry.currency}
                    currencies={currencies}
                  />
                  <HistoryField label="Importe">
                    <input
                      name="amount"
                      inputMode="decimal"
                      required
                      defaultValue={entry.amount}
                      className={historyControl}
                    />
                  </HistoryField>
                  <HistoryField label="Medio">
                    <select
                      name="method"
                      defaultValue={entry.method ?? ""}
                      className={historyControl}
                    >
                      {Object.entries(movementMethods)
                        .filter(
                          ([method]) =>
                            (method === "deposit") ===
                            (entry.kind === "income"),
                        )
                        .map(([method, label]) => (
                          <option key={method} value={method}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </HistoryField>
                  <HistoryField label="Concepto">
                    <input
                      name="concept"
                      maxLength={conceptLimit}
                      required={entry.kind === "expense"}
                      defaultValue={entry.concept}
                      className={historyControl}
                    />
                  </HistoryField>
                  <HistoryField label="Categoría">
                    <select
                      name="categoryId"
                      defaultValue={entry.categoryId ?? ""}
                      className={historyControl}
                    >
                      <option value="">Sin categorizar</option>
                      {entry.categoryId &&
                        !categories.some(
                          ({ id }) => id === entry.categoryId,
                        ) && (
                          <option value={entry.categoryId}>
                            {entry.category}
                          </option>
                        )}
                      {categories.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </HistoryField>
                  <HistoryField label="Nota">
                    <textarea
                      name="note"
                      maxLength={noteLimit}
                      defaultValue={entry.note ?? ""}
                      className={historyControl}
                    />
                  </HistoryField>
                </>
              )}
            </fieldset>
          ) : (
            <p className="text-sm">
              El registro quedará anulado en la app y conservará su traza. La
              operación en el banco sigue vigente.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Bancos y los totales se recalculan cuando corresponde. Los saldos
            confirmados se conservan y las diferencias quedan en Conciliación.
          </p>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={historyPrimary} disabled={pending}>
              {pending
                ? "Guardando…"
                : uncertain
                  ? "Reintentar mismo envío"
                  : action === "edit"
                    ? "Guardar corrección"
                    : "Confirmar anulación"}
            </button>
            <button
              type="button"
              className={historyButton}
              disabled={pending || uncertain}
              onClick={cancel}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
