"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { FundSource } from "@/domain/fund-coverage";
import {
  bankCurrencies,
  formatBankAmount,
  type BankAvailability,
} from "@/domain/bank-balances";
import { cardKinds, type CardKind, type CatalogCard } from "@/domain/cards";
import type {
  CreditAction,
  CreditPurchaseOption,
} from "@/domain/credit-operations";
import type { Currency } from "@/domain/money";
import {
  formatInstallmentPeriod,
  formatInstallmentTotal,
  futureInstallmentPeriods,
  installmentPeriodAt,
  type InstallmentSummary,
} from "@/domain/installments";
import type { CatalogCategory } from "@/domain/categories";
import {
  CreditOperationForm,
  creditActionLabels,
} from "./credit-operation-form";
import type { MovementTag } from "@/domain/classification";
import { useFinancialCommand } from "./financial-command";
import { ActionMenu } from "./glaciar/action-menu";
import {
  EmptyState,
  FormFoot,
  FormPanel,
  FormSection,
  PageHead,
  RowIcon,
} from "./glaciar/screen";
import { Panel } from "./glaciar-summary/panel";
import { Button, buttonClass } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Icon } from "./ui/icon";

type Operation = { card: CatalogCard; action: CreditAction };

export function CardCatalog({
  cards,
  today,
  creditReady,
  banks,
  fundSources,
  bankAvailability,
  categories,
  tags,
  purchases,
  installmentsReady,
  cyclesReady,
  mixedReady,
  plans,
  aside,
}: {
  cards: CatalogCard[];
  today: string;
  creditReady: boolean;
  banks: Currency[];
  fundSources: FundSource[] | null;
  bankAvailability: BankAvailability[];
  categories: CatalogCategory[];
  tags?: MovementTag[] | null;
  purchases: CreditPurchaseOption[];
  installmentsReady: boolean;
  cyclesReady: boolean;
  mixedReady: boolean;
  plans: InstallmentSummary[];
  aside?: ReactNode;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<CatalogCard | Operation | "new" | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const active = cards.filter((card) => !card.archived);
  const archived = cards.filter((card) => card.archived);

  function open(card: CatalogCard | Operation | "new", from: HTMLElement) {
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

  const operate = creditReady
    ? (card: CatalogCard) => (action: CreditAction, from: HTMLElement) =>
        open({ card, action }, from)
    : undefined;

  return (
    <>
      <PageHead
        eyebrow="Crédito"
        title="Tarjetas"
        description="Gestioná tus tarjetas de débito y crédito por moneda."
        actions={
          <Button
            ref={add}
            variant="primary"
            disabled={editor !== null}
            onClick={(event) => open("new", event.currentTarget)}
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Agregar tarjeta
          </Button>
        }
      />
      <p role="status" className={message ? "text-sm" : "sr-only"}>
        {message}
      </p>
      {editor &&
        (typeof editor === "object" && "action" in editor ? (
          <div className="gs-form">
            <CreditOperationForm
              action={editor.action}
              cards={[editor.card]}
              today={today}
              banks={banks}
              fundSources={fundSources}
              bankAvailability={bankAvailability}
              categories={categories}
              tags={tags}
              debitCards={
                mixedReady
                  ? cards.filter(
                      ({ kind, archived }) => kind === "debit" && !archived,
                    )
                  : undefined
              }
              purchases={purchases}
              installmentsReady={installmentsReady}
              close={close}
            />
          </div>
        ) : (
          <CardEditor
            card={editor === "new" ? undefined : editor}
            close={close}
            today={today}
            creditReady={creditReady}
          />
        ))}
      <div className="gs-grid">
        <div className="gs-span-8 gs-stack">
          <section aria-labelledby="tarjetas-activas" className="gs-stack">
            <h2 id="tarjetas-activas" className="lab-panel__title">
              Activas
              <span className="lab-tag lab-tag--neutral">{active.length}</span>
            </h2>
            {active.length === 0 ? (
              <EmptyState
                icon="cards"
                title="Todavía no tenés tarjetas activas"
              >
                Agregá tus tarjetas de crédito para seguir deuda, cierres y
                vencimientos, y las de débito para registrar gastos desde
                Bancos.
              </EmptyState>
            ) : (
              <ul className="b-cards">
                {active.map((card, index) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    teal={index % 2 === 1}
                    cyclesReady={cyclesReady}
                    editDisabled={editor !== null}
                    edit={(from) => open(card, from)}
                    operate={operate?.(card)}
                  />
                ))}
              </ul>
            )}
          </section>
          {plans.length > 0 && (
            <InstallmentsPanel plans={plans} cards={cards} today={today} />
          )}
        </div>
        <div className="gs-span-4 gs-stack">
          {aside}
          {archived.length > 0 && (
            <ArchivedPanel
              cards={archived}
              open={message === "Tarjeta archivada."}
              cyclesReady={cyclesReady}
              editDisabled={editor !== null}
              operate={operate}
            />
          )}
        </div>
      </div>
    </>
  );
}

function CardTile({
  card,
  teal,
  cyclesReady,
  edit,
  editDisabled,
  operate,
}: {
  card: CatalogCard;
  teal: boolean;
  cyclesReady: boolean;
  edit: (from: HTMLElement) => void;
  editDisabled: boolean;
  operate?: (action: CreditAction, from: HTMLElement) => void;
}) {
  const credit = card.kind === "credit";
  return (
    <li
      className={`b-card ${credit && teal ? "b-card--teal" : ""} ${credit ? "" : "gs-card--debit"}`}
    >
      <div className="relative z-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold wrap-anywhere">
            {card.name}
          </h3>
          {card.issuer && <p className="gs-card__issuer">{card.issuer}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="gs-card__kind">{cardKinds[card.kind]}</span>
          <span className="b-card__chip" aria-hidden="true" />
        </div>
      </div>
      {credit ? (
        <dl className="relative z-1 grid gap-1">
          {card.currencies.map(
            ({ currency, limit, debt, creditBalance }) =>
              debt !== null &&
              creditBalance !== null && (
                <div key={currency} className="grid gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="sr-only">Deuda registrada {currency}</dt>
                    <dd className="b-card__debt tabular-nums">
                      {formatBankAmount({ currency, amount: debt })}
                    </dd>
                  </div>
                  <div className="gs-card__limit flex flex-wrap justify-between gap-x-3 tabular-nums">
                    <dt>Saldo a favor registrado</dt>
                    <dd>
                      {formatBankAmount({ currency, amount: creditBalance })}
                    </dd>
                  </div>
                  {limit && (
                    <div className="gs-card__limit flex flex-wrap justify-between gap-x-3 tabular-nums">
                      <dt>Límite informado</dt>
                      <dd>{formatBankAmount({ currency, amount: limit })}</dd>
                    </div>
                  )}
                </div>
              ),
          )}
        </dl>
      ) : (
        <>
          <p className="relative z-1 text-sm text-white/80">
            Vinculada a Bancos por moneda.
          </p>
          <p className="gs-card__issuer relative z-1">
            {card.currencies.map(({ currency }) => currency).join(" · ")}
          </p>
        </>
      )}
      <div className="gs-card__actions">
        {credit && operate ? (
          <>
            {cyclesReady && (
              <a href={`/tarjetas/${card.id}/resumen`}>
                Resúmenes y ciclos
                <Icon
                  name="chevronRight"
                  duotone={false}
                  className="size-3.5"
                />
              </a>
            )}
            <button
              type="button"
              disabled={editDisabled}
              onClick={(event) => operate("payment", event.currentTarget)}
            >
              {creditActionLabels.payment}
            </button>
            <ActionMenu
              label={`Más acciones de ${card.name}`}
              items={[
                {
                  label: creditActionLabels.purchase,
                  disabled: editDisabled,
                  onSelect: (from) => operate("purchase", from),
                },
                {
                  label: creditActionLabels.adjustment,
                  disabled: editDisabled,
                  onSelect: (from) => operate("adjustment", from),
                },
                {
                  label: "Editar tarjeta",
                  ariaLabel: `Editar ${card.name}`,
                  disabled: editDisabled,
                  onSelect: edit,
                },
              ]}
            />
          </>
        ) : (
          <button
            type="button"
            disabled={editDisabled}
            aria-label={`Editar ${card.name}`}
            onClick={(event) => edit(event.currentTarget)}
          >
            Editar
          </button>
        )}
      </div>
    </li>
  );
}

function InstallmentsPanel({
  plans,
  cards,
  today,
}: {
  plans: InstallmentSummary[];
  cards: CatalogCard[];
  today: string;
}) {
  return (
    <Panel
      id="compras-en-cuotas"
      title={`Compras en cuotas (${plans.length})`}
      icon="calendar"
    >
      <ul className="gs-rows">
        {plans.map((plan) => {
          const future = futureInstallmentPeriods(plan, today).length;
          return (
            <li key={plan.id}>
              <RowIcon name="cards" />
              <div className="gs-row__main">
                <a
                  href={`/historial/movimientos/${plan.id}`}
                  className="gs-row__title"
                >
                  {plan.concept}
                </a>
                <p className="gs-row__sub">
                  {cards.find(({ id }) => id === plan.cardId)?.name}
                </p>
                <p className="gs-row__sub">
                  {plan.count} ×{" "}
                  {formatBankAmount({
                    currency: plan.currency,
                    amount: plan.installmentAmount,
                  })}{" "}
                  · Total financiado{" "}
                  {formatInstallmentTotal(plan, plan.currency)}
                </p>
                <p className="gs-row__sub">
                  De {formatInstallmentPeriod(plan.firstPeriod)} a{" "}
                  {formatInstallmentPeriod(
                    installmentPeriodAt(plan.firstPeriod, plan.count - 1),
                  )}
                </p>
                <p className="gs-row__sub">
                  {future} futuras · Compromiso futuro{" "}
                  {formatInstallmentTotal(plan, plan.currency, future)}
                </p>
                {plan.count > plan.activeCount && (
                  <p className="gs-row__sub">
                    {plan.count - plan.activeCount} canceladas por el emisor
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ArchivedPanel({
  cards,
  open,
  cyclesReady,
  editDisabled,
  operate,
}: {
  cards: CatalogCard[];
  open: boolean;
  cyclesReady: boolean;
  editDisabled: boolean;
  operate?: (
    card: CatalogCard,
  ) => (action: CreditAction, from: HTMLElement) => void;
}) {
  return (
    <details className="lab-panel" open={open || undefined}>
      <summary className="lab-panel__title cursor-pointer">
        Archivadas ({cards.length})
      </summary>
      <ul className="gs-rows">
        {cards.map((card) => {
          const run = card.kind === "credit" ? operate?.(card) : undefined;
          return (
            <li key={card.id} className="flex-wrap">
              <RowIcon name="cards" />
              <div className="gs-row__main">
                <h3 className="gs-row__title">{card.name}</h3>
                <p className="gs-row__sub">
                  {cardKinds[card.kind]}
                  {card.issuer && ` · ${card.issuer}`}
                </p>
                <ul aria-label="Monedas de la tarjeta" className="mt-1">
                  {card.currencies.map(
                    ({ currency, limit, debt, creditBalance }) => (
                      <li key={currency} className="gs-row__sub">
                        <span className="font-semibold">{currency}</span>
                        {debt !== null && creditBalance !== null && (
                          <dl className="grid gap-0.5">
                            <ArchivedAmount
                              label="Deuda registrada"
                              amount={formatBankAmount({
                                currency,
                                amount: debt,
                              })}
                            />
                            <ArchivedAmount
                              label="Saldo a favor registrado"
                              amount={formatBankAmount({
                                currency,
                                amount: creditBalance,
                              })}
                            />
                            {limit && (
                              <ArchivedAmount
                                label="Límite informado"
                                amount={formatBankAmount({
                                  currency,
                                  amount: limit,
                                })}
                              />
                            )}
                          </dl>
                        )}
                      </li>
                    ),
                  )}
                </ul>
                {run && (
                  <div className="gs-actions mt-2">
                    {cyclesReady && (
                      <a
                        href={`/tarjetas/${card.id}/resumen`}
                        className="lab-link"
                      >
                        Resúmenes y ciclos
                      </a>
                    )}
                    {(["payment", "adjustment"] as const).map((action) => (
                      <button
                        key={action}
                        type="button"
                        className={buttonClass("outline")}
                        disabled={editDisabled}
                        onClick={(event) => run(action, event.currentTarget)}
                      >
                        {creditActionLabels[action]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ArchivedAmount({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-2">
      <dt>{label}</dt>
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
    <FormPanel
      labelId="titulo-editor-tarjeta"
      headingRef={heading}
      title={
        archive
          ? "Archivar tarjeta"
          : card
            ? "Editar tarjeta"
            : "Agregar tarjeta"
      }
      description={
        card
          ? undefined
          : "Las tarjetas de crédito registran deuda por moneda; las de débito quedan vinculadas a Bancos."
      }
    >
      <form
        method="post"
        action="/api/cards"
        aria-labelledby="titulo-editor-tarjeta"
        onSubmit={submit}
        className="grid gap-4"
      >
        {archive ? (
          <p className="text-sm">
            {card?.name} quedará en «Archivadas» con sus posiciones registradas.
          </p>
        ) : (
          <fieldset
            disabled={pending || uncertain}
            className="grid min-w-0 gap-4"
          >
            <div className="gs-form__grid">
              <Field label="Nombre">
                <Input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={card?.name}
                />
              </Field>
              <Field label="Emisor (opcional)">
                <Input
                  name="issuer"
                  maxLength={100}
                  defaultValue={card?.issuer ?? ""}
                />
              </Field>
              {card ? (
                <p className="text-sm">Tipo de tarjeta · {cardKinds[kind]}</p>
              ) : (
                <Field label="Tipo de tarjeta">
                  <Select
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as CardKind)
                    }
                  >
                    <option value="debit">Débito</option>
                    <option value="credit">Crédito</option>
                  </Select>
                </Field>
              )}
            </div>
            <fieldset className="grid min-w-0 gap-2">
              <legend className="ui-field__label">Monedas</legend>
              <div className="gs-choice">
                {bankCurrencies.map((currency) => {
                  const checked = selected.includes(currency);
                  return (
                    <label key={currency}>
                      <input
                        type="checkbox"
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
                  );
                })}
              </div>
            </fieldset>
            {kind === "credit" &&
              bankCurrencies
                .filter((currency) => selected.includes(currency))
                .map((currency) => (
                  <FormSection key={currency} legend={currency}>
                    <div className="gs-form__grid">
                      <Field label={`Límite ${currency} (opcional)`}>
                        <Input
                          name={`limit-${currency}`}
                          inputMode="decimal"
                          maxLength={22}
                          defaultValue={
                            card?.currencies
                              .find((row) => row.currency === currency)
                              ?.limit?.replace(".", ",") ?? ""
                          }
                        />
                      </Field>
                      {creditReady && !card && (
                        <Field label={`Deuda inicial ${currency}`}>
                          <Input
                            name={`debt-${currency}`}
                            inputMode="decimal"
                            maxLength={22}
                          />
                        </Field>
                      )}
                    </div>
                  </FormSection>
                ))}
            {creditReady &&
              !card &&
              kind === "credit" &&
              selected.length > 0 && (
                <div className="gs-form__grid">
                  <Field label="Fecha de deuda inicial">
                    <Input
                      type="date"
                      name="openingOn"
                      max={today}
                      defaultValue={today}
                    />
                  </Field>
                </div>
              )}
            {kind === "credit" && (
              <p className="gs-hint">
                Podés informar un límite por moneda con hasta cuatro decimales.
              </p>
            )}
            {creditReady && !card && kind === "credit" && (
              <p className="gs-hint">
                Ingresá la deuda existente a la fecha de referencia. Dejá vacío
                si no hay deuda en esa moneda.
              </p>
            )}
          </fieldset>
        )}
        <p role="alert" className={error ? "text-sm" : "sr-only"}>
          {error}
        </p>
        <FormFoot>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </Button>
          {card && !archive && (
            <Button
              className="gs-btn-danger"
              disabled={pending || uncertain}
              onClick={() => {
                clearError();
                setArchive(true);
              }}
            >
              Archivar tarjeta
            </Button>
          )}
          <Button
            type="submit"
            variant={archive ? "outline" : "primary"}
            className={archive ? "gs-btn-danger" : undefined}
            disabled={pending}
          >
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : archive
                  ? "Confirmar archivo"
                  : "Guardar tarjeta"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
  );
}
