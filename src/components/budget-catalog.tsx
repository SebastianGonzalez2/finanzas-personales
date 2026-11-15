"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import {
  parseBudgetAmount,
  parseBudgetCommand,
  type Budget,
} from "@/domain/budgets";
import type { CatalogCategory } from "@/domain/categories";
import { CategorySelect } from "./category-select";
import { useFinancialCommand } from "./financial-command";
import {
  EmptyState,
  FormFoot,
  FormPanel,
  PageHead,
  PageNotice,
  StateTag,
} from "./glaciar/screen";
import { Panel } from "./glaciar-summary/panel";
import { BudgetThresholdNotice } from "./notices";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Icon } from "./ui/icon";

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

function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const label = monthFormat.format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function money(amount: string, currency: string) {
  return formatBankAmount({
    amount,
    currency: currency as "UYU" | "USD" | "EUR",
  });
}

const units = (amount: string) => {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
};

// M-02 — Estados con los umbrales vigentes: rojo desde 100 % (inclusive),
// ámbar desde 80 % hasta menos de 100 %, verde por debajo y neutro cuando el
// consumo no se pudo calcular. Solo cambia la presentación.
function budgetState(budget: Budget) {
  const limit = units(budget.effectiveLimit);
  const consumed = units(budget.progress?.consumed ?? "0");
  const percent =
    limit > BigInt(0) ? (consumed * BigInt(100)) / limit : BigInt(0);
  const tone = !budget.progress
    ? ("neutral" as const)
    : percent >= BigInt(100)
      ? ("critical" as const)
      : percent >= BigInt(80)
        ? ("warning" as const)
        : ("good" as const);
  const label = {
    neutral: "Sin calcular",
    critical: "Excedido",
    warning: "Cerca del límite",
    good: "En rango",
  }[tone];
  return { percent, tone, label };
}

/** Orden visual: cada subcategoría con presupuesto queda bajo su categoría. */
function arrange(budgets: Budget[], categories: CatalogCategory[]) {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const byCategory = new Map(budgets.map((b) => [b.categoryId, b]));
  const ancestor = (budget: Budget) => {
    const seen = new Set<string>();
    let current = parentOf.get(budget.categoryId) ?? null;
    while (current && !seen.has(current)) {
      if (byCategory.has(current)) return current;
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
    return null;
  };
  const rows = budgets.map((budget) => ({ budget, parent: ancestor(budget) }));
  const ordered: { budget: Budget; nested: boolean; isSub: boolean }[] = [];
  const place = (parent: string | null, nested: boolean) => {
    for (const row of rows.filter((item) => item.parent === parent)) {
      ordered.push({
        budget: row.budget,
        nested,
        isSub: !!parentOf.get(row.budget.categoryId),
      });
      place(row.budget.categoryId, true);
    }
  };
  place(null, false);
  return ordered;
}

export function BudgetCatalog({
  budgets,
  categories,
  today,
  viewedMonth,
}: {
  budgets: Budget[];
  categories: CatalogCategory[];
  today: string;
  viewedMonth: string;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const [refreshing, startRefresh] = useTransition();
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = monthOptions(today);
  const budgeted = new Set(budgets.map(({ categoryId }) => categoryId));
  const historical = viewedMonth !== today.slice(0, 7);
  const editingDisabled = editor !== null || historical || refreshing;
  const rows = arrange(budgets, categories);

  useEffect(() => {
    if (message && !refreshing) add.current?.focus();
  }, [message, refreshing]);

  function openEditor(next: Editor, from: HTMLButtonElement) {
    trigger.current = from;
    setMessage("");
    setEditor(next);
  }

  function close(result?: string) {
    setEditor(null);
    if (result) {
      setMessage(result);
      startRefresh(() => router.refresh());
      return;
    }
    requestAnimationFrame(() => trigger.current?.focus());
  }

  const previous = shiftMonth(viewedMonth, -1);
  const next = shiftMonth(viewedMonth, 1);

  return (
    <>
      <PageHead
        eyebrow="Planificación"
        title="Presupuestos"
        description="Límites mensuales opcionales por categoría, sin arrastre de saldos."
        actions={
          <Button
            ref={add}
            variant="primary"
            disabled={editingDisabled}
            onClick={(event) =>
              openEditor({ action: "create" }, event.currentTarget)
            }
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Crear presupuesto
          </Button>
        }
      />
      <nav aria-label="Elegir mes" className="gs-nav">
        <div className="lab-stepper">
          {editor ? (
            <button
              type="button"
              className="lab-stepper__btn"
              aria-label="Mes anterior"
              disabled
            >
              <Icon name="chevronLeft" duotone={false} className="size-4" />
            </button>
          ) : (
            <Link
              href={`/presupuestos?month=${previous}`}
              className="lab-stepper__btn"
              aria-label="Mes anterior"
            >
              <Icon name="chevronLeft" duotone={false} className="size-4" />
            </Link>
          )}
          <span className="lab-stepper__label">
            <Icon name="calendar" className="size-4" />
            {monthLabel(viewedMonth)}
          </span>
          {editor ? (
            <button
              type="button"
              className="lab-stepper__btn"
              aria-label="Mes siguiente"
              disabled
            >
              <Icon name="chevronRight" duotone={false} className="size-4" />
            </button>
          ) : (
            <Link
              href={`/presupuestos?month=${next}`}
              className="lab-stepper__btn"
              aria-label="Mes siguiente"
            >
              <Icon name="chevronRight" duotone={false} className="size-4" />
            </Link>
          )}
        </div>
        <form method="get" className="gs-kpi__form">
          <Field label="Mes del presupuesto">
            <Input
              type="month"
              name="month"
              required
              defaultValue={viewedMonth}
              disabled={editor !== null}
            />
          </Field>
          <Button type="submit" disabled={editor !== null}>
            Ver mes
          </Button>
        </form>
      </nav>
      {historical && (
        <PageNotice
          tone="info"
          message="Vista de otro mes. Para editar límites, volvé al mes actual."
        />
      )}
      <p role="status" className={message ? "text-sm" : "sr-only"}>
        {message}
      </p>
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
      {budgets.length === 0 ? (
        <EmptyState icon="budgets" title="Sin presupuestos en este mes">
          Todavía no tenés presupuestos. Podés crear uno por categoría de gasto
          cuando quieras; los avisos llegan al 80 % y al 100 % del límite.
        </EmptyState>
      ) : (
        <div className="gs-grid">
          <div className="gs-lane-main gs-stack">
            <Panel
              id="presupuestos-mes"
              title="Presupuestos del mes"
              icon="budgets"
              action={
                <span className="lab-muted text-xs">
                  {monthLabel(viewedMonth)}
                </span>
              }
            >
              <ul className="gs-budgets">
                {rows.map(({ budget, nested, isSub }) => (
                  <BudgetEntry
                    key={budget.id}
                    budget={budget}
                    options={options}
                    nested={nested}
                    isSub={isSub}
                    disabled={editingDisabled}
                    edit={(from) =>
                      openEditor({ action: "edit", budget }, from)
                    }
                    except={(from) =>
                      openEditor({ action: "exception", budget }, from)
                    }
                    remove={(from) =>
                      openEditor({ action: "remove", budget }, from)
                    }
                  />
                ))}
              </ul>
            </Panel>
          </div>
          <div className="gs-lane-side gs-stack">
            <HowItWorks />
            <QuoteEditor today={today} />
          </div>
        </div>
      )}
      {budgets.length === 0 && <QuoteEditor today={today} />}
    </>
  );
}

function HowItWorks() {
  return (
    <section className="lab-panel" aria-label="Cómo funcionan los presupuestos">
      <div className="b-notice b-notice--info">
        <Icon name="info" className="size-4.5 shrink-0" />
        <p className="gs-notice-text">
          El seguimiento se reinicia cada mes sin arrastrar sobrantes ni
          excesos. Los gastos de subcategorías también consumen el límite de la
          categoría general.
        </p>
      </div>
    </section>
  );
}

function BudgetEntry({
  budget,
  options,
  nested,
  isSub,
  disabled,
  edit,
  except,
  remove,
}: {
  budget: Budget;
  options: { key: string; label: string }[];
  nested?: boolean;
  isSub?: boolean;
  disabled?: boolean;
  edit: (from: HTMLButtonElement) => void;
  except: (from: HTMLButtonElement) => void;
  remove: (from: HTMLButtonElement) => void;
}) {
  const { percent, tone, label } = budgetState(budget);
  const fill = Number(percent > BigInt(100) ? BigInt(100) : percent);
  const exceptionMonth = budget.exception
    ? (options.find(({ key }) => key === budget.exception?.month)?.label ??
      budget.exception.month)
    : null;
  return (
    <li className={`gs-budget ${nested ? "gs-budget--sub" : ""}`}>
      <div className="gs-budget__head">
        <div className="min-w-0">
          <h3 className="gs-budget__name">
            {budget.categoryName}
            {isSub && <span className="gs-budget__sub"> · subcategoría</span>}
          </h3>
          <p className="lab-muted text-xs">{budget.currency}</p>
        </div>
        <StateTag tone={tone}>{label}</StateTag>
      </div>
      {budget.progress && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fill}
          aria-valuetext={`${percent} % del límite`}
          aria-label={`Consumo de ${budget.categoryName}`}
          className={`lab-meter lab-meter--${tone}`}
        >
          <span style={{ width: `${fill}%` }} />
        </div>
      )}
      <dl className="gs-budget__stats text-sm">
        <div className="gs-budget__foot">
          <dt>Consumo del mes</dt>
          <dd className={tone === "neutral" ? "" : `gs-tone--${tone}`}>
            {budget.progress
              ? `${money(budget.progress.consumed, budget.currency)} de ${money(budget.effectiveLimit, budget.currency)} (${percent}%)`
              : "Falta cotización: consumo sin calcular"}
          </dd>
        </div>
        <div className="gs-budget__foot">
          <dt>Límite habitual</dt>
          <dd className="tabular-nums">
            {money(budget.monthlyLimit, budget.currency)}
          </dd>
        </div>
      </dl>
      <div className="gs-budget__lines">
        {!budget.progress && (
          <p>
            Agregá una cotización manual para las monedas de tus gastos, con
            fecha anterior o igual al gasto. En cuotas se usa la fecha de
            registro de la compra.
          </p>
        )}
        {budget.references.map((ref, index) => (
          <p key={index}>
            Referencia {ref.source} del {ref.date}: 1 {ref.fromCurrency} ={" "}
            {ref.rate} {budget.currency}.
          </p>
        ))}
        <p>
          Límite efectivo del mes siguiente:{" "}
          {budget.nextLimit
            ? money(budget.nextLimit.amount, budget.nextLimit.currency)
            : "Sin presupuesto"}
          .
        </p>
        {budget.exception && (
          <p className="wrap-anywhere">
            Excepción para {exceptionMonth}:{" "}
            <strong>{money(budget.exception.limit, budget.currency)}</strong>.
            El mes siguiente vuelve automáticamente al límite habitual.
          </p>
        )}
      </div>
      {percent >= BigInt(80) && (
        <BudgetThresholdNotice
          categoryName={budget.categoryName}
          percent={Number(percent)}
          state={percent >= BigInt(100) ? "danger" : "warning"}
          className={`gs-budget__alert ${percent >= BigInt(100) ? "gs-tone--critical" : "gs-tone--warning"}`}
        />
      )}
      <div className="gs-budget__actions">
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={`Editar el presupuesto de ${budget.categoryName}`}
          onClick={(event) => edit(event.currentTarget)}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          aria-label={`Cambiar el límite solo un mes en ${budget.categoryName}`}
          onClick={(event) => except(event.currentTarget)}
        >
          Solo un mes
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          aria-label={`Quitar el presupuesto de ${budget.categoryName}`}
          onClick={(event) => remove(event.currentTarget)}
        >
          Quitar
        </Button>
      </div>
    </li>
  );
}

function BudgetEditor({
  categories,
  budgeted,
  budget,
  close,
}: {
  categories: CatalogCategory[];
  budgeted: Set<string>;
  budget?: Budget;
  close: (message?: string) => void;
}) {
  const [validation, setValidation] = useState("");
  const [previewCurrency, setPreviewCurrency] = useState(
    budget?.currency ?? "UYU",
  );
  const [previewAmount, setPreviewAmount] = useState(
    budget?.monthlyLimit ?? "",
  );
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
    if (uncertain) {
      if (await send({})) close("Presupuesto guardado.");
      return;
    }
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
    <FormPanel
      labelId="titulo-editor-presupuesto"
      headingRef={heading}
      title={
        budget
          ? `Editar presupuesto · ${budget.categoryName}`
          : "Crear presupuesto"
      }
      description={
        budget
          ? undefined
          : "El límite rige desde este mes. Los gastos de subcategorías también consumen el límite de la categoría general."
      }
    >
      <form
        method="post"
        action="/api/budgets"
        aria-labelledby="titulo-editor-presupuesto"
        onSubmit={submit}
        className="grid gap-4"
      >
        <div className="gs-form__grid gs-form__grid--3">
          {budget ? (
            <p className="self-end text-sm">
              Categoría: <strong>{budget.categoryName}</strong>
            </p>
          ) : (
            <CategorySelect
              kind="expense"
              categories={categories}
              excludedIds={budgeted}
              controlClassName="ui-control"
              labelClassName="ui-field gs-cat-field"
              labelText="Categoría de gasto"
              name="category"
              optional={false}
            />
          )}
          <Field label="Moneda del límite">
            <Select
              name="currency"
              defaultValue={budget?.currency ?? "UYU"}
              onChange={(event) =>
                setPreviewCurrency(event.target.value as Budget["currency"])
              }
              disabled={pending || uncertain}
            >
              {bankCurrencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Límite mensual">
            <Input
              name="amount"
              inputMode="decimal"
              maxLength={21}
              required
              defaultValue={budget?.monthlyLimit}
              disabled={pending || uncertain}
              onChange={(event) => setPreviewAmount(event.target.value)}
            />
          </Field>
        </div>
        <p className="gs-hint">
          Al editar el importe o la moneda, el nuevo límite rige desde este mes
          en adelante; los meses anteriores conservan su valor histórico. No
          convertimos automáticamente el importe anterior.
        </p>
        {budget && parseBudgetAmount(previewAmount) && (
          <p className="text-sm" role="status">
            Vista previa: este mes{" "}
            {money(
              previewCurrency === budget.currency && budget.exception
                ? budget.exception.limit
                : parseBudgetAmount(previewAmount)!,
              previewCurrency,
            )}
            ; mes siguiente{" "}
            {money(
              previewCurrency === budget.currency && budget.nextLimit?.exception
                ? budget.nextLimit.amount
                : parseBudgetAmount(previewAmount)!,
              previewCurrency,
            )}
            .
            {previewCurrency !== budget.currency &&
              " El cambio de moneda deja sin efecto las excepciones actuales y futuras en la moneda anterior; su historial se conserva."}
          </p>
        )}
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <FormFoot>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => {
              clearError();
              close();
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : "Guardar"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
  );
}

function QuoteEditor({ today }: { today: string }) {
  const [validation, setValidation] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/budgets",
    "POST",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uncertain) {
      if (await send({})) {
        setMessage("Cotización manual guardada.");
        router.refresh();
      }
      return;
    }
    const form = new FormData(event.currentTarget);
    const data = {
      action: "quote",
      fromCurrency: String(form.get("fromCurrency")),
      toCurrency: String(form.get("toCurrency")),
      rate: String(form.get("rate")).trim().replace(",", "."),
      effectiveOn: String(form.get("effectiveOn")),
    };
    if (
      "error" in
      parseBudgetCommand(
        { ...data, idempotencyKey: crypto.randomUUID() },
        today,
      )
    ) {
      setValidation(
        "Revisá monedas distintas, tasa positiva (hasta 8 decimales) y fecha no futura.",
      );
      return;
    }
    setValidation("");
    if (await send(data)) {
      setMessage(
        "Cotización manual guardada. Las conversiones ya calculadas conservan su referencia.",
      );
      router.refresh();
    }
  }
  return (
    <details className="lab-panel" id="cotizacion">
      <summary className="lab-panel__title cursor-pointer">
        Cotización manual para presupuestos
      </summary>
      <p className="lab-muted my-3 text-sm">
        Indicá cuánto vale una unidad de la moneda de origen en la moneda del
        presupuesto. Solo se utiliza para equivalencias; no mueve dinero. No
        reemplaza referencias ya utilizadas.
      </p>
      <form onSubmit={submit} className="grid gap-4">
        <fieldset
          disabled={pending || uncertain}
          className="gs-form__grid min-w-0"
        >
          <Field label="Moneda de origen">
            <Select name="fromCurrency" defaultValue="USD">
              {bankCurrencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Moneda de destino">
            <Select name="toCurrency" defaultValue="UYU">
              {bankCurrencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tasa de referencia">
            <Input name="rate" required inputMode="decimal" maxLength={17} />
          </Field>
          <Field label="Fecha de cotización">
            <Input
              name="effectiveOn"
              required
              type="date"
              defaultValue={today}
              max={today}
            />
          </Field>
        </fieldset>
        <p role="alert">{validation || error}</p>
        <p role="status">{message}</p>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={pending}
        >
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar cotización"
              : "Guardar cotización manual"}
        </Button>
      </form>
    </details>
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
    if (uncertain) {
      if (await send({}))
        close("Excepción guardada. Solo cambia el límite de ese mes.");
      return;
    }
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
    <FormPanel
      labelId="titulo-excepcion-presupuesto"
      headingRef={heading}
      title={`Cambiar límite solo un mes · ${budget.categoryName}`}
    >
      <form
        method="post"
        action="/api/budgets"
        aria-labelledby="titulo-excepcion-presupuesto"
        onSubmit={submit}
        className="grid gap-4"
      >
        <div className="gs-form__grid">
          <Field label="Mes de la excepción">
            <Select
              name="month"
              defaultValue={budget.exception?.month ?? options[0].key}
              disabled={pending || uncertain}
            >
              {options.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Límite solo para ese mes (${budget.currency})`}>
            <Input
              name="amount"
              inputMode="decimal"
              maxLength={21}
              required
              defaultValue={budget.exception?.limit ?? budget.monthlyLimit}
              disabled={pending || uncertain}
            />
          </Field>
        </div>
        <p className="gs-hint">
          El límite habitual de {money(budget.monthlyLimit, budget.currency)}{" "}
          queda intacto y vuelve automáticamente al mes siguiente, sin arrastrar
          cambios a meses históricos.
        </p>
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <FormFoot>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => {
              clearError();
              close();
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : "Guardar"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
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
    <FormPanel
      labelId="titulo-quitar-presupuesto"
      headingRef={heading}
      title={`Quitar presupuesto · ${budget.categoryName}`}
    >
      <form
        method="post"
        action="/api/budgets"
        aria-labelledby="titulo-quitar-presupuesto"
        onSubmit={submit}
        className="grid gap-4"
      >
        <p className="gs-confirm">
          Se quita el límite de {money(budget.monthlyLimit, budget.currency)}{" "}
          mensuales para {budget.categoryName}. No se modifican gastos, saldos
          ni movimientos.
        </p>
        <p role="alert" className={error ? "text-sm" : "sr-only"}>
          {error}
        </p>
        <FormFoot>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => {
              clearError();
              close();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="outline"
            className="gs-btn-danger"
            disabled={pending}
          >
            {pending
              ? "Quitando…"
              : uncertain
                ? "Reintentar envío"
                : "Confirmar"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
  );
}
