"use client";

import { recurrencePeriodLabel } from "@/lib/recurrence-period-label";
import { MonthField, DateInput } from "./ui/date-fields";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import { movementDisplayMethods, type MovementKind } from "@/domain/movements";
import {
  duplicateSettlement,
  settlementLimit,
  type SettlementEvent,
  type TrackedPeriod,
} from "@/domain/recurrence-settlements";
import type { Currency } from "@/domain/money";
import { maxInstallments } from "@/domain/installments";
import type { Person, UsualShare } from "@/domain/recurring-shares";
import {
  RecurringPaymentSplitFields,
  recurringPaymentSplit,
} from "./recurring-share-fields";
import { useFinancialCommand } from "./financial-command";
import {
  AmountInput,
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";

const endpoint = "/api/recurrences/settlements";
type Candidate = SettlementEvent & { concept: string };
type Mode = "record" | "link" | "total" | "omit" | "restore" | "detach";

export function RecurrenceSettlementForm({
  seriesId,
  period,
  others,
  olderCursor,
  currency,
  kind,
  today,
  cards,
  usualShares,
  people,
}: {
  seriesId: string;
  period: TrackedPeriod;
  others: TrackedPeriod[];
  olderCursor: number;
  currency: Currency;
  kind: MovementKind;
  today: string;
  cards: { id: string; name: string }[];
  usualShares: UsualShare[];
  people: Person[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const defaultAmount =
    period.remaining && period.recorded !== "0.0000" ? period.remaining : "";
  const [paidAmount, setPaidAmount] = useState(defaultAmount);
  const [installments, setInstallments] = useState(false);
  const [method, setMethod] = useState("debit");
  const [date, setDate] = useState(today);
  const [events, setEvents] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState("");
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [extra, setExtra] = useState<number[]>([]);
  const [additional, setAdditional] = useState<TrackedPeriod[]>([]);
  const [cursor, setCursor] = useState(olderCursor);
  const [periodError, setPeriodError] = useState("");
  const [saved, setSaved] = useState(false);
  const [allowDistinct, setAllowDistinct] = useState(false);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    endpoint,
    "POST",
  );

  const income = kind === "income";
  const shared = usualShares.length > 0;
  const detachable = period.events.filter(({ shared }) => !shared);
  const ready = period.status === "expected" || period.status === "partial";
  const monetary = mode === "record" || mode === "link";
  const event = events?.find(({ id }) => id === selected);
  const needsSplit =
    shared &&
    (mode === "record" || (mode === "link" && event && !event.shared));
  const financing =
    shared && mode === "record" && method === "credit" && installments;
  const options = new Map(
    [...additional, ...others].map((entry) => [entry.index, entry]),
  );
  options.delete(period.index);
  const choices = [...options.values()].sort((a, b) => b.index - a.index);
  const periods = [
    period,
    ...choices.filter(({ index }) => extra.includes(index)),
  ];
  const completeText = income
    ? "Eso fue todo lo cobrado en este período"
    : "Con esto queda pagado el período";

  function open(next: Mode | null) {
    setMode(next);
    setExtra([]);
    setPaidAmount(defaultAmount);
    setInstallments(false);
    setAdditional([]);
    setCursor(olderCursor);
    setPeriodError("");
    setSaved(false);
    setAllowDistinct(false);
    clearError();
  }

  async function search() {
    setLookupError("");
    setEvents(null);
    setSelected("");
    setSearching(true);
    try {
      const response = await fetch(
        endpoint + "?" + new URLSearchParams({ serie: seriesId, fecha: date }),
      );
      const result: { events?: Candidate[]; error?: string } =
        await response.json();
      if (!response.ok || !result.events)
        throw new Error(result.error ?? "No pudimos buscar movimientos.");
      setEvents(result.events);
    } catch (error) {
      setLookupError(
        error instanceof Error
          ? error.message
          : "No pudimos buscar movimientos.",
      );
    } finally {
      setSearching(false);
    }
  }

  async function loadPeriods() {
    setSearching(true);
    setPeriodError("");
    try {
      const response = await fetch(
        endpoint +
          "?" +
          new URLSearchParams({ serie: seriesId, hasta: String(cursor) }),
      );
      const result: { periods?: TrackedPeriod[]; next?: number } =
        await response.json();
      const { periods: found, next } = result;
      if (!response.ok || !found || typeof next !== "number") throw new Error();
      setAdditional((previous) => [...previous, ...found]);
      setCursor(next);
    } catch {
      setPeriodError("No pudimos buscar otros períodos. Volvé a intentarlo.");
    } finally {
      setSearching(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amount = mode === "link" ? event?.amount : data.get("amount");
    const target = (entry: TrackedPeriod) => {
      const final = data.has(`final-${entry.index}`);
      return {
        index: entry.index,
        recorded: entry.recorded,
        version: entry.version,
        final,
        total: final ? null : data.get(`total-${entry.index}`) || null,
      };
    };
    let command: Record<string, unknown> = {
      seriesId,
      action: mode,
      target: target(period),
    };
    if (mode === "detach") command.eventId = data.get("eventId");
    if (monetary) {
      const targets = periods.map((entry) => ({
        ...target(entry),
        amount:
          periods.length === 1 ? amount : data.get(`allocation-${entry.index}`),
      }));
      command = {
        seriesId,
        action: mode,
        targets,
        amount,
        ...(needsSplit && { split: recurringPaymentSplit(data) }),
        ...(financing && {
          installment: {
            cardAmount: data.get("cardAmount"),
            plan: {
              count: Number(data.get("count")),
              installmentAmount: data.get("installmentAmount"),
              firstPeriod: data.get("firstPeriod"),
            },
          },
        }),
        ...(mode === "link"
          ? { eventId: selected }
          : {
              effectiveOn: date,
              method: income ? "deposit" : method,
              cardId:
                !income && method === "credit" ? data.get("cardId") : null,
              distinct: allowDistinct,
            }),
      };
    }
    if (await send(command)) {
      open(null);
      setEvents(null);
      setSelected("");
      setSaved(true);
      router.refresh();
    }
  }

  if (!mode)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {ready && (
          <>
            <button
              type="button"
              className={historyPrimary}
              onClick={() => open("record")}
            >
              {income
                ? period.status === "partial"
                  ? "Registrar otro cobro"
                  : "Registrar cobro"
                : period.status === "partial" && period.remaining
                  ? "Completar pago"
                  : "Registrar pago"}
            </button>
            <button
              type="button"
              className={historyButton}
              onClick={() => open("link")}
            >
              Vincular movimiento registrado
            </button>
          </>
        )}
        {period.status !== "skipped" && (
          <button
            type="button"
            className={historyButton}
            onClick={() => open("total")}
          >
            {period.confirmedTotal
              ? "Revisar total confirmado"
              : "Confirmar total"}
          </button>
        )}
        {detachable.length > 0 && (
          <button
            type="button"
            className={historyButton}
            onClick={() => open("detach")}
          >
            Desvincular movimiento
          </button>
        )}
        {period.status === "expected" && (
          <button
            type="button"
            className={historyButton}
            onClick={() => open("omit")}
          >
            Omitir este período
          </button>
        )}
        {period.status === "skipped" && (
          <button
            type="button"
            className={historyButton}
            onClick={() => open("restore")}
          >
            Deshacer omisión
          </button>
        )}
        {saved && (
          <p role="status" className="text-sm">
            Cambios guardados.
          </p>
        )}
      </div>
    );

  return (
    <form
      className="grid gap-3 rounded-lg border bg-background p-3"
      method="post"
      action={endpoint}
      onSubmit={submit}
      aria-label={`Confirmación para ${recurrencePeriodLabel(period.key)}`}
    >
      <fieldset
        className="grid gap-3"
        disabled={pending || uncertain || searching}
      >
        {monetary && (
          <div className="grid gap-3 sm:grid-cols-2">
            <HistoryField
              label={
                mode === "link"
                  ? "Fecha del movimiento"
                  : income
                    ? "Fecha real de cobro"
                    : "Fecha real de pago"
              }
            >
              <DateInput
                className={historyControl}
                required
                value={date}
                max={today}
                onValueChange={(iso) => {
                  setDate(iso);
                  setEvents(null);
                  setSelected("");
                  setLookupError("");
                }}
              />
            </HistoryField>
            {mode === "record" && (
              <HistoryField
                label={income ? "Importe cobrado" : "Importe pagado"}
              >
                <AmountInput
                  name="amount"
                  required
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </HistoryField>
            )}
            {mode === "record" && !income && (
              <>
                <HistoryField label="Medio de pago">
                  <select
                    className={historyControl}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="debit">Débito bancario</option>
                    <option value="transfer">Transferencia bancaria</option>
                    {cards.length > 0 && (
                      <option value="credit">Tarjeta de crédito</option>
                    )}
                  </select>
                </HistoryField>
                {method === "credit" && (
                  <HistoryField label="Tarjeta de crédito">
                    <select
                      className={historyControl}
                      name="cardId"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Elegí la tarjeta
                      </option>
                      {cards.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </HistoryField>
                )}
                {shared && method === "credit" && (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={installments}
                      onChange={(event) =>
                        setInstallments(event.target.checked)
                      }
                    />
                    Compra en cuotas
                  </label>
                )}
                {financing && (
                  <>
                    <HistoryField label="Cargo real en la tarjeta hoy">
                      <AmountInput name="cardAmount" required />
                    </HistoryField>
                    <HistoryField label="Cantidad de cuotas">
                      <input
                        className={historyControl}
                        name="count"
                        type="number"
                        min={2}
                        max={maxInstallments}
                        required
                      />
                    </HistoryField>
                    <HistoryField label="Importe de cada cuota">
                      <AmountInput name="installmentAmount" required />
                    </HistoryField>
                    <MonthField
                      label="Mes de la primera cuota"
                      variant="history"
                      name="firstPeriod"
                      min="0001-01"
                      max="9999-12"
                      defaultValue={date.slice(0, 7)}
                      required
                    />
                  </>
                )}
              </>
            )}
            {mode === "link" && (
              <>
                <div className="self-end">
                  <button
                    type="button"
                    className={historyButton}
                    disabled={!date || date > today}
                    onClick={search}
                  >
                    Buscar movimientos
                  </button>
                </div>
                {lookupError && <p role="alert">{lookupError}</p>}
                {events?.length === 0 && (
                  <p role="status" className="text-sm">
                    No hay movimientos disponibles para esa fecha.
                  </p>
                )}
                {!!events?.length && (
                  <HistoryField label="Movimiento registrado">
                    <select
                      className={historyControl}
                      required
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="" disabled>
                        Elegí el movimiento
                      </option>
                      {events.map(({ id, concept, amount, method, shared }) => (
                        <option key={id} value={id}>
                          {concept} · {formatBankAmount({ amount, currency })} ·{" "}
                          {movementDisplayMethods[method]}
                          {shared && " · Con reparto registrado"}
                        </option>
                      ))}
                    </select>
                  </HistoryField>
                )}
              </>
            )}
          </div>
        )}
        {needsSplit && (
          <RecurringPaymentSplitFields
            key={mode === "link" ? selected : "record"}
            shares={usualShares}
            people={people}
            amount={mode === "link" ? (event?.amount ?? "") : paidAmount}
            currency={currency}
          />
        )}
        {monetary &&
          !income &&
          !shared &&
          (choices.length > 0 || cursor >= 0) && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Distribuir el pago entre varios períodos
              </summary>
              <div className="mt-2 flex flex-wrap gap-3">
                {choices.map(({ index, key }) => (
                  <label
                    key={index}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={extra.includes(index)}
                      disabled={
                        !extra.includes(index) &&
                        periods.length >= settlementLimit
                      }
                      onChange={(e) =>
                        setExtra(
                          e.target.checked
                            ? [...extra, index]
                            : extra.filter((value) => value !== index),
                        )
                      }
                    />
                    {recurrencePeriodLabel(key)}
                  </label>
                ))}
              </div>
              {cursor >= 0 && (
                <button
                  type="button"
                  className={historyButton + " mt-2"}
                  onClick={loadPeriods}
                >
                  Buscar otros períodos
                </button>
              )}
              {periodError && (
                <p role="alert" className="text-sm">
                  {periodError}
                </p>
              )}
            </details>
          )}
        {(monetary || mode === "total") &&
          periods.map((entry) => (
            <PeriodAmounts
              key={entry.index}
              period={entry}
              split={periods.length > 1}
              completeText={completeText}
              canFinalize={monetary || entry.events.length > 0}
            />
          ))}
        {mode === "link" && (
          <p className="text-sm text-muted-foreground">
            El vínculo usa el movimiento que ya figura en Historial.
          </p>
        )}
        {mode === "detach" && (
          <>
            <HistoryField label="Movimiento que querés desvincular">
              <select
                name="eventId"
                className={historyControl}
                required
                defaultValue={
                  period.events.length === 1 ? period.events[0].id : ""
                }
              >
                <option value="" disabled>
                  Elegí el movimiento
                </option>
                {detachable.map(({ id, effectiveOn, amount, method }) => (
                  <option key={id} value={id}>
                    {formatBankReference(effectiveOn)} ·{" "}
                    {formatBankAmount({ amount, currency })} ·{" "}
                    {movementDisplayMethods[method]}
                  </option>
                ))}
              </select>
            </HistoryField>
            <p className="text-sm text-muted-foreground">
              Se quitará el vínculo con todos los períodos asignados. El
              movimiento seguirá registrado en Historial con sus efectos
              originales.
            </p>
          </>
        )}
        {mode === "omit" && (
          <p className="text-sm">
            {income
              ? "Este período quedará como «No corresponde cobrar»."
              : "Este período quedará como «No corresponde pagar»."}
          </p>
        )}
        {mode === "restore" && (
          <p className="text-sm">
            El período volverá a quedar pendiente de confirmación.
          </p>
        )}
        {mode === "record" &&
          (error === duplicateSettlement || allowDistinct) && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowDistinct}
                onChange={(e) => setAllowDistinct(e.target.checked)}
              />
              Confirmo que es un movimiento distinto
            </label>
          )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={historyPrimary}
          disabled={pending || searching || (mode === "link" && !event)}
        >
          {pending
            ? "Guardando…"
            : uncertain
              ? "Reintentar el mismo envío"
              : "Confirmar"}
        </button>
        <button
          type="button"
          className={historyButton}
          onClick={() => open(null)}
          disabled={pending || uncertain || searching}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PeriodAmounts({
  period,
  split,
  completeText,
  canFinalize,
}: {
  period: TrackedPeriod;
  split: boolean;
  completeText: string;
  canFinalize: boolean;
}) {
  const [final, setFinal] = useState(false);
  return (
    <fieldset className="grid gap-2 rounded-md border p-2">
      {split && (
        <legend className="px-1 text-sm font-medium">
          {recurrencePeriodLabel(period.key)}
        </legend>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {split && (
          <HistoryField
            label={`Importe asignado a ${recurrencePeriodLabel(period.key)}`}
          >
            <AmountInput
              name={`allocation-${period.index}`}
              required
              defaultValue={period.remaining ?? undefined}
            />
          </HistoryField>
        )}
        {!final && (
          <HistoryField label="Total confirmado (opcional)">
            <AmountInput
              name={`total-${period.index}`}
              defaultValue={
                period.finalized
                  ? undefined
                  : (period.confirmedTotal ?? undefined)
              }
            />
          </HistoryField>
        )}
      </div>
      {canFinalize && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={`final-${period.index}`}
            checked={final}
            onChange={(e) => setFinal(e.target.checked)}
          />
          {completeText}
        </label>
      )}
    </fieldset>
  );
}
