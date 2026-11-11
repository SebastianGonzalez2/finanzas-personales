"use client";

import { useRef, useState } from "react";
import { formatBankAmount } from "@/domain/bank-balances";
import {
  coverageDecimal,
  coverageUnits,
  type FundPortion,
  type FundSource,
} from "@/domain/fund-coverage";
import { normalizeDecimalAmount, type Currency } from "@/domain/money";
import {
  AmountInput,
  HistoryField,
  historyButton,
  historyControl,
} from "./history-fields";

type Row = FundPortion & { key: number };
export const expenseFundsField = "expenseFunds";

export function formFundPortions(
  form: FormData,
  name: string,
): FundPortion[] | undefined {
  const value = form.get(name);
  return typeof value === "string" ? JSON.parse(value) : undefined;
}

export function enteredUnits(value: string) {
  try {
    return coverageUnits(
      normalizeDecimalAmount(value.trim().replace(",", ".")),
    );
  } catch {
    return null;
  }
}

export function FundPortionFields({
  funds,
  currency,
  amount,
  available,
  initial = [],
  name = expenseFundsField,
  commitment = false,
  payment = false,
  onPortionsChange,
}: {
  funds: FundSource[];
  currency: Currency;
  amount: string;
  available?: string;
  initial?: FundPortion[];
  name?: string;
  commitment?: boolean;
  payment?: boolean;
  onPortionsChange?: (rows: FundPortion[]) => void;
}) {
  const sources = funds.filter(
    (fund) =>
      fund.currency === currency &&
      (coverageUnits(fund.availableAmount) > BigInt(0) ||
        initial.some(({ fundId }) => fundId === fund.id)),
  );
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((portion, key) => ({
      fundId: portion.fundId,
      amount: portion.amount,
      key,
    })),
  );
  const next = useRef(rows.length);
  const total = enteredUnits(amount);
  const fromFunds = rows.reduce(
    (sum, row) => sum + (enteredUnits(row.amount) ?? BigInt(0)),
    BigInt(0),
  );
  const free = total === null ? null : total - fromFunds;
  const freeBank = available === undefined ? null : coverageUnits(available);
  const shortfall =
    free !== null && freeBank !== null
      ? free - (freeBank > BigInt(0) ? freeBank : BigInt(0))
      : null;
  const format = (value: bigint) =>
    formatBankAmount({ currency, amount: coverageDecimal(value) });
  const atLimit = rows.length >= Math.min(sources.length, commitment ? 1 : 20);

  function update(changes: Row[]) {
    setRows(changes);
    onPortionsChange?.(changes);
  }

  function change(key: number, patch: Partial<FundPortion>) {
    update(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">
        {commitment
          ? "Reserva para el pago de la tarjeta"
          : payment
            ? "Fondos para deuda sin compra asignada"
            : "Fuentes del gasto"}
      </legend>
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          rows.map(({ fundId, amount }) => ({ fundId, amount })),
        )}
      />
      {rows.map(({ key, fundId, amount }, index) => {
        const source = sources.find(({ id }) => id === fundId);
        const prior = initial.find((part) => part.fundId === fundId);
        const limit = source
          ? coverageUnits(source.availableAmount) +
            coverageUnits(prior?.amount ?? "0")
          : null;
        const entered = enteredUnits(amount);
        return (
          <div key={key} className="grid min-w-0 gap-2 sm:grid-cols-2">
            <HistoryField label={`Fondo ${index + 1}`}>
              <select
                className={historyControl}
                value={fundId}
                required
                onChange={(event) =>
                  change(key, { fundId: event.target.value })
                }
              >
                <option value="">Elegí un fondo</option>
                {sources
                  .filter(
                    ({ id }) =>
                      id === fundId || !rows.some((row) => row.fundId === id),
                  )
                  .map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
              </select>
            </HistoryField>
            <HistoryField label={`Importe del fondo ${index + 1}`}>
              <AmountInput
                value={amount}
                required
                onChange={(event) =>
                  change(key, { amount: event.target.value })
                }
              />
            </HistoryField>
            {limit !== null && (
              <p className="text-sm text-muted-foreground">
                {entered !== null && entered > limit
                  ? "Supera el saldo utilizable: "
                  : "Saldo utilizable: "}
                {format(limit)}
              </p>
            )}
            <button
              type="button"
              className={`${historyButton} justify-self-start`}
              onClick={() => update(rows.filter((row) => row.key !== key))}
            >
              Quitar fondo {index + 1}
            </button>
          </div>
        );
      })}
      {!atLimit && (
        <button
          type="button"
          className={`${historyButton} justify-self-start`}
          onClick={() => {
            const key = next.current++;
            update([...rows, { key, fundId: "", amount: "" }]);
          }}
        >
          {commitment
            ? "Comprometer un fondo"
            : rows.length
              ? "Agregar otro fondo"
              : "Pagar usando fondo de ahorro"}
        </button>
      )}
      {commitment ? (
        <p className="text-sm text-muted-foreground">
          El importe queda comprometido dentro del fondo. Se consume al
          aplicarlo al pago de la tarjeta.
        </p>
      ) : payment ? (
        <p className="text-sm text-muted-foreground">
          Elegí de qué fondos cubrir la parte del pago sin compra asignada. Solo
          podés usar reservas sin comprometer.
        </p>
      ) : (
        <div aria-live="polite" className="text-sm text-muted-foreground">
          {freeBank !== null && <p>Disponible libre: {format(freeBank)}</p>}
          {free !== null &&
            (free < BigInt(0) ? (
              <p>Los fondos superan el importe del gasto.</p>
            ) : (
              <p>
                De fondos: {format(fromFunds)} · Del disponible: {format(free)}
              </p>
            ))}
          {shortfall !== null && shortfall > BigInt(0) && (
            <p>Faltan {format(shortfall)} para cubrir el gasto.</p>
          )}
          {!sources.length && <p>No hay fondos utilizables en {currency}.</p>}
        </div>
      )}
    </fieldset>
  );
}
