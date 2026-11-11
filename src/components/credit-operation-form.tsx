"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  formatBankAmount,
  formatBankReference,
  type BankAvailability,
} from "@/domain/bank-balances";
import type { CatalogCard } from "@/domain/cards";
import {
  maxPurchaseCategories,
  type CreditAction,
  type CreditPurchaseOption,
  type PurchaseCategory,
} from "@/domain/credit-operations";
import {
  coverageDecimal,
  type FundPortion,
  type FundSource,
} from "@/domain/fund-coverage";
import {
  enteredUnits,
  formFundPortions,
  FundPortionFields,
} from "./fund-portion-fields";
import type { Currency } from "@/domain/money";
import {
  formatInstallmentPeriod,
  type InstallmentVersion,
} from "@/domain/installments";
import { InstallmentFields } from "./installment-fields";
import {
  conceptLimit,
  noteLimit,
  type MovementCategory,
} from "@/domain/movements";
import { useFinancialCommand } from "./financial-command";
import {
  AmountInput,
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
  bankAvailability?: BankAvailability[];
  fundSources?: FundSource[] | null;
  categories: MovementCategory[];
  purchases?: CreditPurchaseOption[];
  installmentsReady: boolean;
  debitCards?: CatalogCard[];
  correction?: {
    eventId: string;
    effectiveOn: string;
    cardId: string;
    total: string;
    debitAmount: string;
    debitCardId: string | null;
    amount: string;
    concept: string;
    note: string | null;
    categoryId: string | null;
    categories: PurchaseCategory[];
    covered: boolean;
    plan?: InstallmentVersion;
    fundCommitment?: FundPortion;
    fundPortions?: FundPortion[];
  };
  initialCurrency?: Currency;
  statement?: {
    period: string;
    suggestions: Partial<Record<Currency, string>>;
  };
  close: (message?: string) => void;
};

export function CreditOperationForm({
  action,
  cards,
  today,
  banks,
  bankAvailability,
  fundSources,
  categories,
  purchases = [],
  installmentsReady,
  debitCards,
  correction,
  initialCurrency,
  statement,
  close,
}: Props) {
  const [cardId, setCardId] = useState(correction?.cardId ?? cards[0]?.id);
  const [currency, setCurrency] = useState<Currency | undefined>(
    initialCurrency,
  );
  const [effectiveOn, setEffectiveOn] = useState(
    correction?.effectiveOn ?? today,
  );
  const [debitAmount, setDebitAmount] = useState(correction?.debitAmount ?? "");
  const [financed, setFinanced] = useState(!!correction?.plan);
  const [mixed, setMixed] = useState(!!correction);
  const [split, setSplit] = useState(!!correction?.categories.length);
  const initialSplits = correction?.categories.length
    ? correction.categories
    : [{ method: "debit" as const }, { method: "credit" as const }];
  const [rows, setRows] = useState(() =>
    initialSplits.map((initial, key) => ({ key, initial })),
  );
  const nextRow = useRef(rows.length);
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
  const canUseDebit = banks.includes(selectedCurrency);
  const titleText = correction
    ? "Corregir compra con dos medios"
    : creditActionLabels[action];
  const expenseCategories = categories.filter(({ kind }) => kind === "expense");

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
              fundPortions: formFundPortions(form, `paymentFunds-${currency}`),
              ...(statement && { statementPeriod: statement.period }),
              allocations: purchases.flatMap((purchase) => {
                if (
                  purchase.cardId !== card.id ||
                  purchase.currency !== currency
                )
                  return [];
                const amount = form.get(`allocation-${purchase.id}`);
                const fundAmount = form.get(`fund-${purchase.id}`);
                const fund =
                  purchase.commitment &&
                  typeof fundAmount === "string" &&
                  fundAmount.trim()
                    ? { fundId: purchase.commitment.fundId, amount: fundAmount }
                    : undefined;
                return (typeof amount === "string" && amount.trim()) || fund
                  ? [{ purchaseId: purchase.id, amount, ...(fund && { fund }) }]
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
      const commitment = formFundPortions(form, "fundCommitment");
      const fundPortions = formFundPortions(form, "mixedFunds");
      fields =
        action === "purchase"
          ? {
              ...entry,
              concept: form.get("concept"),
              note: form.get("note"),
              categoryId: form.get("categoryId"),
              covered: form.has("covered"),
              ...(commitment?.length
                ? { fundCommitment: commitment[0] }
                : correction && commitment
                  ? { fundCommitment: null }
                  : {}),
              ...(form.get("creditApplied") && {
                creditApplied: form.get("creditApplied"),
              }),
              ...(financed && {
                amount: form.get("issuerCharge") || "0",
                plan: {
                  installmentAmount: form.get("installmentAmount"),
                  count: Number(form.get("count")),
                  firstPeriod: form.get("firstPeriod"),
                },
              }),
              ...(mixed && {
                mixed: {
                  total: form.get("total"),
                  debitAmount: form.get("debitAmount"),
                  ...(fundPortions &&
                    (fundPortions.length || correction) && { fundPortions }),
                  debitCardId: form.get("debitCardId"),
                  categories: split
                    ? rows.map(({ key }) => ({
                        method: form.get(`method-${key}`),
                        categoryId: form.get(`category-${key}`),
                        amount: form.get(`share-${key}`),
                      }))
                    : [],
                  ...(correction && {
                    correction: {
                      eventId: correction.eventId,
                      planVersion: correction.plan?.version ?? 0,
                    },
                  }),
                },
              }),
            }
          : { ...entry, expectedDebt: position?.debt };
    }
    if (await send(fields))
      close(correction ? "Compra corregida." : success[action]);
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
        {titleText}
        {cards.length === 1 && ` · ${card.name}`}
      </h3>
      <p className="text-sm text-muted-foreground">
        {action === "purchase"
          ? mixed
            ? "El débito sale de Bancos en la fecha indicada. La parte de crédito se registra en un pago o en cuotas, según lo que elijas."
            : financed
              ? "Cada cuota se registra como gasto en su mes. La deuda refleja el cargo confirmado y Bancos se debita al pagar la tarjeta."
              : "La compra se registra como gasto. Bancos se debita cuando pagás la tarjeta."
          : action === "payment"
            ? "Ingresá los importes efectivamente pagados desde Bancos. Podés pagar una parte o toda la deuda."
            : "Ingresá el total de deuda confirmado por el emisor. El ajuste conserva la diferencia en el historial."}
      </p>
      {action === "payment" && statement && (
        <p className="text-sm">
          Los abonos se asignarán al ciclo de{" "}
          {formatInstallmentPeriod(statement.period)}. Verificá los importes
          sugeridos e indicá el saldo bancario que usaste.
        </p>
      )}
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
            value={effectiveOn}
            onChange={(event) => setEffectiveOn(event.target.value)}
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
                  bankAvailability={bankAvailability}
                  fundSources={fundSources}
                  effectiveOn={effectiveOn}
                  selectedByDefault={
                    statement
                      ? Boolean(statement.suggestions[currency])
                      : payable.length === 1
                  }
                  suggestedAmount={statement?.suggestions[currency]}
                  requireBankSelection={!!statement}
                  purchases={purchases.filter(
                    (purchase) =>
                      purchase.cardId === card.id &&
                      purchase.currency === currency &&
                      purchase.effectiveOn <= effectiveOn,
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
                label={
                  action === "adjustment"
                    ? "Total confirmado"
                    : mixed
                      ? "Porción de crédito"
                      : "Importe"
                }
              >
                <AmountInput
                  name="amount"
                  required
                  defaultValue={correction?.amount}
                />
              </HistoryField>
            )}
          </>
        )}
        {action === "purchase" && (
          <>
            {debitCards && banks.length > 0 && !correction && (
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={mixed}
                  onChange={(event) => setMixed(event.target.checked)}
                  className="size-5 shrink-0"
                />
                Pagué una parte con débito
              </label>
            )}
            {mixed && (
              <>
                <HistoryField label="Total de la compra">
                  <AmountInput
                    name="total"
                    required
                    defaultValue={correction?.total}
                  />
                </HistoryField>
                <HistoryField label={`Débito de Bancos ${selectedCurrency}`}>
                  <AmountInput
                    name="debitAmount"
                    required
                    value={debitAmount}
                    onChange={(event) => setDebitAmount(event.target.value)}
                  />
                </HistoryField>
                {fundSources && canUseDebit && (
                  <FundPortionFields
                    key={`debit-${selectedCurrency}`}
                    name="mixedFunds"
                    funds={fundSources}
                    currency={selectedCurrency}
                    amount={debitAmount}
                    initial={
                      selectedCurrency === initialCurrency
                        ? correction?.fundPortions
                        : undefined
                    }
                    available={
                      bankAvailability?.find(
                        (bank) =>
                          bank.currency === selectedCurrency &&
                          effectiveOn >= bank.asOfDate,
                      )?.availableAmount
                    }
                  />
                )}
                {!canUseDebit && (
                  <p role="status" className="text-sm sm:col-span-2">
                    Configurá un saldo bancario en {selectedCurrency} o elegí
                    otra moneda.
                  </p>
                )}
                {debitCards && debitCards.length > 0 && (
                  <HistoryField label="Tarjeta de débito (opcional)">
                    <select
                      key={selectedCurrency}
                      name="debitCardId"
                      defaultValue={
                        selectedCurrency === initialCurrency
                          ? (correction?.debitCardId ?? "")
                          : ""
                      }
                      className={historyControl}
                    >
                      <option value="">
                        Débito bancario sin tarjeta asociada
                      </option>
                      {debitCards
                        .filter(
                          ({ id, currencies, archived }) =>
                            (id === correction?.debitCardId &&
                              selectedCurrency === initialCurrency) ||
                            (!archived &&
                              currencies.some(
                                ({ currency }) => currency === selectedCurrency,
                              )),
                        )
                        .map(({ id, name }) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                    </select>
                  </HistoryField>
                )}
              </>
            )}
            {installmentsReady && (
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={financed}
                  onChange={(event) => setFinanced(event.target.checked)}
                  className="size-5 shrink-0"
                />
                {mixed
                  ? "Porción de crédito en cuotas iguales"
                  : "Compra en cuotas iguales"}
              </label>
            )}
            {financed && (
              <>
                <InstallmentFields
                  currency={selectedCurrency}
                  firstPeriod={today.slice(0, 7)}
                  {...correction?.plan}
                />
                <HistoryField label="Cargo confirmado por el emisor (opcional)">
                  <AmountInput
                    name="issuerCharge"
                    defaultValue={
                      correction?.plan ? correction.amount : undefined
                    }
                  />
                </HistoryField>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Ingresá solo el importe reflejado por el emisor. Dejalo vacío
                  si aún no figura un cargo.
                </p>
              </>
            )}
            {!correction &&
              card.currencies.some(
                ({ currency, creditBalance }) =>
                  currency === selectedCurrency &&
                  /[1-9]/.test(creditBalance ?? ""),
              ) && (
                <HistoryField label="Saldo a favor aplicado por el emisor (opcional)">
                  <AmountInput name="creditApplied" />
                </HistoryField>
              )}
            {fundSources &&
              (fundSources.some(
                (fund) =>
                  fund.currency === selectedCurrency &&
                  Number(fund.availableAmount) > 0,
              ) ||
                (correction?.fundCommitment &&
                  selectedCurrency === initialCurrency)) && (
                <FundPortionFields
                  key={`credit-${selectedCurrency}`}
                  name="fundCommitment"
                  funds={fundSources}
                  currency={selectedCurrency}
                  amount=""
                  commitment
                  initial={
                    correction?.fundCommitment &&
                    selectedCurrency === initialCurrency
                      ? [correction.fundCommitment]
                      : undefined
                  }
                />
              )}
            <HistoryField label="Concepto">
              <input
                className={historyControl}
                name="concept"
                required
                maxLength={conceptLimit}
                defaultValue={correction?.concept}
              />
            </HistoryField>
            {mixed && (
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={split}
                  onChange={(event) => setSplit(event.target.checked)}
                  className="size-5 shrink-0"
                />
                Dividir entre categorías
              </label>
            )}
            {mixed && split ? (
              <fieldset className="grid min-w-0 gap-3 rounded-lg border p-3 sm:col-span-2">
                <legend className="px-1 text-sm font-medium">
                  Reparto de la compra
                </legend>
                <p className="text-sm text-muted-foreground">
                  Asigná el importe completo de cada medio. Para crédito en
                  cuotas, repartí el total financiado.
                </p>
                {rows.map(({ key, initial }, index) => (
                  <fieldset
                    key={key}
                    className="grid min-w-0 gap-2 rounded-lg border p-2 sm:grid-cols-3"
                  >
                    <legend className="px-1 text-sm">
                      Porción {index + 1}
                    </legend>
                    <HistoryField label="Medio de la porción">
                      <select
                        name={`method-${key}`}
                        defaultValue={initial.method}
                        className={historyControl}
                      >
                        <option value="debit">Débito</option>
                        <option value="credit">Crédito</option>
                      </select>
                    </HistoryField>
                    <HistoryField label="Categoría de la porción">
                      <CategorySelect
                        name={`category-${key}`}
                        categories={expenseCategories}
                        initial={
                          "categoryId" in initial ? initial.categoryId : null
                        }
                      />
                    </HistoryField>
                    <HistoryField label="Importe de la porción">
                      <AmountInput
                        name={`share-${key}`}
                        required
                        defaultValue={
                          "amount" in initial ? initial.amount : undefined
                        }
                      />
                    </HistoryField>
                    {rows.length > 2 && (
                      <button
                        type="button"
                        className={historyButton}
                        onClick={() =>
                          setRows(rows.filter((row) => row.key !== key))
                        }
                      >
                        Quitar porción {index + 1}
                      </button>
                    )}
                  </fieldset>
                ))}
                {rows.length < maxPurchaseCategories && (
                  <button
                    type="button"
                    className={`${historyButton} justify-self-start`}
                    onClick={() => {
                      const key = nextRow.current++;
                      setRows([
                        ...rows,
                        { key, initial: { method: "credit" } },
                      ]);
                    }}
                  >
                    Agregar porción
                  </button>
                )}
              </fieldset>
            ) : (
              <HistoryField label="Categoría (opcional)">
                <CategorySelect
                  name="categoryId"
                  categories={expenseCategories}
                  initial={correction?.categoryId}
                />
              </HistoryField>
            )}
            <HistoryField label="Nota (opcional)">
              <input
                className={historyControl}
                name="note"
                maxLength={noteLimit}
                defaultValue={correction?.note ?? ""}
              />
            </HistoryField>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="covered"
                className="size-5 shrink-0"
                defaultChecked={correction?.covered}
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
          disabled={pending || !canPay || (mixed && !canUseDebit)}
        >
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar guardado"
              : titleText}
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

function CategorySelect({
  name,
  categories,
  initial,
}: {
  name: string;
  categories: MovementCategory[];
  initial?: string | null;
}) {
  return (
    <select name={name} defaultValue={initial ?? ""} className={historyControl}>
      <option value="">Sin categorizar</option>
      {initial && !categories.some(({ id }) => id === initial) && (
        <option value={initial}>Categoría archivada</option>
      )}
      {categories.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

function PaymentFields({
  currency,
  debt,
  banks,
  bankAvailability,
  fundSources,
  effectiveOn,
  purchases,
  selectedByDefault,
  suggestedAmount,
  requireBankSelection,
}: {
  currency: Currency;
  debt: string;
  banks: Currency[];
  purchases: CreditPurchaseOption[];
  bankAvailability?: BankAvailability[];
  fundSources?: FundSource[] | null;
  effectiveOn: string;
  selectedByDefault: boolean;
  suggestedAmount?: string;
  requireBankSelection: boolean;
}) {
  const [enabled, setEnabled] = useState(selectedByDefault);
  const [bank, setBank] = useState<string>(
    requireBankSelection ? "" : banks.includes(currency) ? currency : banks[0],
  );
  const [debit, setDebit] = useState(suggestedAmount ?? "");
  const [foreignDebit, setForeignDebit] = useState("");
  const [fee, setFee] = useState("");
  const [funds, setFunds] = useState<Record<string, string>>({});
  const [allocated, setAllocated] = useState<Record<string, string>>({});
  const [unassigned, setUnassigned] = useState<FundPortion[]>([]);
  const sources =
    bank === currency
      ? [
          ...purchases.map(({ id }) => funds[id] ?? ""),
          ...unassigned.map(({ amount }) => amount),
        ].reduce(
          (sum, value) => sum + (enteredUnits(value) ?? BigInt(0)),
          BigInt(0),
        )
      : BigInt(0);
  const debtPayment = enteredUnits(debit);
  const debtRemaining =
    debtPayment === null
      ? null
      : (enteredUnits(debt) ?? BigInt(0)) - debtPayment;
  const total = bank === currency ? debtPayment : enteredUnits(foreignDebit);
  const free =
    total === null ? null : total + (enteredUnits(fee) ?? BigInt(0)) - sources;
  const available = bankAvailability?.find(
    (row) => row.currency === bank && effectiveOn >= row.asOfDate,
  );
  const freeLimit = enteredUnits(available?.availableAmount ?? "");
  const shortfall =
    free === null || freeLimit === null
      ? null
      : free - (freeLimit > BigInt(0) ? freeLimit : BigInt(0));
  return (
    <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">Deuda en {currency}</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          name={`pay-${currency}`}
          type="checkbox"
          checked={enabled}
          className="size-5"
          onChange={(event) => {
            setEnabled(event.target.checked);
            setFunds({});
            setAllocated({});
            setUnassigned([]);
          }}
        />
        Abonar deuda en {currency} ·{" "}
        {formatBankAmount({ currency, amount: debt })}
      </label>
      {enabled && (
        <>
          <HistoryField label={`Deuda cancelada en ${currency}`}>
            <AmountInput
              name={`amount-${currency}`}
              required
              value={debit}
              onChange={(event) => setDebit(event.target.value)}
            />
          </HistoryField>
          <HistoryField label={`Saldo bancario para deuda en ${currency}`}>
            <select
              name={`bank-${currency}`}
              value={bank}
              required
              className={historyControl}
              onChange={(event) => {
                setBank(event.target.value);
                setFunds({});
                setUnassigned([]);
              }}
            >
              {requireBankSelection && <option value="">Elegí un saldo</option>}
              {banks.map((code) => (
                <option key={code} value={code}>
                  Bancos {code}
                </option>
              ))}
            </select>
          </HistoryField>
          {bank && bank !== currency && (
            <HistoryField
              label={`Importe debitado en ${bank} para deuda en ${currency}`}
            >
              <AmountInput
                name={`bankAmount-${currency}`}
                required
                value={foreignDebit}
                onChange={(event) => setForeignDebit(event.target.value)}
              />
            </HistoryField>
          )}
          {bank && (
            <HistoryField
              label={`Comisión bancaria en ${bank} para deuda en ${currency} (opcional)`}
            >
              <AmountInput
                name={`fee-${currency}`}
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
            </HistoryField>
          )}
          {purchases.length > 0 && (
            <details
              className="sm:col-span-2"
              open={
                purchases.some((purchase) => purchase.commitment) || undefined
              }
            >
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                Asignar a compras en {currency} (opcional)
              </summary>
              <div className="grid gap-2">
                {purchases.map(
                  ({ id, concept, amount, effectiveOn, commitment }) => {
                    const applied = enteredUnits(allocated[id] ?? "");
                    const used =
                      bank === currency
                        ? (enteredUnits(funds[id] ?? "") ?? BigInt(0))
                        : BigInt(0);
                    const pending =
                      (enteredUnits(amount) ?? BigInt(0)) -
                      (applied ?? BigInt(0));
                    const reserved =
                      (enteredUnits(commitment?.amount ?? "") ?? BigInt(0)) -
                      used;
                    const remaining = reserved < pending ? reserved : pending;
                    return (
                      <div
                        key={id}
                        className="grid gap-2 rounded-md border p-2 sm:grid-cols-2"
                      >
                        <HistoryField
                          label={`${concept} · ${formatBankReference(effectiveOn)} · Hasta ${formatBankAmount({ currency, amount })}`}
                        >
                          <AmountInput
                            name={`allocation-${id}`}
                            value={allocated[id] ?? ""}
                            onChange={(event) =>
                              setAllocated((current) => ({
                                ...current,
                                [id]: event.target.value,
                              }))
                            }
                          />
                        </HistoryField>
                        {commitment && bank === currency && (
                          <HistoryField
                            label={`Usar ${commitment.name} para ${concept} · Hasta ${formatBankAmount({ currency, amount: commitment.amount })}`}
                          >
                            <AmountInput
                              name={`fund-${id}`}
                              value={funds[id] ?? ""}
                              onChange={(event) =>
                                setFunds((current) => ({
                                  ...current,
                                  [id]: event.target.value,
                                }))
                              }
                            />
                          </HistoryField>
                        )}
                        {commitment &&
                          applied !== null &&
                          applied > BigInt(0) &&
                          used <= applied &&
                          remaining >= BigInt(0) && (
                            <p className="text-sm text-muted-foreground sm:col-span-2">
                              Compromiso restante:{" "}
                              {formatBankAmount({
                                currency,
                                amount: coverageDecimal(remaining),
                              })}
                            </p>
                          )}
                      </div>
                    );
                  },
                )}
              </div>
            </details>
          )}
          {fundSources?.some(
            (fund) =>
              fund.currency === currency && Number(fund.availableAmount) > 0,
          ) &&
            bank === currency && (
              <FundPortionFields
                name={`paymentFunds-${currency}`}
                funds={fundSources}
                currency={currency}
                amount=""
                payment
                onPortionsChange={setUnassigned}
              />
            )}
          {debtRemaining !== null && debtRemaining >= BigInt(0) && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Deuda restante:{" "}
              {formatBankAmount({
                currency,
                amount: coverageDecimal(debtRemaining),
              })}
            </p>
          )}
          {available && free !== null && (
            <div
              aria-live="polite"
              className="text-sm text-muted-foreground sm:col-span-2"
            >
              <p>
                De fondos:{" "}
                {formatBankAmount({
                  currency: available.currency,
                  amount: coverageDecimal(sources),
                })}{" "}
                · Del disponible:{" "}
                {formatBankAmount({
                  currency: available.currency,
                  amount: coverageDecimal(free),
                })}
              </p>
              {shortfall !== null && shortfall > BigInt(0) && (
                <p>
                  Faltan{" "}
                  {formatBankAmount({
                    currency: available.currency,
                    amount: coverageDecimal(shortfall),
                  })}{" "}
                  para cubrir el pago.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
