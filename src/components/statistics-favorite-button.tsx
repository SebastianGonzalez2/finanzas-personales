"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  favoriteLabel,
  statisticsChartIds,
  type StatisticsChartId,
} from "@/domain/statistics";

export function StatisticsFavoriteButton({
  chart,
  favorite,
}: {
  chart: StatisticsChartId;
  favorite: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = favoriteLabel(chart, favorite);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/statistics-favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartId: chart, favorite: !favorite }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("No pudimos guardar el favorito. Reintentá.");
    } finally {
      setPending(false);
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
        disabled={pending}
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
