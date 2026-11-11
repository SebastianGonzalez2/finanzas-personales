"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { formatBankAmount } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import { useFinancialCommand } from "./financial-command";
import { AmountInput, HistoryField, historyPrimary } from "./history-fields";

export function RecurringSplitCorrection({
  eventId,
  version,
  currency,
  ownAmount,
  parties,
}: {
  eventId: string;
  version: number;
  currency: Currency;
  ownAmount: string;
  parties: { id: string; name: string; amount: string; collected: string }[];
}) {
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/shared-expenses",
    "POST",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      await send({
        action: "revise-split",
        eventId,
        expectedVersion: version,
        ownAmount: data.get("own"),
        parties: parties.map(({ id }) => ({
          loanId: id,
          amount: data.get(id),
        })),
      })
    )
      router.refresh();
  }

  return (
    <form
      method="post"
      action="/api/shared-expenses"
      className="mt-3 grid gap-3"
      onSubmit={submit}
      aria-label="Corregir reparto del pago"
    >
      <fieldset disabled={pending || uncertain} className="grid min-w-0 gap-3">
        <HistoryField label="Tu parte del pago">
          <AmountInput name="own" required defaultValue={ownAmount} />
        </HistoryField>
        {parties.map(({ id, name, amount, collected }) => (
          <HistoryField key={id} label={`Parte de ${name}`}>
            <AmountInput name={id} required defaultValue={amount} />
            <span className="font-normal text-muted-foreground">
              Cobrado · {formatBankAmount({ currency, amount: collected })}
            </span>
          </HistoryField>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        className={`${historyPrimary} justify-self-start`}
        disabled={pending}
      >
        {pending
          ? "Guardando…"
          : uncertain
            ? "Reintentar corrección"
            : "Guardar corrección del reparto"}
      </button>
    </form>
  );
}
