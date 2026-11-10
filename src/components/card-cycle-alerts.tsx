import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import { formatInstallmentPeriod } from "@/domain/installments";
import type { listCardCycleAlerts } from "@/server/card-cycles";
import { Card } from "./ui/card";

export function CardCycleAlerts({
  alerts,
  today,
}: {
  alerts: Awaited<ReturnType<typeof listCardCycleAlerts>>;
  today: string;
}) {
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <section aria-labelledby="avisos-tarjetas" className="grid gap-2">
        <h2 id="avisos-tarjetas" className="font-semibold">
          Avisos de tarjetas
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay avisos de vencimiento según tus registros.
          </p>
        ) : (
          <ul className="divide-y">
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
              return (
                <li
                  key={`${cardId}:${period}:${currency}`}
                  className="grid gap-1 py-3 text-sm wrap-anywhere"
                >
                  <p className="font-semibold">
                    {cardName} · {formatInstallmentPeriod(period)} · {currency}
                  </p>
                  <p>
                    {alert === "informative"
                      ? "Mínimo cubierto según tus pagos registrados"
                      : official
                        ? "Pago del resumen pendiente según tus registros"
                        : "Pago estimado pendiente"}{" "}
                    · {formatBankAmount(notice)}
                  </p>
                  <p>
                    {dueOn === today
                      ? "Vence hoy según la fecha registrada"
                      : "Vencimiento"}{" "}
                    {dueSource === "estimated" ? "(estimado)" : "(informado)"} ·{" "}
                    {formatBankReference(dueOn)}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <a
                      href={href}
                      className="inline-flex min-h-11 items-center underline"
                    >
                      Ver resumen
                    </a>
                    <a
                      href={`${href}&accion=pago`}
                      className="inline-flex min-h-11 items-center underline"
                    >
                      Registrar pago
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
