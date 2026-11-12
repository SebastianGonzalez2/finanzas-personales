import { formatBankReference } from "@/domain/bank-balances";
import {
  fxKey,
  fxSourceName,
  type FxKey,
  type FxQuote,
} from "@/domain/exchange-rates";
import type { Currency } from "@/domain/money";
import { ManualExchangeRateForm } from "./manual-exchange-rate-form";

const attributionQuery =
  "?utm_source=api&utm_medium=attribution&utm_campaign=backlinks";

export function ExchangeRateDetails({
  target,
  quotes,
  missing = [],
  missingPositions = [],
  live = false,
}: {
  target: Currency;
  quotes: FxQuote[];
  missing?: FxKey[];
  missingPositions?: FxKey[];
  live?: boolean;
}) {
  const unresolved = [
    ...new Map(
      [...missing, ...missingPositions].map((key) => [fxKey(key), key]),
    ).values(),
  ];
  const observations = [
    ...new Map(quotes.map((quote) => [fxKey(quote), quote])).values(),
  ].sort(
    (a, b) => b.date.localeCompare(a.date) || a.base.localeCompare(b.base),
  );
  const primary = observations.filter(
    ({ source }) => source === "datosuruguay",
  );
  const usesDollar = primary.some(
    ({ base, target }) => base === "USD" || target === "USD",
  );
  const usesEuro = primary.some(
    ({ base, target }) => base === "EUR" || target === "EUR",
  );

  return (
    <div className="grid gap-2 text-sm">
      {(missing.length > 0 || missingPositions.length > 0) && (
        <div role="status" className="grid gap-1">
          {missing.length > 0 && (
            <p>
              {live
                ? `Faltan cotizaciones para consolidar en ${target}.`
                : `Faltan cotizaciones para consolidar el flujo en ${target}. Se muestran importes originales.`}
            </p>
          )}
          {missingPositions.length > 0 && (
            <p>
              Faltan cotizaciones para consolidar la situación financiera en{" "}
              {target}. Se muestran importes originales.
            </p>
          )}
        </div>
      )}
      {!live && (observations.length > 0 || unresolved.length > 0) && (
        <p className="text-muted-foreground">
          Equivalencia de referencia en {target} según la fecha efectiva de cada
          movimiento o saldo histórico.
        </p>
      )}
      {observations.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            Cotizaciones utilizadas
          </summary>
          <div
            className="mt-2 max-h-80 overflow-auto"
            tabIndex={0}
            aria-label="Detalle de las cotizaciones"
          >
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th scope="col" className="p-2">
                    Fecha efectiva
                  </th>
                  <th scope="col" className="p-2">
                    Cotización
                  </th>
                  <th scope="col" className="p-2">
                    Fecha y fuente
                  </th>
                </tr>
              </thead>
              <tbody>
                {observations.map((quote) => (
                  <tr key={fxKey(quote)} className="border-t">
                    <td className="p-2">{formatBankReference(quote.date)}</td>
                    <td className="p-2 wrap-anywhere">
                      1 {quote.base} = {quote.rate.replace(".", ",")}{" "}
                      {quote.target}
                    </td>
                    <td className="p-2">
                      {formatBankReference(quote.observed)} ·{" "}
                      {fxSourceName(quote.source)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {primary.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-muted-foreground">
          Datos de datosUruguay.com (BCU, CC BY 4.0).
          {usesDollar && (
            <a
              className="underline"
              href={`https://datosuruguay.com/dolar${attributionQuery}`}
            >
              Serie USD
            </a>
          )}
          {usesEuro && (
            <a
              className="underline"
              href={`https://datosuruguay.com/euro${attributionQuery}`}
            >
              Serie EUR
            </a>
          )}
        </p>
      )}
      {observations.some(({ source }) => source === "frankfurter") && (
        <p className="text-muted-foreground">
          Cotizaciones de respaldo de{" "}
          <a href="https://frankfurter.dev/" className="underline">
            Frankfurter
          </a>
          .
        </p>
      )}
      {!live && unresolved.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            Ingresar una tasa manual
          </summary>
          <div className="mt-2">
            <p className="mb-2 text-muted-foreground">
              Se aplica a tus equivalencias de esa fecha y par de monedas.
            </p>
            <ManualExchangeRateForm keys={unresolved} target={target} />
          </div>
        </details>
      )}
    </div>
  );
}
