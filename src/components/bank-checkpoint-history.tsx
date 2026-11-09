import {
  formatBankAmount,
  formatBankReference,
  type BankCheckpoint,
} from "@/domain/bank-balances";

export function BankCheckpointHistory({
  checkpoints,
}: {
  checkpoints: BankCheckpoint[];
}) {
  const differences = checkpoints.filter(
    ({ difference }) => difference !== null && /[1-9]/.test(difference),
  ).length;
  return (
    <details className="mt-1 text-sm">
      <summary className="min-h-11 cursor-pointer rounded-md px-2 py-3 text-ring hover:bg-accent">
        Confirmaciones de saldo
        {differences > 0 &&
          ` · ${differences} ${differences === 1 ? "diferencia" : "diferencias"}`}
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">
        La diferencia compara lo confirmado con lo que surge de los movimientos
        registrados. No se agrega ningún ingreso ni gasto para cubrirla.
      </p>
      <ul className="mt-2 divide-y">
        {checkpoints.map((checkpoint) => (
          <li key={checkpoint.id} className="space-y-1 py-2 wrap-anywhere">
            <p className="font-medium">
              <time dateTime={checkpoint.asOfDate}>
                {formatBankReference(checkpoint.asOfDate)}
              </time>
              {" · "}
              {formatBankAmount(checkpoint)} confirmado
            </p>
            {checkpoint.originalProjection !== null &&
              checkpoint.originalDifference !== null && (
                <p className="text-xs text-muted-foreground">
                  Calculado al confirmar:{" "}
                  {formatBankAmount({
                    ...checkpoint,
                    amount: checkpoint.originalProjection,
                  })}
                  . Ajuste registrado:{" "}
                  {formatBankAmount({
                    ...checkpoint,
                    amount: checkpoint.originalDifference,
                  })}
                  .
                </p>
              )}
            {checkpoint.projection !== null &&
              checkpoint.difference !== null && (
                <p className="text-xs">
                  Cálculo actualizado:{" "}
                  {formatBankAmount({
                    ...checkpoint,
                    amount: checkpoint.projection,
                  })}
                  . Diferencia de conciliación:{" "}
                  {formatBankAmount({
                    ...checkpoint,
                    amount: checkpoint.difference,
                  })}
                  .
                  {checkpoint.projectionChanged &&
                    " El cálculo cambió desde la confirmación."}
                </p>
              )}
            {checkpoint.projection === null && (
              <p className="text-xs text-muted-foreground">Saldo inicial.</p>
            )}
            {checkpoint.note && (
              <p className="whitespace-pre-wrap text-xs">{checkpoint.note}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
