import Link from "next/link";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import { historyKinds, type HistoryEntry } from "@/domain/history";
import {
  movementDisplayMethods,
  type RecentMovement,
} from "@/domain/movements";
import { HistoryAmount, historyAmountTones } from "../history-entry";
import { RecentAmountCorrection } from "../recent-amount-correction";
import { Icon, type IconName } from "../ui/icon";
import { Panel, PanelLink } from "./panel";
import { RecentList } from "./lists";
import { SummaryEmpty } from "./summary-panels";

const supplementalIcons: Partial<Record<HistoryEntry["kind"], IconName>> = {
  bank_transfer: "swap",
  loan_operation: "debts",
  card_payment: "cards",
  purchase_refund: "income",
  card_credit_return: "cards",
  bank_benefit: "benefits",
};

export function SummaryRecent({
  recent,
  activity,
  available,
  canCorrect,
}: {
  recent: RecentMovement[];
  activity: HistoryEntry[];
  available: boolean;
  canCorrect: boolean;
}) {
  const movements = recent.map((movement) => {
    const income = movement.kind === "income";
    const detail = `/historial/movimientos/${movement.id}`;
    return {
      id: `${movement.id}-${movement.currency}`,
      effectiveOn: movement.effectiveOn,
      badge: (
        <span className={`lab-kind lab-kind--${movement.kind}`}>
          <Icon
            name={movement.method === "credit" ? "cards" : movement.kind}
            className="size-4"
          />
          <span className="sr-only">{income ? "Ingreso" : "Gasto"}</span>
        </span>
      ),
      title: (
        <Link href={detail} className="hover:underline">
          {movement.concept}
        </Link>
      ),
      detail: (
        <>
          <time dateTime={movement.effectiveOn}>
            {formatBankReference(movement.effectiveOn)}
          </time>
          {` · ${movement.category ?? "Sin categorizar"} · ${movementDisplayMethods[movement.method]}`}
          {movement.note && (
            <p className="whitespace-pre-wrap wrap-anywhere">{movement.note}</p>
          )}
        </>
      ),
      amount: (
        <span
          className={`lab-amount ${income ? "is-positive" : "is-negative"}`}
        >
          {income ? "+" : "−"}
          {formatBankAmount(movement)}
        </span>
      ),
      actions: movement.shared ? (
        <Link
          href={detail}
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          Ver gasto y obligaciones
        </Link>
      ) : canCorrect && movement.method !== "credit" ? (
        <RecentAmountCorrection
          eventId={movement.id}
          amount={movement.amount}
          concept={movement.concept}
        />
      ) : undefined,
    };
  });
  const legacyIds = new Set(recent.map(({ id }) => id));
  const supplemental = activity.flatMap((entry) => {
    const icon = supplementalIcons[entry.kind];
    if (!icon || legacyIds.has(entry.id)) return [];
    return [
      {
        id: entry.id,
        effectiveOn: entry.effectiveOn,
        badge: (
          <span className="lab-kind">
            <Icon name={icon} className="size-4" />
          </span>
        ),
        title: (
          <Link
            href={`/historial/movimientos/${entry.id}`}
            className="hover:underline"
          >
            {entry.concept}
          </Link>
        ),
        detail: (
          <>
            <time dateTime={entry.effectiveOn}>
              {formatBankReference(entry.effectiveOn)}
            </time>
            {` · ${historyKinds[entry.kind]}`}
            {entry.category && ` · ${entry.category}`}
          </>
        ),
        amount: (
          <span
            className={`lab-amount ${historyAmountTones[entry.kind] ? `is-${historyAmountTones[entry.kind]}` : ""}`}
          >
            <HistoryAmount entry={entry} />
          </span>
        ),
      },
    ];
  });
  const items = [...supplemental, ...movements].sort((a, b) =>
    b.effectiveOn.localeCompare(a.effectiveOn),
  );
  return (
    <Panel
      title="Movimientos recientes"
      icon="history"
      className="b-span-12"
      action={<PanelLink href="/historial">Ver historial</PanelLink>}
    >
      {items.length > 0 ? (
        <>
          <RecentList items={items.slice(0, 6)} />
          {items.length > 6 && (
            <details className="text-sm">
              <summary className="min-h-11 text-ring">
                Ver más movimientos recientes
              </summary>
              <RecentList items={items.slice(6)} />
            </details>
          )}
        </>
      ) : (
        <SummaryEmpty unavailable={!available}>
          {available
            ? "Todavía no hay movimientos registrados."
            : "Los movimientos recientes no están disponibles."}
        </SummaryEmpty>
      )}
    </Panel>
  );
}
