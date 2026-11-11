import { formatBankAmount } from "@/domain/bank-balances";
import { fundTargetNotices, type SavingsFund } from "@/domain/savings-funds";

export function FundTargetMessage({
  fund,
  today,
  kind,
}: {
  fund: SavingsFund;
  today: string;
  kind: "pause" | "deadline";
}) {
  const { overdue, reached, remaining, pausedByTarget } = fundTargetNotices(
    fund,
    today,
  );
  const amount = (value: string) =>
    formatBankAmount({ currency: fund.currency, amount: value });

  if (kind === "deadline")
    return overdue && remaining !== null ? (
      <p className="font-medium">
        Pasó la fecha objetivo ({fund.targetDate}); aún faltan{" "}
        {amount(remaining)}.
      </p>
    ) : null;

  if (!pausedByTarget) return null;
  if (reached)
    return (
      <p>
        Alcanzaste tu meta en {fund.name}. Las aportaciones automáticas se
        pausaron.
      </p>
    );
  return (
    <p>
      {fund.targetAmount
        ? `Tu fondo ${fund.name} ahora tiene ${amount(fund.reservedAmount)} de una meta de ${amount(fund.targetAmount)}.`
        : `Quitaste la meta de ${fund.name}.`}{" "}
      Las aportaciones automáticas continúan pausadas.
    </p>
  );
}
