"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import { parseBudgetAmount, type Budget } from "@/domain/budgets";
import type { MovementCategory } from "@/domain/movements";
import { useFinancialCommand } from "./financial-command";
import { Card } from "./ui/card";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60";
const primary = `${button} border-primary bg-primary text-primary-foreground hover:bg-primary/85`;
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base";

type Editor =
  | { action: "create" }
  | { action: "edit"; budget: Budget }
  | { action: "exception"; budget: Budget }
  | { action: "remove"; budget: Budget };

const monthFormat = new Intl.DateTimeFormat("es", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthOptions(today: string) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: monthFormat.format(date) };
  });
}

function money(amount: string, currency: string) {
  return formatBankAmount({
    amount,
    currency: currency as "UYU" | "USD" | "EUR",
  });
}

export function BudgetCatalog({
  budgets,
  categories,
  today,
}: {
  budgets: Budget[];
  categories: MovementCategory[];
  today: string;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = monthOptions(today);
  const budgeted = new Set(budgets.map(({ categoryId }) => categoryId));

  function openEditor(next: Editor, from: HTMLButtonElement) {
    trigger.current = from;
    setMessage("");
    setEditor(next);
  }

  function close(result?: string) {
    setEditor(null);
    if (result) {
      setMessage(result);
      router.refresh();
    }
    requestAnimationFrame(() => {
      const target = result ? add.current : trigger.current;
      target?.focus();
    });
  }

  return (
    <>
      <p role="status" className={message ? "text-sm" : "sr-only"}>
        {message}
      </p>
      <button
        ref={add}
        type="button"
        className={`${primary} justify-self-start`}
        disabled={editor !== null}
        onClick={(event) =>
          openEditor({ action: "create" }, event.currentTarget)
        }
      >
        Crear presupuesto
      </button>
      {editor?.action === "create" && (
        <BudgetEditor
          categories={categories}
          budgeted={budgeted}
          close={close}
        />
      )}
      {editor?.action === "edit" && (
        <BudgetEditor
          categories={categories}
          budgeted={budgeted}
          budget={editor.budget}
          close={close}
        />
      )}
      {editor?.action === "exception" && (
        <ExceptionEditor
          budget={editor.budget}
          options={options}
          close={close}
        />
      )}
      {editor?.action === "remove" && (
        <RemoveEditor budget={editor.budget} close={close} />
      )}
      <section aria-labelledby="presupuestos-mes" className="grid gap-3">
        <h2 id="presupuestos-mes" className="font-semibold">
          Presupuestos del mes
        </h2>
        <p className="text-sm text-muted-foreground">
          El seguimiento se reinicia cada mes sin arrastrar sobrantes ni
          excesos. Los gastos de subcategorías también consumen el límite de la
          categoría general.
        </p>
        {budgets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tenés presupuestos. Podés crear uno por categoría de
            gasto cuando quieras.
          </p>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {budgets.map((budget) => (
              <BudgetEntry
                key={budget.id}
                budget={budget}
                options={options}
                disabled={editor !== null}
                edit={(from) => openEditor({ action: "edit", budget }, from)}
                except={(from) =>
                  openEditor({ action: "exception", budget }, from)
                }
                remove={(from) =>
                  openEditor({ action: "remove", budget }, from)
                }
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function BudgetEntry({
  budget,
  options,
  disabled,
  edit,
  except,
  remove,
}: {
  budget: Budget;
  options: { key: string; label: string }[];
  disabled?: boolean;
  edit: (from: HTMLButtonElement) => void;
  except: (from: HTMLButtonElement) => void;
  remove: (from: HTMLButtonElement) => void;
}) {
  const limit = Number(budget.effectiveLimit);
  const consumed = budget.progress ? Number(budget.progress.consumed) : 0;
  const percent = limit > 0 ? Math.round((consumed / limit) * 100) : 0;
  const fill = Math.min(Math.max(percent, 0), 100);
  const bar =
    percent >= 100
      ? "bg-red-600"
      : percent >= 80
        ? "bg-amber-500"
        : "bg-primary";
  const exceptionMonth = budget.exception
    ? (options.find(({ key }) => key === budget.exception?.month)?.label ??
      budget.exception.month)
    : null;
  return (
    <li className="min-w-0">
      <Card className="gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold wrap-anywhere">
              {budget.categoryName}
            </h3>
            <p className="text-sm text-muted-foreground">{budget.currency}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={disabled}
              aria-label={`Editar el presupuesto de ${budget.categoryName}`}
              onClick={(event) => edit(event.currentTarget)}
            >
              Editar
            </button>
            <button
              type="button"
              className={button}
              disabled={disabled}
              aria-label={`Cambiar el límite solo un mes en ${budget.categoryName}`}
              onClick={(event) => except(event.currentTarget)}
            >
              Solo un mes
            </button>
            <button
              type="button"
              className={button}
              disabled={disabled}
              aria-label={`Quitar el presupuesto de ${budget.categoryName}`}
              onClick={(event) => remove(event.currentTarget)}
            >
              Quitar
            </button>
          </div>
        </div>
        <div className="grid gap-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.max(percent, 0), 999)}
            aria-label={`Consumo de ${budget.categoryName}`}
          >
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${bar}`}
                style={{ width: `${fill}%` }}
              />
            </div>
          </div>
          <dl className="grid gap-1 text-sm">
            <div className="flex flex-wrap justify-between gap-x-2">
              <dt className="text-muted-foreground">Consumo del mes</dt>
              <dd className="font-medium tabular-nums">
                {money(budget.progress?.consumed ?? "0.0000", budget.currency)}{" "}
                de {money(budget.effectiveLimit, budget.currency)} ({percent}%)
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-2">
              <dt className="text-muted-foreground">Límite habitual</dt>
              <dd className="font-medium tabular-nums">
                {money(budget.monthlyLimit, budget.currency)}
              </dd>
            </div>
          </dl>
          {budget.exception && (
            <p className="text-sm wrap-anywhere">
              Excepción para {exceptionMonth}:{" "}
              <strong>{money(budget.exception.limit, budget.currency)}</strong>.
              El mes siguiente vuelve automáticamente al límite habitual.
            </p>
          )}
          {percent >= 100 && (
            <p className="text-sm text-red-600">
              Límite del mes alcanzado. Podés seguir gastando: no se bloquean
              compras.
            </p>
          )}
        </div>
      </Card>
    </li>
  );
}

function BudgetEditor({
  categories,
  budgeted,
  budget,
  close,
}: {
  categories: MovementCategory[];
  budgeted: Set<string>;
  budget?: Budget;
  close: (message?: string) => void;
}) {
  const [validation, setValidation] = useState("");
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/budgets",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const available = categories.filter(
    ({ id }) => !budgeted.has(id) || id === budget?.categoryId,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = parseBudgetAmount(form.get("amount"));
    if (!amount) {
      setValidation("Ingresá un importe positivo con hasta cuatro decimales.");
      return;
    }
    const categoryId = String(form.get("category") ?? "");
    if (!budget && !categoryId) {
      setValidation("Elegí la categoría del presupuesto.");
      return;
    }
    setValidation("");
    const command = budget
      ? {
          action: "edit",
          budgetId: budget.id,
          version: budget.version,
          currency: String(form.get("currency")),
          amount,
        }
      : {
          action: "save",
          categoryId,
          currency: String(form.get("currency")),
          amount,
        };
    const saved = await send(command);
    if (saved)
      close(
        budget
          ? "Presupuesto guardado. El nuevo límite rige desde este mes."
          : "Presupuesto creado.",
      );
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 ref={heading} tabIndex={-1} className="font-semibold">
        {budget
          ? `Editar presupuesto · ${budget.categoryName}`
          : "Crear presupuesto"}
      </h2>
      <form
        method="post"
        action="/api/budgets"
        onSubmit={submit}
        className="grid gap-3"
      >
        {budget ? (
          <p className="text-sm">
            Categoría: <strong>{budget.categoryName}</strong>
          </p>
        ) : (
          <label className="grid gap-1 text-sm font-medium">
            Categoría de gasto
            <select
              className={control}
              name="category"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Elegí una categoría
              </option>
              {available.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-sm font-medium">
          Moneda del límite
          <select
            className={control}
            name="currency"
            defaultValue={budget?.currency ?? "UYU"}
            disabled={pending || uncertain}
          >
            {bankCurrencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Límite mensual
          <input
            className={control}
            name="amount"
            inputMode="decimal"
            maxLength={21}
            required
            defaultValue={budget?.monthlyLimit}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Al editar el importe o la moneda, el nuevo límite rige desde este mes
          en adelante; los meses anteriores conservan su valor histórico. No
          convertimos automáticamente el importe anterior.
        </p>
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : "Guardar"}
          </button>
          <button
            type="button"
            className={button}
            disabled={pending || uncertain}
            onClick={() => {
              clearError();
              close();
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function ExceptionEditor({
  budget,
  options,
  close,
}: {
  budget: Budget;
  options: { key: string; label: string }[];
  close: (message?: string) => void;
}) {
  const [validation, setValidation] = useState("");
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/budgets",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = parseBudgetAmount(form.get("amount"));
    if (!amount) {
      setValidation("Ingresá un importe positivo con hasta cuatro decimales.");
      return;
    }
    setValidation("");
    const saved = await send({
      action: "exception",
      budgetId: budget.id,
      version: budget.version,
      month: String(form.get("month")),
      amount,
    });
    if (saved) close("Excepción guardada. Solo cambia el límite de ese mes.");
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 ref={heading} tabIndex={-1} className="font-semibold">
        Cambiar límite solo un mes · {budget.categoryName}
      </h2>
      <form
        method="post"
        action="/api/budgets"
        onSubmit={submit}
        className="grid gap-3"
      >
        <label className="grid gap-1 text-sm font-medium">
          Mes de la excepción
          <select
            className={control}
            name="month"
            defaultValue={budget.exception?.month ?? options[0].key}
          >
            {options.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Límite solo para ese mes ({budget.currency})
          <input
            className={control}
            name="amount"
            inputMode="decimal"
            maxLength={21}
            required
            defaultValue={budget.exception?.limit ?? budget.monthlyLimit}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          El límite habitual de {money(budget.monthlyLimit, budget.currency)}{" "}
          queda intacto y vuelve automáticamente al mes siguiente, sin arrastrar
          cambios a meses históricos.
        </p>
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : "Guardar"}
          </button>
          <button
            type="button"
            className={button}
            disabled={pending || uncertain}
            onClick={() => {
              clearError();
              close();
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function RemoveEditor({
  budget,
  close,
}: {
  budget: Budget;
  close: (message?: string) => void;
}) {
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/budgets",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await send({
      action: "remove",
      budgetId: budget.id,
      version: budget.version,
    });
    if (saved)
      close("Presupuesto quitado. Los gastos y avisos quedan sin límite.");
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 ref={heading} tabIndex={-1} className="font-semibold">
        Quitar presupuesto · {budget.categoryName}
      </h2>
      <form
        method="post"
        action="/api/budgets"
        onSubmit={submit}
        className="grid gap-3"
      >
        <p className="text-sm wrap-anywhere">
          Se quita el límite de {money(budget.monthlyLimit, budget.currency)}{" "}
          mensuales para {budget.categoryName}. No se modifican gastos, saldos
          ni movimientos.
        </p>
        <p role="alert" className={error ? "text-sm" : "sr-only"}>
          {error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending
              ? "Quitando…"
              : uncertain
                ? "Reintentar envío"
                : "Confirmar"}
          </button>
          <button
            type="button"
            className={button}
            disabled={pending || uncertain}
            onClick={() => {
              clearError();
              close();
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
