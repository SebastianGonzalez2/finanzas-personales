"use client";

import { useId, useRef, useState } from "react";
import type { Currency } from "@/domain/money";
import { conceptLimit } from "@/domain/movements";
import {
  suggestShares,
  type Person,
  type UsualShare,
} from "@/domain/recurring-shares";
import { maxFriends } from "@/domain/shared-expenses";
import {
  AmountInput,
  HistoryField,
  historyButton,
  historyControl,
} from "./history-fields";

export function recurringAgreement(data: FormData) {
  const people = data.getAll("share-person");
  return data.getAll("share-percent").map((percentage, index) => {
    const personId = people[index];
    return personId
      ? { personId, percentage }
      : { name: data.get(`share-name-${index}`), percentage };
  });
}

export function RecurringAgreementFields({ people }: { people: Person[] }) {
  const [rows, setRows] = useState([{ key: 0, person: "" }]);
  const next = useRef(1);
  return (
    <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3 sm:col-span-2">
      <legend className="px-1 font-medium">Reparto habitual</legend>
      <p className="text-sm text-muted-foreground">
        Tu porcentaje es el resto hasta el 100 %.
      </p>
      {rows.map(({ key, person }, index) => (
        <div key={key} className="grid min-w-0 gap-2 sm:grid-cols-2">
          <HistoryField label={`Contacto ${index + 1}`}>
            <select
              className={historyControl}
              name="share-person"
              value={person}
              onChange={(event) =>
                setRows(
                  rows.map((row) =>
                    row.key === key
                      ? { ...row, person: event.target.value }
                      : row,
                  ),
                )
              }
            >
              <option value="">Persona nueva</option>
              {people.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </HistoryField>
          {!person && (
            <HistoryField label={`Nombre de la persona ${index + 1}`}>
              <input
                className={historyControl}
                name={`share-name-${index}`}
                maxLength={conceptLimit}
                required
              />
            </HistoryField>
          )}
          <HistoryField label={`Porcentaje de la persona ${index + 1}`}>
            <AmountInput name="share-percent" required />
          </HistoryField>
          {rows.length > 1 && (
            <button
              type="button"
              className={`${historyButton} self-end justify-self-start`}
              onClick={() => setRows(rows.filter((row) => row.key !== key))}
            >
              Quitar persona {index + 1}
            </button>
          )}
        </div>
      ))}
      {rows.length < maxFriends && (
        <button
          type="button"
          className={`${historyButton} justify-self-start`}
          onClick={() => {
            const key = next.current++;
            setRows([...rows, { key, person: "" }]);
          }}
        >
          Agregar persona
        </button>
      )}
    </fieldset>
  );
}

export function recurringPaymentSplit(data: FormData) {
  const amounts = data.getAll("split-amount");
  const dates = data.getAll("split-due-on");
  return {
    ownAmount: data.get("split-own"),
    parties: data.getAll("split-name").map((name, index) => ({
      name,
      amount: amounts[index],
      dueOn: dates[index],
    })),
  };
}

export function RecurringPaymentSplitFields({
  shares,
  people,
  amount,
  currency,
}: {
  shares: UsualShare[];
  people: Person[];
  amount: string;
  currency: Currency;
}) {
  const suggested = suggestShares(amount, shares);
  const proposal = shares.flatMap(({ name }, index) => {
    const amount = suggested?.[index + 1] ?? "";
    return amount === "0.0000" ? [] : [{ name, amount }];
  });
  const [own, setOwn] = useState(suggested?.[0] ?? "");
  const [rows, setRows] = useState(() =>
    proposal.map((row, key) => ({ ...row, key })),
  );
  const next = useRef(shares.length);
  const names = useId();
  return (
    <fieldset className="grid min-w-0 gap-2 rounded-lg border p-3">
      <legend className="px-1 font-medium">Reparto real ({currency})</legend>
      <button
        type="button"
        className={`${historyButton} justify-self-start`}
        disabled={!suggested}
        onClick={() => {
          if (!suggested) return;
          setOwn(suggested[0]);
          const first = next.current;
          next.current += proposal.length;
          setRows(
            proposal.map((row, index) => ({ ...row, key: first + index })),
          );
        }}
      >
        Aplicar reparto habitual
      </button>
      <HistoryField label="Tu parte del pago">
        <AmountInput
          name="split-own"
          required
          value={own}
          onChange={(event) => setOwn(event.target.value)}
        />
      </HistoryField>
      <datalist id={names}>
        {people.map(({ id, name }) => (
          <option key={id} value={name} />
        ))}
      </datalist>
      {rows.map((row, index) => (
        <div key={row.key} className="grid min-w-0 gap-2 sm:grid-cols-2">
          <HistoryField label={`Persona del reparto ${index + 1}`}>
            <input
              className={historyControl}
              name="split-name"
              list={names}
              maxLength={conceptLimit}
              defaultValue={row.name}
              required
            />
          </HistoryField>
          <HistoryField label={`Parte de la persona ${index + 1}`}>
            <AmountInput
              name="split-amount"
              required
              value={row.amount}
              onChange={(event) =>
                setRows(
                  rows.map((entry) =>
                    entry.key === row.key
                      ? { ...entry, amount: event.target.value }
                      : entry,
                  ),
                )
              }
            />
          </HistoryField>
          <HistoryField
            label={`Fecha prevista de cobro ${index + 1} (opcional)`}
          >
            <input
              className={historyControl}
              name="split-due-on"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
            />
          </HistoryField>
          <button
            type="button"
            className={`${historyButton} self-end justify-self-start`}
            onClick={() => setRows(rows.filter(({ key }) => key !== row.key))}
          >
            Quitar del pago {index + 1}
          </button>
        </div>
      ))}
      {rows.length < maxFriends && (
        <button
          type="button"
          className={`${historyButton} justify-self-start`}
          onClick={() => {
            const key = next.current++;
            setRows([...rows, { key, name: "", amount: "" }]);
          }}
        >
          Agregar persona al pago
        </button>
      )}
    </fieldset>
  );
}
