"use client";

import { DateInput } from "./ui/date-fields";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFinancialCommand } from "@/components/financial-command";
import {
  FormFoot,
  FormPanel,
  RowIcon,
  StateTag,
} from "@/components/glaciar/screen";
import { AmountInput } from "@/components/history-fields";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  bankCurrencies,
  formatBankAmount,
  formatBankReference,
} from "@/domain/bank-balances";
import {
  benefitConceptLimit,
  benefitNoteLimit,
  defaultBenefitConcept,
  type BankBenefitDestination,
  type BankBenefitEntry,
} from "@/domain/bank-benefits";
import type { Currency } from "@/domain/money";
import { amountUnits, refundDecimal } from "@/domain/refunds";

export type BenefitCard = {
  id: string;
  name: string;
  currencies: Currency[];
};

const destinationLabels: Record<BankBenefitDestination, string> = {
  bank: "Cuenta bancaria (Bancos)",
  card: "Abono en tarjeta de crédito",
};

export function BankBenefitRecord({
  entry,
  link = false,
}: {
  entry: BankBenefitEntry;
  link?: boolean;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/bank-benefits",
    "POST",
  );
  const [review, setReview] = useState(false);
  const format = (amount: string) =>
    formatBankAmount({ currency: entry.currency, amount });
  const active = entry.status === "confirmed";
  return (
    <div className="gs-benefit wrap-anywhere">
      <div className="gs-benefit__top">
        <RowIcon name="benefits" accent={active} />
        <div className="gs-row__main">
          <p
            className={`gs-row__title ${active ? "" : "text-(--glaciar-faint) line-through"}`}
          >
            {link ? (
              <Link
                href={`/historial/movimientos/${entry.id}`}
                className="underline"
              >
                {entry.concept}
              </Link>
            ) : (
              entry.concept
            )}
          </p>
          <p className="gs-row__sub">
            {formatBankReference(entry.effectiveOn)} ·{" "}
            {entry.destination === "bank"
              ? "Bancos"
              : `Abono en ${entry.card ?? "la tarjeta"}`}
          </p>
        </div>
        <div className="gs-row__aside">
          <span
            className={`gs-row__amount ${active ? "is-positive" : "lab-muted"}`}
          >
            {format(entry.amount)}
          </span>
          {!active && <StateTag tone="neutral">Anulado</StateTag>}
        </div>
      </div>
      <p className="gs-row__sub">
        {entry.destination === "bank"
          ? "Acreditado en Bancos. Registrado como ingreso por beneficio bancario."
          : `Abono en ${entry.card ?? "la tarjeta"}. Reducción de deuda · ${format(entry.debtReduced)}. Saldo a favor generado · ${format(entry.creditDelta)}. No genera un depósito en Bancos.`}
      </p>
      {entry.note && <p className="gs-row__sub">{entry.note}</p>}
      {active &&
        (review ? (
          <div className="gs-confirm">
            <p>
              Se anulará el registro de la app y se revertirá su efecto en{" "}
              {entry.destination === "bank" ? "Bancos" : "la tarjeta"}. Las
              compras originales no cambian.
            </p>
            <div className="gs-actions">
              <button
                type="button"
                className={buttonClass("outline", "gs-btn-danger")}
                disabled={pending}
                onClick={async () => {
                  if (await send({ action: "void", eventId: entry.id })) {
                    setReview(false);
                    router.refresh();
                  }
                }}
              >
                {uncertain ? "Reintentar anulación" : "Confirmar anulación"}
              </button>
              <button
                type="button"
                className={buttonClass("ghost")}
                disabled={pending || uncertain}
                onClick={() => setReview(false)}
              >
                Volver
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={buttonClass("outline", "w-fit")}
            onClick={() => setReview(true)}
          >
            Anular este registro
          </button>
        ))}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function BankBenefitForm({
  cards,
  today,
  bankCurrenciesReady,
}: {
  cards: BenefitCard[];
  today: string;
  bankCurrenciesReady: Currency[];
}) {
  const router = useRouter();
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/bank-benefits",
    "POST",
  );
  const [destination, setDestination] =
    useState<BankBenefitDestination>("bank");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [preview, setPreview] = useState<{
    fields: Record<string, unknown>;
    summary: string[];
  }>();
  const [inputError, setInputError] = useState("");
  const [saved, setSaved] = useState("");
  const [round, setRound] = useState(0);
  const card = cards.find(({ id }) => id === cardId);
  const currencies =
    destination === "card"
      ? (card?.currencies ?? [])
      : bankCurrenciesReady.length
        ? bankCurrenciesReady
        : [...bankCurrencies];

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setSaved("");
    setInputError("");
    const form = new FormData(event.currentTarget);
    const amount = String(form.get("amount")).trim().replace(",", ".");
    const currency = String(form.get("currency")) as Currency;
    const effectiveOn = String(form.get("effectiveOn"));
    const concept = String(form.get("concept")).trim();
    const note = String(form.get("note")).trim();
    try {
      if (
        !form.get("credited") ||
        !/^\d{1,16}([.]\d{1,4})?$/.test(amount) ||
        amountUnits(amount) <= BigInt(0) ||
        !currencies.includes(currency) ||
        (destination === "card" && !card)
      )
        throw new Error();
      const format = (value: string) =>
        formatBankAmount({
          currency,
          amount: refundDecimal(amountUnits(value)),
        });
      setPreview({
        fields: {
          action: "register",
          destination,
          cardId: destination === "card" ? cardId : null,
          currency,
          amount,
          effectiveOn,
          concept: concept || defaultBenefitConcept,
          note: note || null,
          credited: true,
        },
        summary:
          destination === "bank"
            ? [
                `Bancos ${currency} aumenta ${format(amount)} el ${formatBankReference(effectiveOn)}.`,
                "Se registra un ingreso por beneficio bancario una sola vez.",
                "No cambia compras anteriores ni presupuestos.",
              ]
            : [
                `${card?.name} recibe un abono de ${format(amount)} el ${formatBankReference(effectiveOn)}.`,
                "El abono reduce la deuda y el excedente queda como saldo a favor.",
                "Se registra el ingreso por beneficio bancario. No se crea ningún depósito en Bancos.",
                "No cambia compras anteriores ni presupuestos.",
              ],
      });
    } catch {
      setInputError(
        "Revisá el importe, la moneda y confirmá que el beneficio ya fue acreditado.",
      );
    }
  }

  return (
    <FormPanel
      labelId="form-beneficio"
      title="Registrar beneficio bancario"
      description="Si es la devolución de una compra, registrala desde esa compra en el Historial."
    >
      <form key={round} className="grid gap-4" onSubmit={prepare}>
        <fieldset
          disabled={!!preview || pending}
          className="grid min-w-0 gap-4 border-0 p-0"
        >
          <div className="gs-form__grid">
            <Field label="¿Dónde se acreditó?">
              <Select
                value={destination}
                onChange={(event) =>
                  setDestination(event.target.value as BankBenefitDestination)
                }
              >
                {(Object.keys(destinationLabels) as BankBenefitDestination[])
                  .filter((key) => key === "bank" || cards.length > 0)
                  .map((key) => (
                    <option key={key} value={key}>
                      {destinationLabels[key]}
                    </option>
                  ))}
              </Select>
            </Field>
            {destination === "card" && (
              <Field label="Tarjeta">
                <Select
                  value={cardId}
                  onChange={(event) => setCardId(event.target.value)}
                >
                  {cards.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <p className="gs-hint gs-form__full">
              {destination === "bank"
                ? "Sube el saldo en Bancos y se registra como ingreso por beneficio bancario."
                : "Reduce la deuda de la tarjeta; el excedente queda como saldo a favor. No crea un depósito en Bancos."}
            </p>
            <Field label="Importe acreditado">
              <AmountInput name="amount" required />
            </Field>
            <Field label="Moneda">
              <Select name="currency" key={`${destination}-${cardId}`}>
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha de acreditación">
              <DateInput
                name="effectiveOn"
                defaultValue={today}
                max={today}
                required
              />
            </Field>
            <Field label="Concepto (opcional)">
              <Input
                name="concept"
                maxLength={benefitConceptLimit}
                placeholder={defaultBenefitConcept}
                autoComplete="off"
              />
            </Field>
            <Field label="Nota (opcional)" className="gs-form__full">
              <Textarea name="note" maxLength={benefitNoteLimit} rows={2} />
            </Field>
            <label className="gs-check gs-form__full">
              <input name="credited" type="checkbox" required />
              El banco ya acreditó este importe
            </label>
          </div>
          <FormFoot>
            <button type="submit" className={buttonClass("primary")}>
              Revisar
            </button>
          </FormFoot>
        </fieldset>
      </form>
      {inputError && (
        <p role="alert" className="text-sm">
          {inputError}
        </p>
      )}
      {preview && (
        <div
          role="group"
          aria-label="Resumen para confirmar"
          className="gs-confirm"
        >
          <p className="gs-form__section-title">Qué cambia al confirmar</p>
          <ul className="gs-effects">
            {preview.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <FormFoot>
            <button
              type="button"
              className={buttonClass("ghost")}
              disabled={pending || uncertain}
              onClick={() => setPreview(undefined)}
            >
              Volver
            </button>
            <button
              type="button"
              className={buttonClass("primary")}
              disabled={pending}
              onClick={async () => {
                if (await send(preview.fields)) {
                  setPreview(undefined);
                  setSaved("Beneficio registrado.");
                  setRound((value) => value + 1);
                  router.refresh();
                }
              }}
            >
              {uncertain ? "Reintentar el mismo envío" : "Confirmar registro"}
            </button>
          </FormFoot>
        </div>
      )}
      {saved && <p role="status">{saved}</p>}
      {error && <p role="alert">{error}</p>}
    </FormPanel>
  );
}
