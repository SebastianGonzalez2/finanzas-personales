"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFinancialCommand } from "@/components/financial-command";
import {
  AmountInput,
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "@/components/history-fields";
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
    <div className="grid gap-2 py-3 text-sm wrap-anywhere">
      <p className="font-semibold">
        {link ? (
          <Link
            href={`/historial/movimientos/${entry.id}`}
            className="underline"
          >
            {entry.concept}
          </Link>
        ) : (
          entry.concept
        )}{" "}
        · {format(entry.amount)} · {formatBankReference(entry.effectiveOn)}
        {!active && " · Anulado"}
      </p>
      <p>
        {entry.destination === "bank"
          ? "Acreditado en Bancos. Registrado como ingreso por beneficio bancario."
          : `Abono en ${entry.card ?? "la tarjeta"}. Reducción de deuda · ${format(entry.debtReduced)}. Saldo a favor generado · ${format(entry.creditDelta)}. No genera un depósito en Bancos.`}
      </p>
      {entry.note && <p>{entry.note}</p>}
      {active &&
        (review ? (
          <div className="grid gap-2">
            <p>
              Se anulará el registro de la app y se revertirá su efecto en{" "}
              {entry.destination === "bank" ? "Bancos" : "la tarjeta"}. Las
              compras originales no cambian.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={historyButton}
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
                className={historyButton}
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
            className={`${historyButton} w-fit`}
            onClick={() => setReview(true)}
          >
            Anular este registro
          </button>
        ))}
      {error && <p role="alert">{error}</p>}
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
    <section
      aria-label="Registrar beneficio bancario"
      className="grid gap-3 rounded-lg border p-3"
    >
      <h2 className="font-semibold">Registrar beneficio bancario</h2>
      <p className="text-sm">
        Para cashback o bonificaciones que el banco ya acreditó y que no
        corresponden a una compra concreta. Si es la devolución de una compra,
        registrala desde esa compra en el Historial.
      </p>
      <form key={round} className="grid gap-3" onSubmit={prepare}>
        <fieldset disabled={!!preview || pending} className="grid gap-3">
          <HistoryField label="¿Dónde se acreditó?">
            <select
              className={historyControl}
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
            </select>
          </HistoryField>
          {destination === "card" && (
            <HistoryField label="Tarjeta">
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
            </HistoryField>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <HistoryField label="Importe acreditado">
              <AmountInput name="amount" required />
            </HistoryField>
            <HistoryField label="Moneda">
              <select
                name="currency"
                className={historyControl}
                key={`${destination}-${cardId}`}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </HistoryField>
          </div>
          <HistoryField label="Fecha de acreditación">
            <input
              name="effectiveOn"
              type="date"
              className={historyControl}
              defaultValue={today}
              max={today}
              required
            />
          </HistoryField>
          <HistoryField label="Concepto (opcional)">
            <input
              name="concept"
              className={historyControl}
              maxLength={benefitConceptLimit}
              placeholder={defaultBenefitConcept}
              autoComplete="off"
            />
          </HistoryField>
          <HistoryField label="Nota (opcional)">
            <textarea
              name="note"
              className={historyControl}
              maxLength={benefitNoteLimit}
              rows={2}
            />
          </HistoryField>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input name="credited" type="checkbox" required />
            El banco ya acreditó este importe
          </label>
          <button type="submit" className={`${historyButton} w-fit`}>
            Revisar
          </button>
        </fieldset>
      </form>
      {inputError && <p role="alert">{inputError}</p>}
      {preview && (
        <div className="grid gap-2 text-sm" aria-label="Resumen para confirmar">
          <ul className="grid gap-1">
            {preview.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={historyPrimary}
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
            <button
              type="button"
              className={historyButton}
              disabled={pending || uncertain}
              onClick={() => setPreview(undefined)}
            >
              Volver
            </button>
          </div>
        </div>
      )}
      {saved && <p role="status">{saved}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
