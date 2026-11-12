"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFinancialCommand } from "./financial-command";
import { historyButton, historyPrimary } from "./history-fields";

const endpoint = "/api/recurrences/series";

export function RecurrenceLifecycleForm({
  seriesId,
  paused,
  dueDay,
  effectiveMonth,
  version,
}: {
  seriesId: string;
  paused: boolean;
  dueDay: number | null;
  effectiveMonth: string | null;
  version: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const { send, pending, uncertain, error } = useFinancialCommand(
    endpoint,
    "POST",
  );

  async function save(fields: Record<string, unknown>) {
    setSaved(false);
    if (await send({ seriesId, ...fields })) {
      setSaved(true);
      router.refresh();
    }
  }

  function updateDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void save({
      action: "due-day",
      dueDay: Number(fields.get("dueDay")),
      effectiveMonth,
      version,
    });
  }

  return (
    <div className="grid justify-items-start gap-2">
      <button
        type="button"
        className={paused ? historyButton : historyPrimary}
        disabled={pending}
        onClick={() =>
          void save(uncertain ? {} : { action: paused ? "resume" : "pause" })
        }
      >
        {pending
          ? "Guardando…"
          : uncertain
            ? "Reintentar el mismo envío"
            : paused
              ? "Reanudar serie"
              : "Pausar serie"}
      </button>
      {dueDay !== null && effectiveMonth && (
        <details>
          <summary className="cursor-pointer text-sm underline">
            Editar día de vencimiento
          </summary>
          <form
            className="mt-2 grid justify-items-start gap-2"
            onSubmit={updateDay}
          >
            <label className="grid gap-1 text-sm">
              Nuevo día de vencimiento
              <input
                className="w-24 rounded-md border bg-background px-3 py-2"
                name="dueDay"
                type="number"
                min={1}
                max={31}
                step={1}
                required
                key={dueDay}
                defaultValue={dueDay}
                disabled={pending || uncertain}
              />
            </label>
            <p className="text-sm">
              Nuevo día a partir de {effectiveMonth.slice(5)}/
              {effectiveMonth.slice(0, 4)} en los próximos vencimientos de la
              serie.
            </p>
            <button
              type="submit"
              className={historyButton}
              disabled={pending || uncertain}
            >
              Guardar día
            </button>
          </form>
        </details>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Cambios guardados.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
