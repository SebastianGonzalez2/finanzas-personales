import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import {
  historyStates,
  type HistoryEntry,
  type HistoryKind,
} from "@/domain/history";
import { historyAmountTones } from "./history-entry";
import { Icon, type IconName } from "./ui/icon";

// UI-04: piezas de la tabla del Historial portadas de
// el laboratorio UI-01 (retirado en UI-06; diseño aprobado). Solo
// presentan los datos que entrega el servidor: no recalculan importes.

type Tone = "expense" | "neutral";

export const historyKindVisual: Record<
  HistoryKind,
  { icon: IconName; tone: Tone }
> = {
  expense: { icon: "expense", tone: "expense" },
  card_purchase: { icon: "cards", tone: "expense" },
};

const statusIcon: Record<HistoryEntry["status"], IconName> = {
  confirmed: "check",
  pending: "clock",
  corrected: "info",
  voided: "close",
};

// Signo del importe: los gastos se muestran con signo negativo.
const amountSign: Partial<Record<HistoryKind, "−">> = {
  expense: "−",
  card_purchase: "−",
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

// Importe principal que se muestra (y por el que se ordena): en tarjeta, la
// primera moneda de la operación.
export function historyDisplayAmount(entry: HistoryEntry) {
  return entry.cardAmounts?.[0] ?? entry;
}

export function HistoryTableAmount({ entry }: { entry: HistoryEntry }) {
  const sign = amountSign[entry.kind];
  const tone = historyAmountTones[entry.kind];
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
      className={`lab-amount${tone ? ` is-${tone}` : ""}${entry.status === "voided" ? " is-voided" : ""}`}
    >
      {lines.map((line, index) => (
        <span
          key={line.currency}
          className={index === 0 ? undefined : "lab-amount__line"}
        >
          {signed(line)}
        </span>
      ))}
    </span>
  );
}

export function HistoryDate({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatBankReference(iso)}</time>;
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
