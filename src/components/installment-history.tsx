import { formatBankAmount } from "@/domain/bank-balances";
import {
  formatInstallmentPeriod,
  formatInstallmentTotal,
  futureInstallmentPeriods,
  installmentPeriodAt,
  type InstallmentVersion,
} from "@/domain/installments";
import type { Currency } from "@/domain/money";

const changes = {
  created: "Alta",
  edited: "Corrección",
  cancelled: "Cancelación confirmada",
};

export function InstallmentHistory({
  versions,
  currency,
  today,
  status,
}: {
  versions: InstallmentVersion[];
  currency: Currency;
  today: string;
  status: "confirmed" | "voided" | "corrected" | "pending";
}) {
  const plan = versions[0];
  const future =
    status === "confirmed" ? futureInstallmentPeriods(plan, today).length : 0;
  const cancelled = plan.refundCancelled ?? [];
  const elapsed = Array.from({ length: plan.activeCount }, (_, index) =>
    installmentPeriodAt(plan.firstPeriod, index),
  ).filter(
    (period, index) =>
      period < today.slice(0, 7) && !cancelled.includes(index + 1),
  ).length;

  return (
    <section className="grid gap-3 border-t pt-4" aria-label="Plan de cuotas">
      <h2 className="font-semibold">Plan de cuotas</h2>
      <p className="text-sm wrap-anywhere">
        {plan.count} cuotas de{" "}
        {formatBankAmount({ currency, amount: plan.installmentAmount })} · Total
        financiado {formatInstallmentTotal(plan, currency)}
      </p>
      <p className="text-sm text-muted-foreground">
        {status === "corrected"
          ? "Plan del registro anterior a la corrección."
          : status === "voided"
            ? "Compra anulada en la aplicación."
            : `${elapsed} de ${plan.activeCount - cancelled.length} cuotas vigentes corresponden a meses anteriores. Cuotas futuras · ${future}. Compromiso futuro · ${formatInstallmentTotal(plan, currency, future)}.`}{" "}
        El calendario muestra la imputación de gastos. La facturación y los
        pagos se registran aparte.
      </p>
      <ol
        className="grid gap-2 sm:grid-cols-2"
        aria-label="Calendario de cuotas"
      >
        {Array.from({ length: plan.count }, (_, index) => {
          const period = installmentPeriodAt(plan.firstPeriod, index);
          const label =
            status === "corrected"
              ? "Plan reemplazado"
              : status === "voided"
                ? "Anulada"
                : index >= plan.activeCount || cancelled.includes(index + 1)
                  ? "Cancelada por el emisor"
                  : period > today.slice(0, 7)
                    ? "Futura"
                    : "Imputada al mes";
          return (
            <li key={period} className="rounded-lg border p-2 text-sm">
              {index + 1} · {formatInstallmentPeriod(period)} · {label}
            </li>
          );
        })}
      </ol>
      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          Historial del plan ({versions.length})
        </summary>
        <ol className="mt-2 divide-y" aria-label="Versiones del plan">
          {versions.map((version) => (
            <li key={version.version} className="py-2 wrap-anywhere">
              <p>
                {version.recordedOn} · {changes[version.change]}
              </p>
              <p>
                Desde {formatInstallmentPeriod(version.firstPeriod)} ·{" "}
                {version.activeCount} de {version.count} cuotas vigentes de{" "}
                {formatBankAmount({
                  currency,
                  amount: version.installmentAmount,
                })}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
