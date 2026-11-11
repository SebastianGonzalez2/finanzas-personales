"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFinancialCommand } from "./financial-command";
import { historyButton, historyPrimary } from "./history-fields";

const endpoint = "/api/recurrences/series";

export function RecurrenceLifecycleForm({
  seriesId,
  paused,
}: {
  seriesId: string;
  paused: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    endpoint,
    "POST",
  );

  async function toggle(action: "pause" | "resume") {
    setSaved(false);
    if (await send({ seriesId, action })) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={paused ? historyButton : historyPrimary}
        disabled={pending || uncertain}
        onClick={() => {
          clearError();
          toggle(paused ? "resume" : "pause");
        }}
      >
        {pending
          ? "Guardando…"
          : uncertain
            ? "Reintentar el mismo envío"
            : paused
              ? "Reanudar serie"
              : "Pausar serie"}
      </button>
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
