"use client";

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
import { Card } from "./ui/card";

const field = "h-11 w-full rounded-md border bg-background px-3";
const label = "grid min-w-0 gap-1 text-sm font-medium";

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
  const [kind, setKind] = useState("expense");
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
      setKind("expense");
      setShared(false);
      setFrequency(defaultRecurrenceFrequency);
      setFirstPeriod(today);
      setDateMode("none");
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <Card className="p-4">
      <form
        method="post"
        action="/api/recurrences"
        onSubmit={submit}
        onChange={() => setSaved(false)}
        className="grid gap-4"
        aria-labelledby="nueva-recurrencia"
      >
        <h2 id="nueva-recurrencia" className="text-lg font-semibold">
          Nueva recurrencia
        </h2>
        <fieldset
          disabled={pending || uncertain}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className={label}>
            Tipo
            <select
              className={field}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
          </label>
          <label className={label}>
            Concepto
            <input
              className={field}
              name="concept"
              required
              maxLength={conceptLimit}
            />
          </label>
          <CategorySelect
            key={kind}
            kind={kind as MovementKind}
            categories={categories}
            controlClassName={field}
            labelClassName={label}
            labelText="Categoría"
          />
          <label className={label}>
            Moneda
            <select className={field} name="currency">
              {bankCurrencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Importe de referencia (opcional)
            <input
              className={field}
              name="referenceAmount"
              inputMode="decimal"
              maxLength={21}
            />
          </label>
          <label className={label}>
            Frecuencia
            <select
              className={field}
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
            </select>
          </label>
          <label className={label}>
            Comienza en
            <input
              className={field}
              type="date"
              value={firstPeriod}
              min="0001-01-01"
              max="9999-12-31"
              required
              onChange={(event) => setFirstPeriod(event.target.value)}
            />
          </label>
          <label className={label}>
            Finaliza el (opcional)
            <input
              className={field}
              name="endDate"
              type="date"
              min={firstPeriod || "0001-01-01"}
              max="9999-12-31"
            />
          </label>
          <label className={label}>
            Vencimiento
            <select
              className={field}
              value={dateMode}
              onChange={(event) => setDateMode(event.target.value)}
            >
              <option value="none">Sin fecha</option>
              <option value="approximate">Fecha aproximada</option>
              <option value="exact">Fecha exacta</option>
            </select>
          </label>
          {dateMode === "exact" && frequency !== "weekly" && (
            <label className={label}>
              Día habitual desde el segundo período
              <input
                className={field}
                type="number"
                name="dueDay"
                min={1}
                max={31}
                placeholder={firstPeriod.slice(8)}
              />
            </label>
          )}
          {kind === "expense" && people && (
            <>
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
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
          <label className={`${label} sm:col-span-2`}>
            Nota (opcional)
            <textarea
              className="min-h-16 rounded-md border bg-background p-3"
              name="note"
              maxLength={noteLimit}
            />
          </label>
        </fieldset>
        {first && (
          <p className="text-sm text-muted-foreground">
            Primer período {first.key} ·{" "}
            {dateMode === "exact" ? "Vence" : "Comienza"} el{" "}
            {formatBankReference(firstPeriod)}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm">
            Recurrencia guardada.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 justify-self-start rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
        >
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar guardado"
              : "Guardar recurrencia"}
        </button>
      </form>
    </Card>
  );
}
