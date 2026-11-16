import { formatBankReference } from "@/domain/bank-balances";
import { formatInstallmentPeriod } from "@/domain/installments";

export function recurrencePeriodLabel(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) return formatInstallmentPeriod(key);
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return formatBankReference(key);
  const quarter = key.match(/^(\d{4})-Q([1-4])$/);
  return quarter ? `Trimestre ${quarter[2]} de ${quarter[1]}` : key;
}
