"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useFinancialCommand } from "@/components/financial-command";
import {
  AmountInput,
  HistoryField,
  historyButton,
  historyControl,
} from "@/components/history-fields";

import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import { formatInstallmentPeriod } from "@/domain/installments";
import {
  amountUnits,
  refundDecimal,
  refundPartKey,
  unmatchedRefund,
  type RefundEntry,
} from "@/domain/refunds";
import type { Currency } from "@/domain/money";
import type { PurchaseRefunds } from "@/server/refunds";

const actionLabels = {
  pending: "Solicitud de devolución",
  credit: "Devolución recibida",
  cancel_installments: "Cuotas canceladas por el emisor",
  return_balance: "Reintegro de saldo a favor a Bancos",
  void: "Anulación",
};

const methods = {
  debit: "Bancos · débito",
  credit: "Tarjeta de crédito",
};

function sumAmounts(values: string[]) {
  return refundDecimal(
    values.reduce((sum, value) => sum + amountUnits(value), BigInt(0)),
  );
}

export function RefundRecord({
  entry,
  linkPurchase = false,
}: {
  entry: RefundEntry;
  linkPurchase?: boolean;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/refunds",
    "POST",
  );
  const [review, setReview] = useState(false);
  const { currency } = entry;
  const format = (amount: string) => formatBankAmount({ currency, amount });
  const outstanding = entry.action === "pending" && entry.status === "pending";
  const inactive = entry.status === "voided";
  return (
    <div className="grid gap-2 py-3 text-sm wrap-anywhere">
      <p className="font-semibold">
        {actionLabels[entry.action]} · {format(entry.amount)} ·{" "}
        {formatBankReference(entry.effectiveOn)}
        {inactive && " · Anulada"}
      </p>
      {linkPurchase && entry.purchaseId && (
        <Link
          href={`/historial/movimientos/${entry.purchaseId}`}
          className="w-fit underline"
        >
          Compra original · {entry.purchaseConcept}
        </Link>
      )}
      {entry.pendingId && linkPurchase && (
        <Link
          href={`/historial/movimientos/${entry.pendingId}`}
          className="w-fit underline"
        >
          Ver solicitud de devolución
        </Link>
      )}
      {outstanding && <p>Pendiente de confirmar · {format(entry.remaining)}</p>}
      {entry.action === "pending" && !outstanding && !inactive && (
        <p>Solicitud completada</p>
      )}
      {entry.parts.length > 0 && (
        <ul aria-label="Asignación de la devolución" className="grid gap-1">
          {entry.parts.map((part) => (
            <li key={refundPartKey(part)}>
              {methods[part.method]} · {part.category ?? "Sin categorizar"} ·{" "}
              {format(part.amount)}
              {amountUnits(part.overlap) > BigInt(0) &&
                ` · ${format(part.overlap)} ya reflejados en el otro registro`}
            </li>
          ))}
        </ul>
      )}
      {entry.ordinals.length > 0 && <p>Cuotas · {entry.ordinals.join(", ")}</p>}
      {entry.card && (
        <div>
          <p>{entry.card}</p>
          {entry.action === "credit" && (
            <p>
              Reducción de deuda · {format(entry.debtReduced)}. Saldo a favor
              generado · {format(entry.creditDelta)}.
            </p>
          )}
        </div>
      )}
      {!inactive &&
        (entry.action !== "pending" || outstanding) &&
        (review ? (
          <div className="grid gap-2">
            <p>
              {outstanding
                ? "Se cerrará el importe pendiente. Las acreditaciones previas se conservan."
                : "Se anulará el registro de la app y se revertirán sus efectos aplicables."}
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
            {outstanding
              ? "Cerrar solicitud pendiente"
              : "Anular este registro"}
          </button>
        ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function PurchaseRefundPanel({
  purchase,
  today,
}: {
  purchase: PurchaseRefunds;
  today: string;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/refunds",
    "POST",
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedAction, setAction] = useState("credit");
  const [overlaps, setOverlaps] = useState(false);
  const [preview, setPreview] = useState<{
    fields: Record<string, unknown>;
    summary: string[];
  }>();
  const [inputError, setInputError] = useState("");
  const [saved, setSaved] = useState("");
  const { currency } = purchase;
  const format = (amount: string) => formatBankAmount({ currency, amount });
  const requests = purchase.entries.filter(
    ({ status }) => status === "pending",
  );
  const future = purchase.installments.filter(
    ({ period }) => period > today.slice(0, 7),
  );
  const remaining = sumAmounts(purchase.parts.map((part) => part.remaining));
  const hasRemaining = amountUnits(remaining) > BigInt(0);
  const hasMatch = (action: string) =>
    purchase.parts.some((part) => unmatchedRefund(part, action) > BigInt(0));
  const actions = [
    ...(hasRemaining || hasMatch("credit") ? ["credit"] : []),
    ...(hasRemaining ? ["pending"] : []),
    ...(future.length && (hasRemaining || hasMatch("cancel_installments"))
      ? ["cancel_installments"]
      : []),
  ];
  const action = actions.includes(selectedAction) ? selectedAction : actions[0];
  const eligible = purchase.parts
    .map((part) => ({
      ...part,
      remaining: refundDecimal(
        amountUnits(part.remaining) +
          (overlaps ? unmatchedRefund(part, "credit") : BigInt(0)),
      ),
    }))
    .filter((part) => amountUnits(part.remaining) > BigInt(0));

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setSaved("");
    setInputError("");
    const form = new FormData(event.currentTarget);
    const effectiveOn = String(form.get("effectiveOn"));
    const fields = { action, purchaseId: purchase.id, effectiveOn };
    try {
      if (action === "pending") {
        const amount = String(form.get("amount")).replace(",", ".");
        if (
          amountUnits(amount) <= BigInt(0) ||
          amountUnits(amount) > amountUnits(remaining)
        )
          throw new Error();
        setPreview({
          fields: { ...fields, amount },
          summary: [
            `Solicitud pendiente · ${format(amount)}`,
            "Los saldos y las cuotas se conservan hasta confirmar qué hizo el emisor.",
          ],
        });
        return;
      }
      const pendingId = form.get("pendingId") || null;
      const matchNote =
        "El importe que coincide con un abono o cancelación previa se aplica una sola vez a la devolución.";
      if (action === "cancel_installments") {
        const ordinals = form.getAll("ordinal").map(Number);
        if (!ordinals.length) throw new Error();
        const total = sumAmounts(
          future
            .filter(({ ordinal }) => ordinals.includes(ordinal))
            .map(({ amount }) => amount),
        );
        setPreview({
          fields: { ...fields, pendingId, ordinals, overlaps },
          summary: [
            `Cuotas ${ordinals.join(", ")} · ${format(total)}`,
            "Se retiran del calendario. Registrá por separado cualquier abono efectivamente acreditado.",
            ...(overlaps ? [matchNote] : []),
          ],
        });
        return;
      }
      const parts = eligible.flatMap(({ method, categoryId, remaining }) => {
        const amount = String(
          form.get(refundPartKey({ method, categoryId })) ?? "",
        ).replace(",", ".");
        if (!amount || amountUnits(amount) === BigInt(0)) return [];
        if (
          amountUnits(amount) < BigInt(0) ||
          amountUnits(amount) > amountUnits(remaining)
        )
          throw new Error();
        return [{ method, categoryId, amount }];
      });
      if (!parts.length) throw new Error();
      const summary = (["debit", "credit"] as const).flatMap((method) => {
        const matching = parts.filter((part) => part.method === method);
        if (!matching.length) return [];
        const amount = format(sumAmounts(matching.map((part) => part.amount)));
        return [
          method === "debit"
            ? `Bancos recibe ${amount}.`
            : `${purchase.card} recibe ${amount}. El abono reduce deuda y el excedente queda a favor.`,
        ];
      });
      setPreview({
        fields: { ...fields, pendingId, parts, overlaps },
        summary: overlaps ? [...summary, matchNote] : summary,
      });
    } catch {
      setInputError("Revisá los importes y las cuotas seleccionadas.");
    }
  }

  return (
    <section
      aria-label="Devoluciones de la compra"
      className="grid gap-3 border-t pt-4"
    >
      <h2 className="font-semibold">Devoluciones de la compra</h2>
      <p className="text-sm">Máximo restante · {format(remaining)}</p>
      <ul className="grid gap-2 text-sm">
        {purchase.parts.map((part) => (
          <li key={refundPartKey(part)} className="wrap-anywhere">
            {methods[part.method]}
            {part.method === "credit" && purchase.card && ` · ${purchase.card}`}
            {part.method === "debit" &&
              purchase.debitCard &&
              ` · ${purchase.debitCard}`}
            {" · "}
            {part.category ?? "Sin categorizar"} · Original{" "}
            {format(part.amount)} · Aplicado{" "}
            {format(
              refundDecimal(
                amountUnits(part.amount) - amountUnits(part.remaining),
              ),
            )}{" "}
            · Restante {format(part.remaining)}
          </li>
        ))}
      </ul>
      {purchase.entries.length > 0 && (
        <ul aria-label="Historial de devoluciones" className="divide-y">
          {purchase.entries.map((entry) => (
            <li key={entry.id}>
              <RefundRecord entry={entry} />
            </li>
          ))}
        </ul>
      )}
      {actions.length > 0 && (
        <details
          className="rounded-lg border p-3"
          onToggle={(event) => {
            if (!event.currentTarget.open && !uncertain) {
              setPreview(undefined);
              setSaved("");
              clearError();
            }
          }}
        >
          <summary className="cursor-pointer font-semibold">
            Registrar devolución
          </summary>
          <form ref={formRef} className="mt-3 grid gap-3" onSubmit={prepare}>
            <fieldset disabled={!!preview || pending} className="grid gap-3">
              <HistoryField label="¿Qué ocurrió en el banco?">
                <select
                  className={historyControl}
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                    setOverlaps(false);
                  }}
                >
                  {actions.includes("credit") && (
                    <option value="credit">Me acreditaron un reintegro</option>
                  )}
                  {actions.includes("pending") && (
                    <option value="pending">
                      Todavía no veo la devolución
                    </option>
                  )}
                  {actions.includes("cancel_installments") && (
                    <option value="cancel_installments">
                      Cancelaron cuotas pendientes
                    </option>
                  )}
                </select>
              </HistoryField>
              {action !== "pending" && requests.length > 0 && (
                <HistoryField label="Solicitud pendiente relacionada (opcional)">
                  <select className={historyControl} name="pendingId">
                    <option value="">Devolución sin solicitud previa</option>
                    {requests.map(({ id, remaining, effectiveOn }) => (
                      <option key={id} value={id}>
                        {formatBankReference(effectiveOn)} · {format(remaining)}{" "}
                        pendientes
                      </option>
                    ))}
                  </select>
                </HistoryField>
              )}
              <HistoryField
                label={
                  action === "pending"
                    ? "Fecha de solicitud"
                    : action === "credit"
                      ? "Fecha de acreditación"
                      : "Fecha de confirmación"
                }
              >
                <input
                  type="date"
                  name="effectiveOn"
                  className={historyControl}
                  min={purchase.effectiveOn}
                  max={today}
                  defaultValue={today}
                  required
                />
              </HistoryField>
              {action === "pending" && (
                <HistoryField label="Importe solicitado">
                  <AmountInput name="amount" required />
                </HistoryField>
              )}
              {action !== "pending" && action && hasMatch(action) && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={overlaps}
                    onChange={(event) => setOverlaps(event.target.checked)}
                  />
                  {action === "credit"
                    ? "El reintegro cubre cuotas ya marcadas como canceladas"
                    : "Las cuotas canceladas ya están cubiertas por un reintegro registrado"}
                </label>
              )}
              {action === "credit" &&
                eligible.map((part) => (
                  <HistoryField
                    key={refundPartKey(part)}
                    label={`${methods[part.method]} · ${part.category ?? "Sin categorizar"} (hasta ${format(part.remaining)})`}
                  >
                    <AmountInput
                      name={refundPartKey(part)}
                      required={eligible.length === 1}
                    />
                  </HistoryField>
                ))}
              {action === "cancel_installments" && (
                <fieldset className="grid gap-1">
                  <legend className="font-medium">
                    Cuotas que canceló el emisor
                  </legend>
                  {future.map(({ ordinal, period, amount }) => (
                    <label
                      key={ordinal}
                      className="flex min-h-11 items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="ordinal"
                        value={ordinal}
                        className="size-5"
                      />
                      Cuota {ordinal} · {formatInstallmentPeriod(period)} ·{" "}
                      {format(amount)}
                    </label>
                  ))}
                </fieldset>
              )}
              {!preview && (
                <button type="submit" className={`${historyButton} w-fit`}>
                  Revisar devolución
                </button>
              )}
            </fieldset>
            {preview && (
              <div
                className="grid gap-2 rounded-lg border p-3 text-sm"
                aria-live="polite"
              >
                {preview.summary.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={historyButton}
                    disabled={pending}
                    onClick={async () => {
                      if (await send(preview.fields)) {
                        formRef.current?.reset();
                        setPreview(undefined);
                        setAction("credit");
                        setOverlaps(false);
                        setSaved("Devolución registrada.");
                        router.refresh();
                      }
                    }}
                  >
                    {uncertain
                      ? "Reintentar el mismo envío"
                      : "Confirmar devolución"}
                  </button>
                  <button
                    type="button"
                    className={historyButton}
                    disabled={pending || uncertain}
                    onClick={() => setPreview(undefined)}
                  >
                    Editar datos
                  </button>
                </div>
              </div>
            )}
            {(error || inputError) && <p role="alert">{error || inputError}</p>}
            {saved && <p role="status">{saved}</p>}
          </form>
        </details>
      )}
    </section>
  );
}

export function ReturnCreditForm({
  cardId,
  currency,
  balance,
  today,
}: {
  cardId: string;
  currency: Currency;
  balance: string;
  today: string;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/refunds",
    "POST",
  );
  const [saved, setSaved] = useState("");
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-semibold">
        Registrar reintegro a Bancos en {currency}
      </summary>
      <form
        className="mt-3 grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const element = event.currentTarget;
          const form = new FormData(element);
          if (
            await send({
              action: "return_balance",
              cardId,
              currency,
              amount: form.get("amount"),
              effectiveOn: form.get("effectiveOn"),
            })
          ) {
            element.reset();
            setSaved("Reintegro registrado.");
            router.refresh();
          }
        }}
      >
        <p className="text-sm">
          Saldo a favor · {formatBankAmount({ currency, amount: balance })}.
          Confirmá el importe que ya ingresó a Bancos.
        </p>
        <fieldset
          className="grid gap-2 sm:grid-cols-2"
          disabled={pending || uncertain}
        >
          <HistoryField label="Importe recibido">
            <AmountInput name="amount" required />
          </HistoryField>
          <HistoryField label="Fecha de acreditación">
            <input
              type="date"
              className={historyControl}
              name="effectiveOn"
              max={today}
              defaultValue={today}
              required
            />
          </HistoryField>
        </fieldset>
        <button
          type="submit"
          className={`${historyButton} w-fit`}
          disabled={pending}
        >
          {uncertain
            ? "Reintentar el mismo envío"
            : "Confirmar reintegro a Bancos"}
        </button>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">{saved}</p>}
      </form>
    </details>
  );
}
