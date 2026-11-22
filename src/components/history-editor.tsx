"use client";

import { DateInput } from "./ui/date-fields";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { CategoryAllocation } from "@/domain/classification";
import { AllocationFields, formClassification } from "./classification-fields";
import { type HistoryEntry } from "@/domain/history";
import type { CatalogCategory } from "@/domain/categories";
import { CategorySelect } from "./category-select";
import { conceptLimit, noteLimit } from "@/domain/movements";
import type { Currency } from "@/domain/money";
import { bankCurrencies } from "@/domain/bank-balances";
import type { InstallmentVersion } from "@/domain/installments";
import { formInstallmentPlan, InstallmentFields } from "./installment-fields";
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
  onChange,
}: {
  name: string;
  label: string;
  value: Currency | null;
  currencies: Currency[];
  onChange?: (currency: Currency) => void;
}) {
  return (
    <HistoryField label={label}>
      <select
        name={name}
        defaultValue={value ?? ""}
        onChange={
          onChange
            ? (event) => onChange(event.target.value as Currency)
            : undefined
        }
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
  classification,
  categories,
  today,
  plan,
}: {
  entry: HistoryEntry;
  categories: CatalogCategory[];
  classification: {
    version: number;
    allocations: (CategoryAllocation & { category: string | null })[];
  } | null;
  today: string;
  plan?: InstallmentVersion;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"edit" | "void" | null>(null);
  const [currency, setCurrency] = useState(entry.currency);
  const [amount, setAmount] = useState(entry.amount);
  const [installments, setInstallments] = useState(!!plan);
  const [done, setDone] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const voidButton = useRef<HTMLButtonElement>(null);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/movements",
    "PATCH",
  );

  function begin(next: "edit" | "void") {
    setCurrency(entry.currency);
    setAmount(entry.amount);
    setInstallments(!!plan);
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
    const form = new FormData(event.currentTarget);
    const fields = formClassification(form);
    const terms = formInstallmentPlan(form);
    const allocations =
      fields.allocations ??
      (classification?.allocations.length ? [] : undefined);
    const movement = {
      kind: entry.kind,
      ...Object.fromEntries(form),
      ...(allocations && { allocations }),
      ...(terms && { plan: terms }),
    };
    if (
      await send(
        action === "edit"
          ? {
              action,
              eventId: entry.id,
              movement,
              ...(allocations && {
                classificationVersion: classification?.version,
              }),
            }
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
                <DateInput
                  name="effectiveOn"
                  required
                  max={today}
                  defaultValue={entry.effectiveOn}
                  className={historyControl}
                />
              </HistoryField>
              {
                <>
                  <CurrencyField
                    name="currency"
                    onChange={setCurrency}
                    label="Moneda"
                    value={entry.currency}
                    currencies={[...bankCurrencies]}
                  />
                  {entry.kind === "expense" && (
                    <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                      <input
                        type="checkbox"
                        name="installments"
                        checked={installments}
                        onChange={(event) =>
                          setInstallments(event.target.checked)
                        }
                        className="size-5"
                      />
                      <span>En cuotas</span>
                    </label>
                  )}
                  {entry.kind === "expense" && installments ? (
                    <InstallmentFields
                      currency={currency}
                      firstPeriod={
                        plan?.firstPeriod ?? entry.effectiveOn.slice(0, 7)
                      }
                      installmentAmount={plan?.installmentAmount}
                      count={plan?.count}
                    />
                  ) : (
                    <HistoryField label="Importe">
                      <input
                        name="amount"
                        inputMode="decimal"
                        required
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className={historyControl}
                      />
                    </HistoryField>
                  )}
                  {/* Conserva el medio heredado; un gasto nuevo no lo indica. */}
                  <input
                    type="hidden"
                    name="method"
                    value={entry.method ?? ""}
                  />
                  <HistoryField label="Concepto">
                    <input
                      name="concept"
                      maxLength={conceptLimit}
                      required={entry.kind === "expense"}
                      defaultValue={entry.concept}
                      className={historyControl}
                    />
                  </HistoryField>
                  <AllocationFields
                    categories={categories}
                    available={!!classification}
                    initial={classification?.allocations}
                  >
                    <CategorySelect
                      kind="expense"
                      categories={categories}
                      labelClassName="grid min-w-0 gap-1 text-sm font-medium"
                      labelText="Categoría"
                      controlClassName={historyControl}
                      defaultValue={entry.categoryId ?? ""}
                      unlisted={
                        entry.categoryId
                          ? {
                              value: entry.categoryId,
                              label: `${entry.category ?? "Categoría"} (archivada)`,
                            }
                          : null
                      }
                    />
                  </AllocationFields>
                  <HistoryField label="Nota">
                    <textarea
                      name="note"
                      maxLength={noteLimit}
                      defaultValue={entry.note ?? ""}
                      className={historyControl}
                    />
                  </HistoryField>
                </>
              }
            </fieldset>
          ) : (
            <p className="text-sm">
              El registro quedará anulado y conservará su traza.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Estadísticas y presupuestos se recalculan con el cambio.
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
