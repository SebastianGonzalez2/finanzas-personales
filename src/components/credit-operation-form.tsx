"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import type { CatalogCard } from "@/domain/cards";
import type {
  CreditAction,
  CreditPurchaseOption,
} from "@/domain/credit-operations";
import type { Currency } from "@/domain/money";
import { InstallmentFields } from "./installment-fields";
import {
  conceptLimit,
  noteLimit,
  type MovementCategory,
} from "@/domain/movements";
import { useFinancialCommand } from "./financial-command";
import {
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";

export const creditActionLabels = {
  purchase: "Registrar compra",
  payment: "Registrar pago",
  adjustment: "Actualizar deuda",
} as const;

const success = {
  purchase: "Compra con tarjeta registrada.",
  payment: "Pago de tarjeta registrado.",
  adjustment: "Deuda actualizada.",
};

type Props = {
  action: CreditAction;
  cards: CatalogCard[];
  today: string;
  banks: Currency[];
  categories: MovementCategory[];
  purchases?: CreditPurchaseOption[];
  installmentsReady: boolean;
  close: (message?: string) => void;
};

export function CreditOperationForm({
  action,
  cards,
  today,
  banks,
  categories,
  purchases = [],
  installmentsReady,
  close,
}: Props) {
  const [cardId, setCardId] = useState(cards[0]?.id);
  const [currency, setCurrency] = useState<Currency>();
  const [financed, setFinanced] = useState(false);
  const card = cards.find(({ id }) => id === cardId) ?? cards[0];
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/cards/operations",
    "POST",
  );
  const title = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  if (!card) return null;
  const selectedCurrency =
    card.currencies.find((row) => row.currency === currency)?.currency ??
    card.currencies[0].currency;
  const payable = card.currencies.filter(({ debt }) =>
    /[1-9]/.test(debt ?? ""),
  );
  const canPay =
    action !== "payment" || (payable.length > 0 && banks.length > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const common = {
      action,
      cardId: card.id,
      effectiveOn: form.get("effectiveOn"),
    };
    let fields;
    if (action === "payment") {
      fields = {
        ...common,
        lines: payable.flatMap(({ currency }) => {
          if (!form.has(`pay-${currency}`)) return [];
          const amount = form.get(`amount-${currency}`);
          const bankCurrency = form.get(`bank-${currency}`);
          return [
            {
              currency,
              amount,
              bankCurrency,
              bankAmount:
                bankCurrency === currency
                  ? amount
                  : form.get(`bankAmount-${currency}`),
              fee: form.get(`fee-${currency}`),
              allocations: purchases.flatMap((purchase) => {
                if (
                  purchase.cardId !== card.id ||
                  purchase.currency !== currency
                )
                  return [];
                const amount = form.get(`allocation-${purchase.id}`);
                return typeof amount === "string" && amount.trim()
                  ? [{ purchaseId: purchase.id, amount }]
                  : [];
              }),
            },
          ];
        }),
      };
    } else {
      const currency = form.get("currency");
      const position = card.currencies.find((row) => row.currency === currency);
      const entry = { ...common, currency, amount: form.get("amount") };
      fields =
        action === "purchase"
          ? {
              ...entry,
              concept: form.get("concept"),
              note: form.get("note"),
              categoryId: form.get("categoryId"),
              covered: form.has("covered"),
              ...(financed && {
                amount: form.get("issuerCharge") || "0",
                plan: {
                  installmentAmount: form.get("installmentAmount"),
                  count: Number(form.get("count")),
                  firstPeriod: form.get("firstPeriod"),
                },
              }),
            }
          : { ...entry, expectedDebt: position?.debt };
    }
    if (await send(fields)) close(success[action]);
  }

  return (
    <form
      method="post"
      action="/api/cards/operations"
      aria-labelledby={title}
      onSubmit={submit}
      className="grid gap-3"
    >
      <h3 id={title} tabIndex={-1} ref={heading} className="font-semibold">
        {creditActionLabels[action]}
        {cards.length === 1 && ` · ${card.name}`}
      </h3>
      <p className="text-sm text-muted-foreground">
        {action === "purchase"
          ? financed
            ? "Cada cuota se registra como gasto en su mes. La deuda refleja el cargo confirmado y Bancos se debita al pagar la tarjeta."
            : "La compra se registra como gasto. Bancos se debita cuando pagás la tarjeta."
          : action === "payment"
            ? "Ingresá los importes efectivamente pagados desde Bancos. Podés pagar una parte o toda la deuda."
            : "Ingresá el total de deuda confirmado por el emisor. El ajuste conserva la diferencia en el historial."}
      </p>
      <fieldset
        disabled={pending || uncertain}
        className="grid min-w-0 gap-3 sm:grid-cols-2"
      >
        {cards.length > 1 && (
          <HistoryField label="Tarjeta de crédito">
            <select
              className={historyControl}
              value={card.id}
              onChange={(event) => setCardId(event.target.value)}
            >
              {cards.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </HistoryField>
        )}
        <HistoryField
          label={action === "adjustment" ? "Fecha de referencia" : "Fecha"}
        >
          <input
            className={historyControl}
            name="effectiveOn"
            type="date"
            required
            max={today}
            defaultValue={today}
          />
        </HistoryField>
        {action === "payment" ? (
          <div className="grid gap-3 sm:col-span-2">
            {canPay ? (
              payable.map(({ currency, debt }) => (
                <PaymentFields
                  key={`${card.id}-${currency}`}
                  currency={currency}
                  debt={debt ?? "0"}
                  banks={banks}
                  selectedByDefault={payable.length === 1}
                  purchases={purchases.filter(
                    (purchase) =>
                      purchase.cardId === card.id &&
                      purchase.currency === currency,
                  )}
                />
              ))
            ) : (
              <p className="text-sm">
                {payable.length
                  ? "Configurá un saldo en Bancos para registrar el pago."
                  : "Esta tarjeta no tiene deuda pendiente."}
              </p>
            )}
          </div>
        ) : (
          <>
            <HistoryField label="Moneda">
              <select
                name="currency"
                className={historyControl}
                value={selectedCurrency}
                onChange={(event) =>
                  setCurrency(event.target.value as Currency)
                }
              >
                {card.currencies.map(({ currency, debt }) => (
                  <option key={currency} value={currency}>
                    {action === "adjustment"
                      ? `${currency} · Deuda ${formatBankAmount({ currency, amount: debt ?? "0" })}`
                      : currency}
                  </option>
                ))}
              </select>
            </HistoryField>
            {!financed && (
              <HistoryField
                label={action === "adjustment" ? "Total confirmado" : "Importe"}
              >
                <AmountInput name="amount" required />
              </HistoryField>
            )}
          </>
        )}
        {action === "purchase" && (
          <>
            {installmentsReady && (
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={financed}
                  onChange={(event) => setFinanced(event.target.checked)}
                  className="size-5 shrink-0"
                />
                Compra en cuotas iguales
              </label>
            )}
            {financed && (
              <>
                <InstallmentFields
                  currency={selectedCurrency}
                  firstPeriod={today.slice(0, 7)}
                />
                <HistoryField label="Cargo confirmado por el emisor (opcional)">
                  <AmountInput name="issuerCharge" />
                </HistoryField>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Ingresá solo el importe reflejado por el emisor. Dejalo vacío
                  si aún no figura un cargo.
                </p>
              </>
            )}
            <HistoryField label="Concepto">
              <input
                className={historyControl}
                name="concept"
                required
                maxLength={conceptLimit}
              />
            </HistoryField>
            <HistoryField label="Categoría (opcional)">
              <select name="categoryId" className={historyControl}>
                <option value="">Sin categorizar</option>
                {categories
                  .filter(({ kind }) => kind === "expense")
                  .map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </HistoryField>
            <HistoryField label="Nota (opcional)">
              <input
                className={historyControl}
                name="note"
                maxLength={noteLimit}
              />
            </HistoryField>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="covered"
                className="size-5 shrink-0"
              />
              {financed
                ? "El cargo ya está incluido en la deuda confirmada de la tarjeta"
                : "La compra ya está incluida en la deuda confirmada de la tarjeta"}
            </label>
          </>
        )}
      </fieldset>
      <p role="alert" className={error ? "text-sm" : "sr-only"}>
        {error}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={historyPrimary}
          disabled={pending || !canPay}
        >
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar guardado"
              : creditActionLabels[action]}
        </button>
        <button
          type="button"
          className={historyButton}
          onClick={() => close()}
          disabled={pending || uncertain}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AmountInput({ name, required }: { name: string; required?: boolean }) {
  return (
    <input
      className={historyControl}
      name={name}
      required={required}
      maxLength={22}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
    />
  );
}

function PaymentFields({
  currency,
  debt,
  banks,
  purchases,
  selectedByDefault,
}: {
  currency: Currency;
  debt: string;
  banks: Currency[];
  purchases: CreditPurchaseOption[];
  selectedByDefault: boolean;
}) {
  const [enabled, setEnabled] = useState(selectedByDefault);
  const [bank, setBank] = useState(
    banks.includes(currency) ? currency : banks[0],
  );
  return (
    <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">Deuda en {currency}</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          name={`pay-${currency}`}
          type="checkbox"
          checked={enabled}
          className="size-5"
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Abonar deuda en {currency} ·{" "}
        {formatBankAmount({ currency, amount: debt })}
      </label>
      {enabled && (
        <>
          <HistoryField label={`Deuda cancelada en ${currency}`}>
            <AmountInput name={`amount-${currency}`} required />
          </HistoryField>
          <HistoryField label={`Saldo bancario para deuda en ${currency}`}>
            <select
              name={`bank-${currency}`}
              value={bank}
              className={historyControl}
              onChange={(event) => setBank(event.target.value as Currency)}
            >
              {banks.map((code) => (
                <option key={code} value={code}>
                  Bancos {code}
                </option>
              ))}
            </select>
          </HistoryField>
          {bank !== currency && (
            <HistoryField
              label={`Importe debitado en ${bank} para deuda en ${currency}`}
            >
              <AmountInput name={`bankAmount-${currency}`} required />
            </HistoryField>
          )}
          <HistoryField
            label={`Comisión bancaria en ${bank} para deuda en ${currency} (opcional)`}
          >
            <AmountInput name={`fee-${currency}`} />
          </HistoryField>
          {purchases.length > 0 && (
            <details className="sm:col-span-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                Asignar a compras en {currency} (opcional)
              </summary>
              <div className="grid gap-2">
                {purchases.map(({ id, concept, amount, effectiveOn }) => (
                  <HistoryField
                    key={id}
                    label={`${concept} · ${formatBankReference(effectiveOn)} · Hasta ${formatBankAmount({ currency, amount })}`}
                  >
                    <AmountInput name={`allocation-${id}`} />
                  </HistoryField>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </fieldset>
  );
}
