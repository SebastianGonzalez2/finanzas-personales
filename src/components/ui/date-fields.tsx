"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { isCalendarDate, isCalendarMonth } from "@/domain/bank-balances";
import { cn } from "@/lib/utils";
import { formatBankReference as displayDate } from "@/domain/bank-balances";

const dateHint =
  "Usá el formato día, mes y año (DD/MM/AAAA). Podés escribir los ocho dígitos sin barras.";
const monthNames = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parseDate(text: string) {
  const parts =
    text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) ??
    text.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!parts) return "";
  const [, day, month, year] = parts;
  const iso = `${year}-${month}-${day}`;
  return isCalendarDate(iso) ? iso : "";
}

function useFormReset(
  ref: RefObject<HTMLInputElement | null>,
  reset: () => void,
) {
  useEffect(() => {
    const form = ref.current?.form;
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [ref, reset]);
}

type DateInputProps = {
  name?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (iso: string) => void;
  "aria-describedby"?: string;
};

/** The editable text is local; only the original ISO value participates in FormData. */
export function DateInput({
  name,
  className = "ui-control",
  disabled,
  required,
  min,
  max,
  defaultValue = "",
  value,
  onValueChange,
  "aria-describedby": describedBy,
  ...props
}: DateInputProps) {
  // El formulario padre sigue recibiendo ISO; un borrador parcial queda en el campo.
  const [edit, setEdit] = useState<{
    text: string;
    expected: string | undefined;
  }>();
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const description = useId();
  const text =
    edit && edit.expected === value
      ? edit.text
      : displayDate(value ?? defaultValue);
  if (edit && edit.expected !== value) setEdit(undefined);
  const iso = parseDate(text);
  const error = !text
    ? required
      ? "Ingresá una fecha."
      : ""
    : !iso
      ? "Ingresá una fecha válida en formato DD/MM/AAAA."
      : min && iso < min
        ? `Ingresá una fecha desde el ${displayDate(min)}.`
        : max && iso > max
          ? `Ingresá una fecha hasta el ${displayDate(max)}.`
          : "";
  useFormReset(input, () => {
    setEdit(undefined);
    setTouched(false);
  });

  return (
    <>
      <input
        {...props}
        className={className}
        ref={(element) => {
          input.current = element;
          element?.setCustomValidity(error);
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA"
        disabled={disabled}
        required={required}
        aria-describedby={cn(describedBy, description)}
        aria-invalid={touched && Boolean(error) ? true : undefined}
        value={text}
        onChange={(event) => {
          const next = event.currentTarget.value;
          const parsed = parseDate(next);
          setEdit({
            text: parsed ? displayDate(parsed) : next,
            expected: value === undefined ? undefined : parsed,
          });
          onValueChange?.(parsed);
        }}
        onBlur={() => setTouched(true)}
        onInvalid={() => setTouched(true)}
      />
      <span id={description} hidden>
        {touched && error ? error : dateHint}
      </span>
      {name && (
        <input type="hidden" name={name} value={iso} disabled={disabled} />
      )}
    </>
  );
}

type MonthFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  variant?: "glaciar" | "history";
};

function displayMonth(iso: string) {
  const [year, month] = iso.split("-");
  return `${monthNames[Number(month) - 1]} de ${year}`;
}

export function MonthField({
  label,
  name,
  defaultValue = "",
  min,
  max,
  className,
  disabled,
  required,
  variant = "glaciar",
}: MonthFieldProps) {
  const [initialYear = "", initialMonth = ""] = defaultValue.split("-");
  const [selected, setSelected] = useState<{ month: string; year: string }>();
  const month = selected?.month ?? initialMonth;
  const year = selected?.year ?? initialYear;
  const [touched, setTouched] = useState(false);
  const yearInput = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const monthErrorId = useId();
  const yearErrorId = useId();
  const candidate = `${year}-${month}`;
  const iso = isCalendarMonth(candidate) ? candidate : "";
  const monthError =
    !month && (required || year)
      ? "Elegí un mes."
      : iso && min && iso < min
        ? `Elegí un mes desde ${displayMonth(min)}.`
        : iso && max && iso > max
          ? `Elegí un mes hasta ${displayMonth(max)}.`
          : "";
  const yearError = !year
    ? required || month
      ? "Ingresá un año."
      : ""
    : !/^(?!0000)\d{4}$/.test(year)
      ? "Ingresá un año de cuatro dígitos."
      : "";
  useFormReset(yearInput, () => {
    setSelected(undefined);
    setTouched(false);
  });

  function validationProps(error: string, id: string) {
    return {
      "aria-invalid": touched && Boolean(error) ? true : undefined,
      "aria-describedby": touched && error ? id : undefined,
      onInvalid: () => setTouched(true),
    };
  }

  return (
    <div
      className={cn(
        variant === "glaciar"
          ? "ui-field"
          : "grid min-w-0 gap-1 text-sm font-medium",
        className,
      )}
    >
      <span
        id={labelId}
        className={variant === "glaciar" ? "ui-field__label" : undefined}
      >
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="ui-month-controls">
        <select
          aria-label="Mes"
          className="ui-control"
          ref={(element) => element?.setCustomValidity(monthError)}
          {...validationProps(monthError, monthErrorId)}
          value={month}
          disabled={disabled}
          required={required}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setSelected({ month: next, year: !next && !required ? "" : year });
          }}
        >
          <option value="">Elegí</option>
          {monthNames.map((name, index) => (
            <option value={String(index + 1).padStart(2, "0")} key={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label="Año"
          className="ui-control"
          ref={(element) => {
            yearInput.current = element;
            element?.setCustomValidity(yearError);
          }}
          {...validationProps(yearError, yearErrorId)}
          type="text"
          autoComplete="off"
          inputMode="numeric"
          placeholder="AAAA"
          value={year}
          disabled={disabled}
          required={required}
          onChange={(event) =>
            setSelected({ month, year: event.currentTarget.value })
          }
        />
        <span id={monthErrorId} hidden>
          {monthError}
        </span>
        <span id={yearErrorId} hidden>
          {yearError}
        </span>
        <input type="hidden" name={name} value={iso} disabled={disabled} />
      </div>
    </div>
  );
}
