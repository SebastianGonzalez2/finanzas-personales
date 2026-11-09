"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFinancialCommand } from "./financial-command";
import { historyButton, historyPrimary } from "./history-fields";

export function CreditVoidForm({
  eventId,
  payment,
}: {
  eventId: string;
  payment: boolean;
}) {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/cards/operations",
    "POST",
  );

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await send({ action: "void", eventId })) router.refresh();
  }

  return (
    <section
      className="grid justify-items-start gap-3 border-t pt-4"
      aria-label="Acciones del registro de tarjeta"
    >
      {open ? (
        <form
          method="post"
          action="/api/cards/operations"
          onSubmit={submit}
          className="grid gap-3"
        >
          <h2 ref={heading} tabIndex={-1} className="font-semibold">
            {payment ? "Anular pago" : "Anular compra"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Se conservará el registro original en el historial. Las referencias
            confirmadas posteriores siguen vigentes.
          </p>
          <p role="alert" className={error ? "text-sm" : "sr-only"}>
            {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={historyPrimary} type="submit" disabled={pending}>
              {pending
                ? "Guardando…"
                : uncertain
                  ? "Reintentar anulación"
                  : "Confirmar anulación"}
            </button>
            <button
              className={historyButton}
              type="button"
              disabled={pending || uncertain}
              onClick={() => {
                setOpen(false);
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={trigger}
          className={historyButton}
          type="button"
          onClick={() => setOpen(true)}
        >
          {payment ? "Anular pago" : "Anular compra"}
        </button>
      )}
    </section>
  );
}
