import { formatBankAmount } from "@/domain/bank-balances";
import type { FxKey, FxQuote } from "@/domain/exchange-rates";
import type { Currency } from "@/domain/money";
import { ExchangeRateDetails } from "./exchange-rate-details";

export type CurrentCurrencyValue = {
  amount: string | null;
  quotes: FxQuote[];
  missing: FxKey[];
};

export function CurrencyValue({
  currency,
  value,
}: {
  currency: Currency;
  value: CurrentCurrencyValue;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <p className="font-semibold break-words tabular-nums">
        {value.amount === null
          ? value.missing.length
            ? "Equivalencia no disponible"
            : "Sin datos"
          : formatBankAmount({ currency, amount: value.amount })}
      </p>
      <ExchangeRateDetails
        target={currency}
        quotes={value.quotes}
        missing={value.missing}
        live
      />
    </div>
  );
}
