import { formatBankAmount } from "@/domain/bank-balances";
import {
  historyStates,
  type HistoryEntry,
  type HistoryKind,
} from "@/domain/history";
import { Icon, type IconName } from "./ui/icon";

// UI-04: piezas de la tabla del Historial portadas de
// src/app/prototipos/ui/_lab/movements.tsx (diseño aprobado en UI-01). Solo
// presentan los datos que entrega el servidor: no recalculan importes.

type Tone = "income" | "expense" | "neutral";

export const historyKindVisual: Record<
  HistoryKind,
  { icon: IconName; tone: Tone }
> = {
  income: { icon: "income", tone: "income" },
  expense: { icon: "expense", tone: "expense" },
  bank_transfer: { icon: "swap", tone: "neutral" },
  checkpoint: { icon: "check", tone: "neutral" },
  card_purchase: { icon: "cards", tone: "expense" },
  card_payment: { icon: "cards", tone: "neutral" },
  card_opening: { icon: "cards", tone: "neutral" },
  card_adjustment: { icon: "cards", tone: "neutral" },
  loan_operation: { icon: "debts", tone: "neutral" },
  purchase_refund: { icon: "income", tone: "income" },
  card_credit_return: { icon: "income", tone: "income" },
  bank_benefit: { icon: "benefits", tone: "income" },
};

const statusIcon: Record<HistoryEntry["status"], IconName> = {
  confirmed: "check",
  pending: "clock",
  corrected: "info",
  voided: "close",
};

// Signo del importe según el sentido del registro, como en el prototipo.
// Los registros sin un sentido único (saldo confirmado, deuda inicial o
// ajuste de tarjeta, deudas y préstamos) se muestran sin signo: no se
// inventa una dirección que el dato no informa.
const amountSign: Partial<Record<HistoryKind, "+" | "−">> = {
  income: "+",
  purchase_refund: "+",
  card_credit_return: "+",
  bank_benefit: "+",
  bank_transfer: "+",
  expense: "−",
  card_purchase: "−",
  card_payment: "−",
};

export function KindBadge({ kind }: { kind: HistoryKind }) {
  const visual = historyKindVisual[kind];
  return (
    <span className={`lab-kind lab-kind--${visual.tone}`} aria-hidden="true">
      <Icon name={visual.icon} className="size-4" />
    </span>
  );
}

export function StatusPill({ status }: { status: HistoryEntry["status"] }) {
  return (
    <span className={`lab-status lab-status--${status}`}>
      <Icon name={statusIcon[status]} duotone={false} className="size-3.5" />
      {historyStates[status]}
    </span>
  );
}

const unsigned = (amount: string) => amount.replace(/^-/, "");

// Importe principal que se muestra (y por el que se ordena): en un cambio de
// moneda es lo recibido; en tarjeta, la primera moneda de la operación.
export function historyDisplayAmount(entry: HistoryEntry) {
  if (
    entry.kind === "bank_transfer" &&
    entry.otherCurrency &&
    entry.otherAmount
  )
    return { currency: entry.otherCurrency, amount: entry.otherAmount };
  return entry.cardAmounts?.[0] ?? entry;
}

export function HistoryTableAmount({ entry }: { entry: HistoryEntry }) {
  const sign = amountSign[entry.kind];
  const transfer =
    entry.kind === "bank_transfer" && entry.otherCurrency && entry.otherAmount;
  const signed = (line: {
    currency: HistoryEntry["currency"];
    amount: string;
  }) =>
    sign
      ? `${sign}${formatBankAmount({ ...line, amount: unsigned(line.amount) })}`
      : formatBankAmount(line);
  const lines = entry.cardAmounts?.length
    ? entry.cardAmounts
    : [historyDisplayAmount(entry)];
  return (
    <span
      className={`lab-amount${sign === "+" ? " is-positive" : ""}${entry.status === "voided" ? " is-voided" : ""}`}
    >
      {lines.map((line, index) => (
        <span
          key={line.currency}
          className={index === 0 ? undefined : "lab-amount__line"}
        >
          {signed(line)}
        </span>
      ))}
      {transfer && (
        <span className="lab-amount__other">
          {formatBankAmount({
            currency: entry.currency,
            amount: unsigned(entry.amount),
          })}
        </span>
      )}
      {entry.kind === "loan_operation" &&
        entry.otherCurrency &&
        entry.otherAmount && (
          <span className="lab-amount__note">
            Bancos{" "}
            {formatBankAmount({
              currency: entry.otherCurrency,
              amount: entry.otherAmount,
            })}
          </span>
        )}
    </span>
  );
}

// Fecha corta del prototipo (dd/mm); fuera del año en curso se agrega el
// año para no confundir registros de distintos años.
export function HistoryDate({ iso, year }: { iso: string; year: string }) {
  const [entryYear, month, day] = iso.split("-");
  return (
    <time dateTime={iso}>
      {entryYear === year ? `${day}/${month}` : `${day}/${month}/${entryYear}`}
    </time>
  );
}

// Comparación decimal exacta (sin pasar por números de coma flotante).
function decimalUnits(amount: string) {
  const [whole, fraction = ""] = unsigned(amount).split(".");
  return BigInt(`${whole}${fraction.padEnd(8, "0").slice(0, 8)}`);
}

export function compareHistoryAmounts(a: HistoryEntry, b: HistoryEntry) {
  const left = decimalUnits(historyDisplayAmount(a).amount);
  const right = decimalUnits(historyDisplayAmount(b).amount);
  return left === right ? 0 : left < right ? -1 : 1;
}
