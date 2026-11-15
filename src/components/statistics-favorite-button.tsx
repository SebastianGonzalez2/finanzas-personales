"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { favoriteLabel, type StatisticsChartId } from "@/domain/statistics";
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
        className="ui-icon-btn gs-star border border-(--glaciar-border) disabled:opacity-60"
        aria-label={label}
        aria-pressed={favorite}
        title={label}
        disabled={sending || refreshing}
        onClick={toggle}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill={favorite ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      </button>
      {error && (
        <p role="alert" className="max-w-48 lab-muted text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
