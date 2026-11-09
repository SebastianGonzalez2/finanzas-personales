"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import { cardKinds, type CardKind, type CatalogCard } from "@/domain/cards";
import type {
  CreditAction,
  CreditPurchaseOption,
} from "@/domain/credit-operations";
import type { Currency } from "@/domain/money";
import type { MovementCategory } from "@/domain/movements";
import {
  CreditOperationForm,
  creditActionLabels,
} from "./credit-operation-form";
import { useFinancialCommand } from "./financial-command";
import { Card } from "./ui/card";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60";
const primary = `${button} border-primary bg-primary text-primary-foreground hover:bg-primary/85`;
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base";

type Operation = { card: CatalogCard; action: CreditAction };
const creditActions = ["purchase", "payment", "adjustment"] as const;

export function CardCatalog({
  cards,
  today,
  creditReady,
  banks,
  categories,
  purchases,
}: {
  cards: CatalogCard[];
  today: string;
  creditReady: boolean;
  banks: Currency[];
  categories: MovementCategory[];
  purchases: CreditPurchaseOption[];
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<CatalogCard | Operation | "new" | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = cards.filter((card) => !card.archived);
  const archived = cards.filter((card) => card.archived);

  function open(
    card: CatalogCard | Operation | "new",
    from: HTMLButtonElement,
  ) {
    trigger.current = from;
    setMessage("");
    setEditor(card);
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
        onClick={(event) => open("new", event.currentTarget)}
      >
        Agregar tarjeta
      </button>
      {editor &&
        (typeof editor === "object" && "action" in editor ? (
          <Card className="p-4 sm:p-5">
            <CreditOperationForm
              action={editor.action}
              cards={[editor.card]}
              today={today}
              banks={banks}
              categories={categories}
              purchases={purchases}
              close={close}
            />
          </Card>
        ) : (
          <CardEditor
            card={editor === "new" ? undefined : editor}
            close={close}
            today={today}
            creditReady={creditReady}
          />
        ))}
      <section aria-labelledby="tarjetas-activas" className="grid gap-3">
        <h2 id="tarjetas-activas" className="font-semibold">
          Activas
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tenés tarjetas activas.
          </p>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {active.map((card) => (
              <CardEntry
                key={card.id}
                card={card}
                editDisabled={editor !== null}
                edit={(from) => open(card, from)}
                operate={
                  creditReady
                    ? (action, from) => open({ card, action }, from)
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>
      {archived.length > 0 && (
        <details
          className="rounded-lg border p-4"
          open={message === "Tarjeta archivada." || undefined}
        >
          <summary className="cursor-pointer font-semibold">
            Archivadas ({archived.length})
          </summary>
          <ul className="mt-3 grid gap-3 xl:grid-cols-2">
            {archived.map((card) => (
              <CardEntry
                key={card.id}
                card={card}
                editDisabled={editor !== null}
                operate={
                  creditReady
                    ? (action, from) => open({ card, action }, from)
                    : undefined
                }
              />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function CardEntry({
  card,
  edit,
  editDisabled,
  operate,
}: {
  card: CatalogCard;
  edit?: (from: HTMLButtonElement) => void;
  editDisabled?: boolean;
  operate?: (action: CreditAction, from: HTMLButtonElement) => void;
}) {
  return (
    <li className="min-w-0">
      <Card className="gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold wrap-anywhere">{card.name}</h3>
            <p className="text-sm wrap-anywhere text-muted-foreground">
              {cardKinds[card.kind]}
              {card.issuer && ` · ${card.issuer}`}
            </p>
          </div>
          {edit && (
            <button
              type="button"
              disabled={editDisabled}
              className={button}
              aria-label={`Editar ${card.name}`}
              onClick={(event) => edit(event.currentTarget)}
            >
              Editar
            </button>
          )}
        </div>
        {card.kind === "debit" && (
          <p className="text-sm text-muted-foreground">
            Vinculada a Bancos por moneda.
          </p>
        )}
        <ul aria-label="Monedas de la tarjeta" className="divide-y border-t">
          {card.currencies.map(({ currency, limit, debt, creditBalance }) => (
            <li
              key={currency}
              className="grid gap-1 py-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-3"
            >
              <span className="font-semibold">{currency}</span>
              {debt !== null && creditBalance !== null && (
                <dl className="grid gap-1">
                  <CardAmount
                    label="Deuda registrada"
                    amount={formatBankAmount({ currency, amount: debt })}
                  />
                  <CardAmount
                    label="Saldo a favor registrado"
                    amount={formatBankAmount({
                      currency,
                      amount: creditBalance,
                    })}
                  />
                  {limit && (
                    <CardAmount
                      label="Límite informado"
                      amount={formatBankAmount({ currency, amount: limit })}
                    />
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
        {card.kind === "credit" && operate && (
          <div className="flex flex-wrap gap-2">
            {creditActions
              .filter((action) => !card.archived || action !== "purchase")
              .map((action) => (
                <button
                  key={action}
                  type="button"
                  className={button}
                  disabled={editDisabled}
                  onClick={(event) => operate(action, event.currentTarget)}
                >
                  {creditActionLabels[action]}
                </button>
              ))}
          </div>
        )}
      </Card>
    </li>
  );
}

function CardAmount({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{amount}</dd>
    </div>
  );
}

function CardEditor({
  card,
  close,
  today,
  creditReady,
}: {
  card?: CatalogCard;
  close: (message?: string) => void;
  today: string;
  creditReady: boolean;
}) {
  const [kind, setKind] = useState<CardKind>(card?.kind ?? "debit");
  const [selected, setSelected] = useState(
    () => card?.currencies.map(({ currency }) => currency) ?? [],
  );
  const [archive, setArchive] = useState(false);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/cards",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [archive]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = card && { cardId: card.id, version: card.version };
    const fields = {
      name: form.get("name"),
      issuer: form.get("issuer"),
      currencies: selected.map((currency) => ({
        currency,
        limit: form.get(`limit-${currency}`),
      })),
    };
    const initial = selected.flatMap((currency) => {
      const amount = form.get(`debt-${currency}`);
      return typeof amount === "string" && amount.trim()
        ? [{ currency, amount }]
        : [];
    });
    const opening = initial.length
      ? { opening: { effectiveOn: form.get("openingOn"), lines: initial } }
      : {};
    const saved = await send(
      archive
        ? { action: "archive", ...target }
        : card
          ? { action: "update", ...target, ...fields }
          : { action: "create", kind, ...fields, ...opening },
    );
    if (saved) close(archive ? "Tarjeta archivada." : "Tarjeta guardada.");
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2
        id="titulo-editor-tarjeta"
        ref={heading}
        tabIndex={-1}
        className="font-semibold"
      >
        {archive
          ? "Archivar tarjeta"
          : card
            ? "Editar tarjeta"
            : "Agregar tarjeta"}
      </h2>
      <form
        method="post"
        action="/api/cards"
        aria-labelledby="titulo-editor-tarjeta"
        onSubmit={submit}
        className="grid gap-3"
      >
        {archive ? (
          <p className="text-sm">
            {card?.name} quedará en «Archivadas» con sus posiciones registradas.
          </p>
        ) : (
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
                defaultValue={card?.name}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Emisor (opcional)
              <input
                className={control}
                name="issuer"
                maxLength={100}
                defaultValue={card?.issuer ?? ""}
              />
            </label>
            {card ? (
              <p className="text-sm">Tipo de tarjeta · {cardKinds[kind]}</p>
            ) : (
              <label className="grid gap-1 text-sm font-medium">
                Tipo de tarjeta
                <select
                  className={control}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as CardKind)}
                >
                  <option value="debit">Débito</option>
                  <option value="credit">Crédito</option>
                </select>
              </label>
            )}
            <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">Monedas</legend>
              {kind === "credit" && (
                <p className="text-xs text-muted-foreground">
                  Podés informar un límite por moneda con hasta cuatro
                  decimales.
                </p>
              )}
              {bankCurrencies.map((currency) => {
                const checked = selected.includes(currency);
                return (
                  <div
                    key={currency}
                    className="grid min-w-0 gap-1 sm:grid-cols-2"
                  >
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={checked}
                        onChange={() =>
                          setSelected((values) =>
                            checked
                              ? values.filter((code) => code !== currency)
                              : [...values, currency],
                          )
                        }
                      />
                      {currency}
                    </label>
                    {kind === "credit" && checked && (
                      <label className="grid gap-1 text-sm">
                        Límite {currency} (opcional)
                        <input
                          className={control}
                          name={`limit-${currency}`}
                          inputMode="decimal"
                          maxLength={22}
                          defaultValue={
                            card?.currencies
                              .find((row) => row.currency === currency)
                              ?.limit?.replace(".", ",") ?? ""
                          }
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </fieldset>
            {creditReady &&
              !card &&
              kind === "credit" &&
              selected.length > 0 && (
                <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
                  <legend className="px-1 text-sm font-medium">
                    Deuda inicial (opcional)
                  </legend>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Ingresá la deuda existente a la fecha de referencia. Dejá
                    vacío si no hay deuda en esa moneda.
                  </p>
                  <label className="grid gap-1 text-sm">
                    Fecha de deuda inicial
                    <input
                      className={control}
                      type="date"
                      name="openingOn"
                      max={today}
                      defaultValue={today}
                    />
                  </label>
                  {selected.map((currency) => (
                    <label key={currency} className="grid gap-1 text-sm">
                      Deuda inicial {currency}
                      <input
                        className={control}
                        name={`debt-${currency}`}
                        inputMode="decimal"
                        maxLength={22}
                      />
                    </label>
                  ))}
                </fieldset>
              )}
          </fieldset>
        )}
        <p role="alert" className={error ? "text-sm" : "sr-only"}>
          {error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : archive
                  ? "Confirmar archivo"
                  : "Guardar tarjeta"}
          </button>
          <button
            type="button"
            className={button}
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </button>
          {card && !archive && (
            <button
              type="button"
              className={button}
              disabled={pending || uncertain}
              onClick={() => {
                clearError();
                setArchive(true);
              }}
            >
              Archivar tarjeta
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
