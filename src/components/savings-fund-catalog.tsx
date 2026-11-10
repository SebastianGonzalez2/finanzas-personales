"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import {
  fundStatuses,
  parseFundAmount,
  type EditableFundStatus,
  type FundAvailability,
  type FundMovement,
  type SavingsFund,
} from "@/domain/savings-funds";
import { useFinancialCommand } from "./financial-command";
import { Card } from "./ui/card";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60";
const primary = `${button} border-primary bg-primary text-primary-foreground hover:bg-primary/85`;
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base";

type FundAction = FundMovement["action"];
type Editor =
  | { action: "edit"; fund?: SavingsFund }
  | { action: FundAction; fund: SavingsFund };

const movementLabels = {
  reserve: { action: "Reservar", origin: "en", confirmed: "Reserva guardada." },
  release: { action: "Liberar", origin: "de", confirmed: "Reserva liberada." },
  transfer: {
    action: "Traspasar",
    origin: "desde",
    confirmed: "Traspaso guardado.",
  },
};

export function SavingsFundCatalog({
  funds,
  availability,
}: {
  funds: SavingsFund[];
  availability: FundAvailability[] | null;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const open = funds.filter(({ status }) => status !== "closed");
  const closed = funds.filter(({ status }) => status === "closed");

  function openEditor(next: Editor, from: HTMLButtonElement) {
    trigger.current = from;
    setMessage("");
    setEditor(next);
  }

  function destinations(source: SavingsFund) {
    return open.filter(
      ({ id, currency }) => id !== source.id && currency === source.currency,
    );
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
      {availability ? (
        <Card className="gap-2 p-4">
          <h2 className="font-semibold">Disponible libre por moneda</h2>
          <dl className="grid gap-2 sm:grid-cols-3">
            {bankCurrencies.map((currency) => {
              const balance = availability.find(
                (entry) => entry.currency === currency,
              );
              return (
                <div key={currency} className="text-sm">
                  <dt className="text-muted-foreground">{currency}</dt>
                  <dd className="font-medium tabular-nums">
                    {balance
                      ? formatBankAmount(balance)
                      : "Sin saldo bancario configurado"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Las operaciones de reserva estarán disponibles cuando se actualice la
          base de datos.
        </p>
      )}
      <button
        ref={add}
        type="button"
        className={`${primary} justify-self-start`}
        disabled={editor !== null}
        onClick={(event) => openEditor({ action: "edit" }, event.currentTarget)}
      >
        Agregar fondo
      </button>
      {editor?.action === "edit" && (
        <FundEditor fund={editor.fund} close={close} />
      )}
      {editor && editor.action !== "edit" && (
        <FundMovementEditor
          action={editor.action}
          fund={editor.fund}
          destinations={destinations(editor.fund)}
          close={close}
        />
      )}
      <section aria-labelledby="fondos-abiertos" className="grid gap-3">
        <h2 id="fondos-abiertos" className="font-semibold">
          Fondos de ahorro
        </h2>
        <p className="text-sm text-muted-foreground">
          Una reserva virtual no mueve Bancos ni crea gastos o ingresos.
        </p>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tenés fondos de ahorro.
          </p>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {open.map((fund) => (
              <FundEntry
                key={fund.id}
                fund={fund}
                editDisabled={editor !== null}
                edit={(from) => openEditor({ action: "edit", fund }, from)}
                move={
                  availability
                    ? (action, from) => openEditor({ action, fund }, from)
                    : undefined
                }
                canTransfer={destinations(fund).length > 0}
              />
            ))}
          </ul>
        )}
      </section>
      {closed.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">
            Fondos cerrados ({closed.length})
          </summary>
          <ul className="mt-3 grid gap-3 xl:grid-cols-2">
            {closed.map((fund) => (
              <FundEntry key={fund.id} fund={fund} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function FundEntry({
  fund,
  edit,
  editDisabled,
  move,
  canTransfer,
}: {
  fund: SavingsFund;
  edit?: (from: HTMLButtonElement) => void;
  editDisabled?: boolean;
  move?: (action: FundAction, from: HTMLButtonElement) => void;
  canTransfer?: boolean;
}) {
  return (
    <li className="min-w-0">
      <Card className="gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold wrap-anywhere">{fund.name}</h3>
            <p className="text-sm text-muted-foreground">{fund.currency}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2 py-1 text-xs font-medium">
              {fundStatuses[fund.status]}
            </span>
            {edit &&
              (fund.status === "active" || fund.status === "paused_manual") && (
                <button
                  type="button"
                  disabled={editDisabled}
                  className={button}
                  aria-label={`Editar ${fund.name}`}
                  onClick={(event) => edit(event.currentTarget)}
                >
                  Editar
                </button>
              )}
          </div>
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="text-muted-foreground">Reservado</dt>
            <dd className="font-medium tabular-nums">
              {formatBankAmount({
                currency: fund.currency,
                amount: fund.reservedAmount,
              })}
            </dd>
          </div>
          {fund.targetAmount && (
            <div className="flex flex-wrap justify-between gap-x-2">
              <dt className="text-muted-foreground">Meta</dt>
              <dd className="font-medium tabular-nums">
                {formatBankAmount({
                  currency: fund.currency,
                  amount: fund.targetAmount,
                })}
              </dd>
            </div>
          )}
          {fund.targetDate && (
            <div className="flex flex-wrap justify-between gap-x-2">
              <dt className="text-muted-foreground">Fecha objetivo</dt>
              <dd className="font-medium tabular-nums">{fund.targetDate}</dd>
            </div>
          )}
        </dl>
        {fund.reservedAmount === "0.0000" && fund.status !== "closed" && (
          <p className="text-sm text-muted-foreground">
            Sin dinero reservado todavía.
          </p>
        )}
        {move && (
          <div className="flex flex-wrap gap-2">
            {(["reserve", "release", "transfer"] as const).map((action) => {
              const { action: label, origin } = movementLabels[action];
              return (
                <button
                  key={action}
                  type="button"
                  className={button}
                  aria-label={`${label} ${origin} ${fund.name}`}
                  disabled={
                    editDisabled ||
                    (action !== "reserve" &&
                      fund.reservedAmount === "0.0000") ||
                    (action === "transfer" && !canTransfer)
                  }
                  onClick={(event) => move(action, event.currentTarget)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </li>
  );
}

function FundMovementEditor({
  action,
  fund,
  destinations,
  close,
}: {
  action: FundAction;
  fund: SavingsFund;
  destinations: SavingsFund[];
  close: (message?: string) => void;
}) {
  const { action: label, origin, confirmed } = movementLabels[action];
  const [review, setReview] = useState<{
    amount: string;
    destination?: SavingsFund;
  }>();
  const [validation, setValidation] = useState("");
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/funds",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewing = review !== undefined;
  useEffect(() => {
    heading.current?.focus();
  }, [reviewing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (review) {
      const saved = await send({
        action,
        fundId: fund.id,
        version: fund.version,
        amount: review.amount,
        ...(review.destination && {
          destinationFundId: review.destination.id,
          destinationVersion: review.destination.version,
        }),
      });
      if (saved) close(confirmed);
      return;
    }
    const form = new FormData(event.currentTarget);
    const amount = parseFundAmount(form.get("amount"));
    if (!amount) {
      setValidation("Ingresá un importe positivo con hasta cuatro decimales.");
      return;
    }
    const destination = destinations.find(
      ({ id }) => id === form.get("destination"),
    );
    if (action === "transfer" && !destination) {
      setValidation("Elegí el fondo de destino.");
      return;
    }
    setValidation("");
    setReview({ amount, destination });
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2
        id="titulo-operacion-fondo"
        ref={heading}
        tabIndex={-1}
        className="font-semibold"
      >
        {reviewing
          ? `Confirmar ${label.toLowerCase()}`
          : `${label} · ${fund.name}`}
      </h2>
      <form
        method="post"
        action="/api/funds"
        aria-labelledby="titulo-operacion-fondo"
        onSubmit={submit}
        className="grid gap-3"
      >
        <fieldset
          hidden={reviewing}
          disabled={reviewing}
          className={reviewing ? "hidden" : "grid min-w-0 gap-3 sm:grid-cols-2"}
        >
          <label className="grid gap-1 text-sm font-medium">
            Importe ({fund.currency})
            <input
              className={control}
              name="amount"
              inputMode="decimal"
              maxLength={21}
              required
            />
          </label>
          {action === "transfer" && (
            <label className="grid gap-1 text-sm font-medium">
              Fondo de destino
              <select
                className={control}
                name="destination"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Elegí un fondo
                </option>
                {destinations.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        {review && (
          <p className="text-sm wrap-anywhere">
            {label}{" "}
            <strong>
              {formatBankAmount({
                amount: review.amount,
                currency: fund.currency,
              })}
            </strong>
            {` ${origin} `}
            <strong>{fund.name}</strong>
            {review.destination && (
              <>
                {" "}
                hacia <strong>{review.destination.name}</strong>
              </>
            )}
            .
          </p>
        )}
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : review
                  ? "Confirmar operación"
                  : "Revisar operación"}
          </button>
          {review && (
            <button
              type="button"
              className={button}
              disabled={pending || uncertain}
              onClick={() => {
                clearError();
                setReview(undefined);
              }}
            >
              Modificar
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function FundEditor({
  fund,
  close,
}: {
  fund?: SavingsFund;
  close: (message?: string) => void;
}) {
  const [status, setStatus] = useState<EditableFundStatus>(
    fund?.status === "paused_manual" ? "paused_manual" : "active",
  );
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/funds",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = { name: form.get("name") };
    const saved = await send(
      fund
        ? {
            action: "update",
            fundId: fund.id,
            version: fund.version,
            status,
            ...fields,
          }
        : { action: "create", currency: form.get("currency"), ...fields },
    );
    if (saved) close(fund ? "Fondo guardado." : "Fondo creado.");
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2
        id="titulo-editor-fondo"
        ref={heading}
        tabIndex={-1}
        className="font-semibold"
      >
        {fund ? "Editar fondo" : "Agregar fondo"}
      </h2>
      <form
        method="post"
        action="/api/funds"
        aria-labelledby="titulo-editor-fondo"
        onSubmit={submit}
        className="grid gap-3"
      >
        <fieldset
          disabled={pending || uncertain}
          className="grid min-w-0 gap-3 sm:grid-cols-2"
        >
          <label className="grid gap-1 text-sm font-medium">
            Nombre
            <input
              className={control}
              name="name"
              required
              maxLength={100}
              defaultValue={fund?.name}
            />
          </label>
          {fund ? (
            <p className="self-end text-sm">
              Moneda · {fund.currency} (no se modifica)
            </p>
          ) : (
            <label className="grid gap-1 text-sm font-medium">
              Moneda
              <select className={control} name="currency" defaultValue="UYU">
                {bankCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fund && (
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Estado
              <select
                className={control}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as EditableFundStatus)
                }
              >
                <option value="active">Activo</option>
                <option value="paused_manual">Pausado</option>
              </select>
            </label>
          )}
        </fieldset>
        <p role="alert" className={error ? "text-sm" : "sr-only"}>
          {error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : fund
                  ? "Guardar fondo"
                  : "Crear fondo"}
          </button>
          <button
            type="button"
            className={button}
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
