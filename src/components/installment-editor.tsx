"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  formatInstallmentPeriod,
  futureInstallmentPeriods,
  type InstallmentVersion,
} from "@/domain/installments";
import type { Currency } from "@/domain/money";
import { useFinancialCommand } from "./financial-command";
import {
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";
import { InstallmentFields } from "./installment-fields";

export function InstallmentEditor({
  eventId,
  plan,
  currency,
  today,
}: {
  eventId: string;
  plan: InstallmentVersion;
  currency: Currency;
  today: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<
    "edit-installments" | "cancel-installments" | null
  >(null);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const cancelTrigger = useRef<HTMLButtonElement>(null);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/cards/operations",
    "POST",
  );
  const periods = futureInstallmentPeriods(plan, today);

  useEffect(() => {
    if (action) heading.current?.focus();
  }, [action]);

  function close() {
    setAction(null);
    clearError();
    requestAnimationFrame(() => {
      const target =
        action === "cancel-installments"
          ? cancelTrigger.current
          : editTrigger.current;
      (target ?? editTrigger.current)?.focus();
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields =
      action === "edit-installments"
        ? {
            plan: {
              installmentAmount: form.get("installmentAmount"),
              count: Number(form.get("count")),
              firstPeriod: form.get("firstPeriod"),
            },
          }
        : { fromPeriod: form.get("fromPeriod") };
    if (
      await send({ action, eventId, expectedVersion: plan.version, ...fields })
    ) {
      setMessage(
        action === "edit-installments"
          ? "Plan de cuotas corregido."
          : "Cancelación de cuotas registrada.",
      );
      close();
      router.refresh();
    }
  }

  return (
    <section
      className="grid gap-3 border-t pt-4"
      aria-label="Acciones del plan de cuotas"
    >
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {action ? (
        <form
          method="post"
          action="/api/cards/operations"
          onSubmit={submit}
          className="grid gap-3"
        >
          <h2 ref={heading} tabIndex={-1} className="font-semibold">
            {action === "edit-installments"
              ? "Corregir plan de cuotas"
              : "Registrar cancelación de cuotas"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {action === "edit-installments"
              ? "La corrección actualiza los gastos de los meses del plan. El cargo y los pagos registrados conservan sus importes."
              : "Elegí el primer mes que el emisor confirmó como cancelado. Se retiran esa cuota y las siguientes del calendario. Si el saldo del emisor también cambió, registralo en Tarjetas → Actualizar deuda."}
          </p>
          <fieldset
            disabled={pending || uncertain}
            className="grid min-w-0 gap-3 sm:grid-cols-2"
          >
            {action === "edit-installments" ? (
              <InstallmentFields
                currency={currency}
                {...plan}
                countLocked={plan.count !== plan.activeCount}
              />
            ) : (
              <HistoryField label="Primera cuota cancelada por el emisor">
                <select
                  name="fromPeriod"
                  required
                  defaultValue=""
                  className={historyControl}
                >
                  <option value="" disabled>
                    Elegí el mes
                  </option>
                  {periods.map((period) => (
                    <option key={period} value={period}>
                      {formatInstallmentPeriod(period)}
                    </option>
                  ))}
                </select>
              </HistoryField>
            )}
          </fieldset>
          <p role="alert" className={error ? "text-sm" : "sr-only"}>
            {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={historyPrimary} disabled={pending}>
              {pending
                ? "Guardando…"
                : uncertain
                  ? "Reintentar guardado"
                  : action === "edit-installments"
                    ? "Guardar corrección"
                    : "Confirmar cancelación de cuotas"}
            </button>
            <button
              type="button"
              className={historyButton}
              disabled={pending || uncertain}
              onClick={close}
            >
              Volver
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            ref={editTrigger}
            type="button"
            className={historyButton}
            onClick={() => setAction("edit-installments")}
          >
            Corregir plan
          </button>
          {periods.length > 0 && (
            <button
              ref={cancelTrigger}
              type="button"
              className={historyButton}
              onClick={() => setAction("cancel-installments")}
            >
              Registrar cancelación de cuotas
            </button>
          )}
        </div>
      )}
    </section>
  );
}
