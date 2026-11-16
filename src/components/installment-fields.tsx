"use client";

import { MonthField } from "./ui/date-fields";
import { useState } from "react";
import {
  formatInstallmentTotal,
  installmentCount,
  maxInstallments,
} from "@/domain/installments";
import type { Currency } from "@/domain/money";
import { HistoryField, historyControl } from "./history-fields";

export function InstallmentFields({
  currency,
  firstPeriod,
  installmentAmount = "",
  count,
  countLocked = false,
}: {
  currency: Currency;
  firstPeriod: string;
  installmentAmount?: string;
  count?: number;
  countLocked?: boolean;
}) {
  const [amount, setAmount] = useState(installmentAmount);
  const [quantity, setQuantity] = useState(count?.toString() ?? "");
  const parsedCount = Number(quantity);
  let total = "";
  if (installmentCount(parsedCount)) {
    try {
      const normalized = amount.trim().replace(",", ".");
      if (!normalized.startsWith("-") && /[1-9]/.test(normalized))
        total = formatInstallmentTotal(
          { count: parsedCount, firstPeriod, installmentAmount: normalized },
          currency,
        );
    } catch {
      // The server validates the submitted amount and range.
    }
  }

  return (
    <>
      <HistoryField label="Importe de cada cuota">
        <input
          name="installmentAmount"
          required
          inputMode="decimal"
          maxLength={22}
          className={historyControl}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </HistoryField>
      <HistoryField label="Cantidad de cuotas">
        <input
          name="count"
          type="number"
          required
          min={2}
          max={maxInstallments}
          readOnly={countLocked}
          className={historyControl}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </HistoryField>
      <MonthField
        label="Mes de la primera cuota"
        variant="history"
        name="firstPeriod"
        required
        min="0001-01"
        max="9999-12"
        defaultValue={firstPeriod}
      />
      <output className="self-end pb-2 text-sm font-semibold wrap-anywhere">
        Total financiado · {total || "—"}
      </output>
    </>
  );
}
