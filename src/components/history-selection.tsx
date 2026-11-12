"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBankReference } from "@/domain/bank-balances";
import {
  historyKinds,
  historySearch,
  historyStates,
  type HistoryCursor,
  type HistoryEntry,
  type HistoryFilters as FilterValues,
} from "@/domain/history";
import { HistoryAmount } from "./history-entry";
import { Card } from "./ui/card";

const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const secondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border px-2 text-sm hover:bg-accent disabled:opacity-60";
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

// Solo movimientos con categoría asignable admiten la edición masiva: los
// saldos confirmados, cambios de moneda, deudas y devoluciones no se tocan.
const selectableKinds = new Set(["income", "expense", "card_purchase"]);
const selectableStatuses = new Set(["confirmed", "pending"]);

function selectable(entry: HistoryEntry) {
  return (
    selectableKinds.has(entry.kind) && selectableStatuses.has(entry.status)
  );
}

// Selección múltiple del historial (CA-057). La edición masiva segura
// (permisos, atomicidad y protección de gastos divididos) es la parte de
// Codex: mientras tanto el servidor rechaza la operación con un aviso claro.
export function HistorySelection({
  entries,
  filters,
  cursor,
  categories,
}: {
  entries: HistoryEntry[];
  filters: FilterValues;
  cursor?: HistoryCursor;
  categories: { id: string; name: string; kind: "income" | "expense" }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef("");

  const rows = entries.filter(selectable);
  const selectedRows = rows.filter((entry) =>
    selected.has(`${entry.kind}-${entry.id}`),
  );
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggle(entry: HistoryEntry) {
    const key = `${entry.kind}-${entry.id}`;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected
        ? new Set()
        : new Set(rows.map((entry) => `${entry.kind}-${entry.id}`)),
    );
  }

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || selectedRows.length === 0) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/history/bulk-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: selectedRows.map(({ id, kind }) => ({ id, kind })),
          categoryId,
          idempotencyKey: (attempt.current ||= crypto.randomUUID()),
        }),
      });
      const data: { error?: string; updated?: number } = await response.json();
      if (!response.ok) {
        if (response.status < 500) attempt.current = "";
        setError(data.error ?? "No pudimos aplicar la categoría.");
        return;
      }
      attempt.current = "";
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("No pudimos aplicar la categoría. Reintentá el mismo envío.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="resultados" tabIndex={-1} className="font-semibold">
          Registros
        </h2>
        {rows.length > 0 && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              ref={(node) => {
                if (node)
                  node.indeterminate = selectedRows.length > 0 && !allSelected;
              }}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Seleccionar todo en esta página"
              className="size-4"
            />
            Seleccionar todo
          </label>
        )}
      </div>
      {selectedRows.length > 0 && (
        <form
          method="post"
          onSubmit={apply}
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <p className="text-sm">
            {selectedRows.length}{" "}
            {selectedRows.length === 1
              ? "registro seleccionado"
              : "registros seleccionados"}{" "}
            en esta página.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-sm font-medium">
              <span className="sr-only">Categoría a aplicar</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className={control}
              >
                <option value="">Elegí una categoría</option>
                {categories.map(({ id, name, kind }) => (
                  <option key={id} value={id}>
                    {name} ({historyKinds[kind].toLowerCase()})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={pending || !categoryId}
              className={primary}
            >
              {pending ? "Aplicando…" : "Aplicar categoría"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={pending}
              onClick={() => setSelected(new Set())}
            >
              Quitar selección
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay registros que coincidan.
        </p>
      ) : (
        <ul className="divide-y">
          {entries.map((entry) => (
            <li
              key={`${entry.kind}-${entry.id}`}
              className="flex items-start gap-2 px-2 py-1"
            >
              {selectable(entry) && (
                <input
                  type="checkbox"
                  checked={selected.has(`${entry.kind}-${entry.id}`)}
                  onChange={() => toggle(entry)}
                  aria-label={`Seleccionar ${entry.concept}`}
                  className="mt-3 size-4 shrink-0"
                />
              )}
              <a
                href={`/historial/${entry.kind === "checkpoint" ? "saldos" : "movimientos"}/${entry.id}${historySearch(filters, cursor)}#titulo-pagina`}
                className="grid flex-1 gap-2 rounded-md py-2 hover:bg-muted sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere">{entry.concept}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBankReference(entry.effectiveOn)} ·{" "}
                    {historyKinds[entry.kind]} · {historyStates[entry.status]}
                  </p>
                </div>
                <HistoryAmount entry={entry} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
