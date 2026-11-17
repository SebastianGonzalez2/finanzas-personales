"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionMenu } from "./glaciar/action-menu";
import { useFinancialCommand } from "./financial-command";

export function RecentAmountCorrection({
  eventId,
  amount,
  concept,
}: {
  eventId: string;
  amount: string;
  concept: string;
}) {
  const router = useRouter();
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/movements",
    "PATCH",
  );
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);

  if (saved)
    return (
      <p
        role="status"
        tabIndex={-1}
        ref={confirmation}
        className="lab-recent__editor"
      >
        Importe corregido.
      </p>
    );
  return (
    <>
      <div className="lab-recent__actions" hidden={open}>
        <ActionMenu
          label={`Más acciones de ${concept}`}
          items={[
            {
              label: "Corregir importe",
              onSelect: (from) => {
                trigger.current = from;
                setOpen(true);
                requestAnimationFrame(() => input.current?.focus());
              },
            },
          ]}
        />
      </div>
      {open && (
        <form
          method="post"
          action="/api/movements"
          aria-label={`Corregir importe de ${concept}`}
          className="lab-recent__editor space-y-1 text-foreground"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await send({
                action: "correct",
                eventId,
                amount: new FormData(event.currentTarget).get("amount"),
              })
            ) {
              setSaved(true);
              requestAnimationFrame(() =>
                confirmation.current?.focus({ preventScroll: true }),
              );
              router.refresh();
            }
          }}
        >
          <label className="block space-y-1">
            <span>Importe correcto</span>
            <input
              ref={input}
              name="amount"
              defaultValue={amount.replace(".", ",")}
              inputMode="decimal"
              required
              maxLength={22}
              autoComplete="off"
              disabled={pending || uncertain}
              className="block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending
                ? "Guardando…"
                : uncertain
                  ? "Reintentar corrección"
                  : "Guardar corrección"}
            </button>
            {!uncertain && (
              <button
                type="button"
                disabled={pending}
                className="min-h-11 rounded-md px-2 hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  clearError();
                  requestAnimationFrame(() => trigger.current?.focus());
                }}
              >
                Cancelar
              </button>
            )}
          </div>
          <p role="alert" className={error ? "" : "sr-only"}>
            {error}
          </p>
        </form>
      )}
    </>
  );
}
