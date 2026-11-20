import Link from "next/link";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import type { SummaryRecentMovement } from "@/domain/movements";
import { ActionMenu } from "../glaciar/action-menu";
import { RecentAmountCorrection } from "../recent-amount-correction";
import { Icon } from "../ui/icon";
import { Panel, PanelLink } from "./panel";
import { RecentList } from "./lists";
import { SummaryEmpty } from "./summary-panels";

// SIMP-03 — Últimos gastos: solo gastos (los ingresos heredados no se
// muestran) y sin medio de pago.
export function SummaryRecent({
  recent,
  available,
  canCorrect,
}: {
  recent: SummaryRecentMovement[];
  available: boolean;
  canCorrect: boolean;
}) {
  const items = recent.map((movement) => {
    const detail = `/historial/movimientos/${movement.id}`;
    return {
      id: `${movement.id}-${movement.currency}`,
      badge: (
        <span className="lab-kind lab-kind--expense">
          <Icon name="expense" className="size-4" />
          <span className="sr-only">Gasto</span>
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
          {` · ${movement.category ?? "Sin categorizar"}`}
          {movement.note && (
            <p className="whitespace-pre-wrap wrap-anywhere">{movement.note}</p>
          )}
        </>
      ),
      amount: (
        <span className="lab-amount is-negative">
          −{formatBankAmount(movement)}
        </span>
      ),
      actions: movement.shared ? (
        <div className="lab-recent__actions">
          <ActionMenu
            label={`Más acciones de ${movement.concept}`}
            items={[{ href: detail, label: "Ver gasto" }]}
          />
        </div>
      ) : canCorrect && movement.amountCorrectable ? (
        <RecentAmountCorrection
          eventId={movement.id}
          amount={movement.amount}
          concept={movement.concept}
        />
      ) : undefined,
    };
  });
  return (
    <Panel
      title="Últimos gastos"
      icon="history"
      className="b-span-12"
      action={<PanelLink href="/historial">Ver historial</PanelLink>}
    >
      {items.length > 0 ? (
        <RecentList items={items} />
      ) : (
        <SummaryEmpty unavailable={!available}>
          {available
            ? "Todavía no hay gastos registrados."
            : "Los últimos gastos no están disponibles."}
        </SummaryEmpty>
      )}
    </Panel>
  );
}
