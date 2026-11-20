"use client";

import { recurrencePeriodLabel } from "@/lib/recurrence-period-label";
import { DateInput } from "./ui/date-fields";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { bankCurrencies, formatBankReference } from "@/domain/bank-balances";
import { conceptLimit, noteLimit, type MovementKind } from "@/domain/movements";
import {
  defaultRecurrenceFrequency,
  isRecurrenceDate,
  recurrenceFrequencies,
  recurrencePeriodAt,
  type RecurrenceFrequency,
} from "@/domain/recurrences";
import type { Person } from "@/domain/recurring-shares";
import {
  RecurringAgreementFields,
  recurringAgreement,
} from "./recurring-share-fields";
import type { CatalogCategory } from "@/domain/categories";
import { useFinancialCommand } from "./financial-command";
import { CategorySelect } from "./category-select";
import { buttonClass } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/field";
import { FormFoot } from "./glaciar/screen";

export function RecurrenceForm({
  today,
  categories,
  frequencies,
  people,
}: {
  today: string;
  categories: CatalogCategory[];
  frequencies: Record<RecurrenceFrequency, string>;
  people: Person[] | null;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/recurrences",
    "POST",
  );
  // SIMP-03: solo se crean recurrentes de gasto.
  const kind = "expense";
  const [frequency, setFrequency] = useState(defaultRecurrenceFrequency);
  const [firstPeriod, setFirstPeriod] = useState(today);
  const [dateMode, setDateMode] = useState("none");
  const [shared, setShared] = useState(false);
  const [saved, setSaved] = useState(false);
  const first = isRecurrenceDate(firstPeriod)
    ? recurrencePeriodAt({ frequency, firstPeriod }, 0)
    : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    const day = data.get("dueDay");
    if (
      await send({
        kind,
        ...(kind === "expense" &&
          shared && { usualShares: recurringAgreement(data) }),
        frequency,
        firstPeriod,
        dateMode,
        concept: data.get("concept"),
        categoryId: data.get("categoryId") || null,
        currency: data.get("currency"),
        note: data.get("note") || null,
        referenceAmount: data.get("referenceAmount") || null,
        dueDay: day ? Number(day) : null,
        endDate: data.get("endDate") || null,
      })
    ) {
      form.reset();
      setShared(false);
      setFrequency(defaultRecurrenceFrequency);
      setFirstPeriod(today);
      setDateMode("none");
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form
      method="post"
      action="/api/recurrences"
      onSubmit={submit}
      onChange={() => setSaved(false)}
      className="gs-form"
      aria-labelledby="nueva-recurrencia"
    >
      <div className="gs-form__head">
        <h2 id="nueva-recurrencia" className="gs-form__title">
          Nueva recurrencia
        </h2>
      </div>
      <fieldset
        disabled={pending || uncertain}
        className="gs-form__grid min-w-0 border-0 p-0"
      >
        <Field label="Concepto">
          <Input name="concept" required maxLength={conceptLimit} />
        </Field>
        <CategorySelect
          key={kind}
          kind={kind as MovementKind}
          categories={categories}
          controlClassName="ui-control"
          labelClassName="ui-field gs-cat-field"
          labelText="Categoría"
        />
        <Field label="Moneda">
          <Select name="currency">
            {bankCurrencies.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </Select>
        </Field>
        <Field label="Importe de referencia (opcional)">
          <Input name="referenceAmount" inputMode="decimal" maxLength={21} />
        </Field>
        <Field label="Frecuencia">
          <Select
            value={frequency}
            onChange={(event) =>
              setFrequency(event.target.value as RecurrenceFrequency)
            }
          >
            {recurrenceFrequencies.map((value) => (
              <option key={value} value={value}>
                {frequencies[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Comienza en">
          <DateInput
            value={firstPeriod}
            min="0001-01-01"
            max="9999-12-31"
            required
            onValueChange={setFirstPeriod}
          />
        </Field>
        <Field label="Finaliza el (opcional)">
          <DateInput
            name="endDate"
            min={firstPeriod || "0001-01-01"}
            max="9999-12-31"
          />
        </Field>
        <Field label="Vencimiento">
          <Select
            value={dateMode}
            onChange={(event) => setDateMode(event.target.value)}
          >
            <option value="none">Sin fecha</option>
            <option value="approximate">Fecha aproximada</option>
            <option value="exact">Fecha exacta</option>
          </Select>
        </Field>
        {dateMode === "exact" && frequency !== "weekly" && (
          <Field label="Día habitual desde el segundo período">
            <Input
              type="number"
              name="dueDay"
              min={1}
              max={31}
              placeholder={firstPeriod.slice(8)}
            />
          </Field>
        )}
        {kind === "expense" && people && (
          <>
            <label className="gs-check gs-form__full">
              <input
                type="checkbox"
                checked={shared}
                onChange={(event) => setShared(event.target.checked)}
              />
              Compartida
            </label>
            {shared && <RecurringAgreementFields people={people} />}
          </>
        )}
        <Field label="Nota (opcional)" className="gs-form__full">
          <Textarea name="note" maxLength={noteLimit} rows={2} />
        </Field>
      </fieldset>
      {first && (
        <p className="gs-hint">
          Primer período {recurrencePeriodLabel(first.key)} ·{" "}
          {dateMode === "exact" ? "Vence" : "Comienza"} el{" "}
          {formatBankReference(firstPeriod)}
        </p>
      )}
      {error && (
        <div className="b-notice b-notice--critical" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div className="b-notice b-notice--info" role="status">
          Recurrencia guardada.
        </div>
      )}
      <FormFoot>
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar guardado"
              : "Guardar recurrencia"}
        </button>
      </FormFoot>
    </form>
  );
}
