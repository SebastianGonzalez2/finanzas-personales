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
    <div className="gs-series__tools">
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
        <details className="gs-inline-edit">
          <summary>Editar día de vencimiento</summary>
          <form
            className="mt-2 grid max-w-md justify-items-start gap-3"
            onSubmit={updateDay}
          >
            <label className="ui-field">
              <span className="ui-field__label">Nuevo día de vencimiento</span>
              <input
                className="ui-control w-24"
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
            <p className="gs-hint">
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
        <p role="status" className="gs-hint basis-full">
          Cambios guardados.
        </p>
      )}
      {error && (
        <p role="alert" className="b-notice b-notice--critical basis-full">
          {error}
        </p>
      )}
    </div>
  );
}
