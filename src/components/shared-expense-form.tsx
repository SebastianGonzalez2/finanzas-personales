"use client";

import { MonthField, DateInput } from "./ui/date-fields";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import type { CatalogCard } from "@/domain/cards";
import { maxInstallments } from "@/domain/installments";
import type { Currency } from "@/domain/money";
import { conceptLimit, noteLimit } from "@/domain/movements";
import type { CatalogCategory } from "@/domain/categories";
import { CategorySelect } from "./category-select";
import { maxFriends } from "@/domain/shared-expenses";
import { NameAutocomplete } from "./name-autocomplete";
import { useFinancialCommand } from "./financial-command";
import {
  HistoryField as Field,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";

type Target = {
  id: string;
  currency: Currency;
  amount: string;
  concept: string;
  note: string | null;
  categoryId: string | null;
  version?: number;
};

export function SharedExpenseForm({
  today,
  categories,
  cards = [],
  banks = [],
  plansReady = false,
  target,
  onClose,
}: {
  today: string;
  categories: CatalogCategory[];
  cards?: CatalogCard[];
  banks?: Currency[];
  plansReady?: boolean;
  target?: Target;
  onClose?: () => void;
}) {
  const router = useRouter();
  const editing = target?.version !== undefined;
  const action = editing ? "edit" : target ? "split" : "create";
  const [method, setMethod] = useState<
    "debit" | "transfer" | "credit" | "third_party"
  >("third_party");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [financed, setFinanced] = useState(false);
  const [friends, setFriends] = useState([0]);
  const nextFriend = useRef(1);
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/shared-expenses",
    "POST",
  );
  const [savedId, setSavedId] = useState("");
  const payable = action === "create" && method === "third_party";
  const credit = action === "create" && method === "credit";
  const currencies = credit
    ? (cards
        .find((card) => card.id === cardId)
        ?.currencies.map((row) => row.currency) ?? [])
    : payable
      ? bankCurrencies
      : banks;
  const button = editing
    ? "Guardar corrección"
    : payable
      ? "Confirmar gasto y deuda"
      : "Confirmar reparto";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const common = { action };
    const details = {
      concept: data.get("concept"),
      categoryId: data.get("categoryId"),
      note: data.get("note"),
    };
    const split = () => ({
      ownAmount: data.get("ownAmount"),
      parties: friends.map((key) => ({
        name: data.get(`name-${key}`),
        amount: data.get(`amount-${key}`),
        dueOn: data.get(`due-${key}`),
      })),
    });
    const payload = target
      ? editing
        ? {
            ...common,
            eventId: target.id,
            expectedVersion: target.version,
            ...details,
          }
        : { ...common, eventId: target.id, ...split() }
      : {
          ...common,
          ...details,
          method,
          currency: data.get("currency"),
          amount: data.get("amount"),
          merchantName: data.get("merchantName"),
          effectiveOn: data.get("effectiveOn"),
          ...(payable
            ? {
                creditor: {
                  name: data.get("creditor"),
                  dueOn: data.get("dueOn"),
                },
              }
            : split()),
          ...(credit && {
            cardId,
            covered: data.has("covered"),
            ...(financed && {
              cardAmount: data.get("cardAmount"),
              plan: {
                count: Number(data.get("count")),
                installmentAmount: data.get("installmentAmount"),
                firstPeriod: data.get("firstPeriod"),
              },
            }),
          }),
        };
    const id = await send(payload);
    if (id) {
      setSavedId(id);
      router.refresh();
    }
  }

  if (savedId)
    return (
      <div className="grid gap-2 text-sm" role="status">
        <p>
          {editing ? "Corrección guardada." : "Gasto y obligaciones guardados."}
        </p>
        {!target && (
          <Link
            className="font-medium underline"
            href={`/historial/movimientos/${savedId}`}
          >
            Ver gasto y obligaciones
          </Link>
        )}
        {onClose && (
          <button type="button" className={historyButton} onClick={onClose}>
            Volver a Nueva transacción
          </button>
        )}
      </div>
    );

  return (
    <form
      method="post"
      action="/api/shared-expenses"
      onSubmit={submit}
      aria-label={
        editing ? "Corregir datos del gasto" : "Gasto con otras personas"
      }
      className="grid gap-3"
    >
      <fieldset disabled={pending || uncertain} className="grid min-w-0 gap-3">
        <legend className="mb-2 font-semibold">
          {editing
            ? "Corregir datos del gasto"
            : target
              ? "Repartir este gasto"
              : "Gasto con otras personas"}
        </legend>
        {!target && (
          <Field label="Quién pagó y cómo">
            <select
              className={historyControl}
              value={method}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "third_party" ||
                  value === "debit" ||
                  value === "transfer" ||
                  value === "credit"
                )
                  setMethod(value);
              }}
            >
              <option value="third_party">
                Pagó otra persona · gasto pendiente de pago
              </option>
              <option value="debit" disabled={!banks.length}>
                Pagué con débito · gasto compartido
              </option>
              <option value="transfer" disabled={!banks.length}>
                Pagué por transferencia · gasto compartido
              </option>
              <option value="credit" disabled={!cards.length}>
                Pagué con crédito · gasto compartido
              </option>
            </select>
          </Field>
        )}
        {(!target || editing) && (
          <>
            <Field label="Concepto">
              <input
                name="concept"
                className={historyControl}
                maxLength={conceptLimit}
                defaultValue={target?.concept}
                required
              />
            </Field>
            {!target && (
              <NameAutocomplete
                kind="merchant"
                name="merchantName"
                label="Comercio (opcional)"
                className={historyControl}
              />
            )}
            <Field label="Categoría (opcional)">
              <CategorySelect
                kind="expense"
                categories={categories}
                controlClassName={historyControl}
                labelText=""
                defaultValue={target?.categoryId ?? ""}
                unlisted={
                  target?.categoryId &&
                  !categories.some(({ id }) => id === target.categoryId)
                    ? {
                        value: target.categoryId,
                        label: "Conservar categoría actual",
                      }
                    : null
                }
              />
            </Field>
            <Field label="Nota (opcional)">
              <textarea
                name="note"
                className={`${historyControl} py-2`}
                rows={2}
                maxLength={noteLimit}
                defaultValue={target?.note ?? ""}
              />
            </Field>
          </>
        )}
        {!target && (
          <>
            {credit && (
              <Field label="Tarjeta de crédito">
                <select
                  className={historyControl}
                  value={cardId}
                  onChange={(event) => setCardId(event.target.value)}
                >
                  {cards.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Moneda">
                <select
                  key={`${method}-${cardId}`}
                  name="currency"
                  className={historyControl}
                  required
                >
                  {currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
              <Field label="Importe total">
                <input
                  name="amount"
                  className={historyControl}
                  inputMode="decimal"
                  required
                />
              </Field>
            </div>
            <Field label="Fecha del gasto">
              <DateInput
                name="effectiveOn"
                className={historyControl}
                max={today}
                defaultValue={today}
                required
              />
            </Field>
            {credit && (
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="covered" /> El cargo ya está
                  incluido en la deuda confirmada
                </label>
                {plansReady && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={financed}
                      onChange={(event) => setFinanced(event.target.checked)}
                    />{" "}
                    Compra en cuotas
                  </label>
                )}
                {financed && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Cantidad de cuotas">
                      <input
                        name="count"
                        className={historyControl}
                        type="number"
                        min={2}
                        max={maxInstallments}
                        required
                      />
                    </Field>
                    <Field label="Importe por cuota">
                      <input
                        name="installmentAmount"
                        className={historyControl}
                        inputMode="decimal"
                        required
                      />
                    </Field>
                    <MonthField
                      label="Mes de la primera cuota"
                      name="firstPeriod"
                      defaultValue={today.slice(0, 7)}
                      required
                    />
                    <Field label="Cargo confirmado por el emisor">
                      <input
                        name="cardAmount"
                        className={historyControl}
                        inputMode="decimal"
                        required
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {payable && (
          <>
            <NameAutocomplete
              kind="person"
              name="creditor"
              label="Persona o entidad a la que le debés"
              required
              maxLength={conceptLimit}
              className={historyControl}
            />
            <Field label="Fecha prevista de devolución (opcional)">
              <DateInput name="dueOn" className={historyControl} />
            </Field>
            <p className="text-sm text-muted-foreground">
              Se registra el gasto completo y la deuda. Bancos cambia cuando
              registrás el pago real.
            </p>
          </>
        )}
        {!editing && !payable && (
          <>
            {target && (
              <p className="text-sm">
                Total registrado · {formatBankAmount(target)}. El reparto
                conserva el pago original.
              </p>
            )}
            <Field label="Mi parte del gasto">
              <input
                name="ownAmount"
                className={historyControl}
                inputMode="decimal"
                required
              />
            </Field>
            {friends.map((key, index) => (
              <fieldset
                key={key}
                className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-2"
              >
                <legend className="px-1 text-sm font-semibold">
                  Persona {index + 1}
                </legend>
                <NameAutocomplete
                  kind="person"
                  name={`name-${key}`}
                  label={`Nombre de la persona ${index + 1}`}
                  required
                  maxLength={conceptLimit}
                  className={historyControl}
                />
                <Field label={`Importe de la persona ${index + 1}`}>
                  <input
                    name={`amount-${key}`}
                    className={historyControl}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="Fecha prevista de cobro (opcional)">
                  <DateInput name={`due-${key}`} className={historyControl} />
                </Field>
                {friends.length > 1 && (
                  <button
                    type="button"
                    className={historyButton}
                    onClick={() =>
                      setFriends(friends.filter((item) => item !== key))
                    }
                  >
                    Quitar persona {index + 1}
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              className={historyButton}
              disabled={friends.length === maxFriends}
              onClick={() => setFriends([...friends, nextFriend.current++])}
            >
              Agregar persona
            </button>
            <p className="text-sm text-muted-foreground">
              {credit
                ? "La tarjeta conserva el cargo informado y cada persona tiene su propio saldo pendiente."
                : "Solo tu parte cuenta como gasto. Cada persona tiene su propio saldo pendiente."}
            </p>
          </>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={historyPrimary}>
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar el mismo envío"
              : button}
        </button>
        {onClose && (
          <button
            type="button"
            disabled={pending || uncertain}
            className={historyButton}
            onClick={onClose}
          >
            Volver
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
