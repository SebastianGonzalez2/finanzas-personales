"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  favoriteLabel,
  statisticsChartIds,
  type StatisticsChartId,
} from "@/domain/statistics";
import { connectionAwareMessage } from "./connection";

export function StatisticsFavoriteButton({
  chart,
  favorite,
}: {
  chart: StatisticsChartId;
  favorite: boolean;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = favoriteLabel(chart, favorite);

  async function toggle() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/statistics-favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartId: chart, favorite: !favorite }),
      });
      if (!response.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setError(
        connectionAwareMessage("No pudimos guardar el favorito. Reintentá."),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid justify-items-end gap-1">
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
        aria-label={label}
        aria-pressed={favorite}
        title={label}
        disabled={sending || refreshing}
        onClick={toggle}
      >
        <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
        <span className="sr-only">{statisticsChartIds[chart]}</span>
      </button>
      {error && (
        <p role="alert" className="max-w-48 text-xs text-muted-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
