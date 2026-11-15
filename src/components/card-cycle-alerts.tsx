import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import { formatInstallmentPeriod } from "@/domain/installments";
import type { listCardCycleAlerts } from "@/server/card-cycles";
import { Panel } from "./glaciar-summary/panel";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export function CardCycleAlerts({
  alerts,
  today,
}: {
  alerts: Awaited<ReturnType<typeof listCardCycleAlerts>>;
  today: string;
}) {
  return (
    <Panel id="avisos-tarjetas" title="Avisos de tarjetas" icon="notices">
      {alerts.length === 0 ? (
        <p className="lab-muted text-sm">
          No hay avisos de vencimiento según tus registros.
        </p>
      ) : (
        <ul className="b-notices">
          {alerts.map((notice) => {
            const {
              cardId,
              cardName,
              period,
              currency,
              alert,
              dueOn,
              dueSource,
              official,
            } = notice;
            const href = `/tarjetas/${cardId}/resumen?ciclo=${period}`;
            const informative = alert === "informative";
            return (
              <li
                key={`${cardId}:${period}:${currency}`}
                className={`b-notice ${informative ? "b-notice--info" : "b-notice--warning"}`}
              >
                <Icon
                  name={informative ? "info" : "alert"}
                  className="size-4.5 shrink-0"
                />
                <div className="min-w-0 wrap-anywhere">
                  <p className="font-medium">
                    {cardName} · {formatInstallmentPeriod(period)} · {currency}
                  </p>
                  <p className="lab-muted mt-1 text-sm">
                    {informative
                      ? "Mínimo cubierto según tus pagos registrados"
                      : official
                        ? "Pago del resumen pendiente según tus registros"
                        : "Pago estimado pendiente"}{" "}
                    · {formatBankAmount(notice)}
                  </p>
                  <p className="lab-muted text-sm">
                    {dueOn === today
                      ? "Vence hoy según la fecha registrada"
                      : "Vencimiento"}{" "}
                    {dueSource === "estimated" ? "(estimado)" : "(informado)"} ·{" "}
                    {formatBankReference(dueOn)}
                  </p>
                  <div className="gs-actions mt-2">
                    <a
                      href={`${href}&accion=pago`}
                      className={buttonClass("outline")}
                    >
                      Registrar pago
                    </a>
                    <a href={href} className="lab-link">
                      Ver resumen
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
