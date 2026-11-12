"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBankReference } from "@/domain/bank-balances";
import { isBulkHistoryKind } from "@/domain/history-bulk";
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

function selectable(
  entry: HistoryEntry,
): entry is HistoryEntry & { classificationVersion: number } {
  return isBulkHistoryKind(entry.kind) && entry.classificationVersion != null;
}

export function HistorySelection({
  entries,
  filters,
  cursor,
  categories,
  tags,
  enabled,
}: {
  entries: HistoryEntry[];
  filters: FilterValues;
  cursor?: HistoryCursor;
  categories: { id: string; name: string; kind: "income" | "expense" }[];
  tags: { id: string; name: string }[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [choice, setChoice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const rows = enabled ? entries.filter(selectable) : [];
  const selectedRows = rows.filter((entry) =>
    selected.has(`${entry.kind}-${entry.id}`),
  );
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const compatibleCategories = categories.filter(({ kind }) =>
    selectedRows.every(
      (row) => kind === (row.kind === "income" ? "income" : "expense"),
    ),
  );
  const [type, id] = choice.split(":");
  const validChoice = (type === "category" ? compatibleCategories : tags).some(
    (entry) => entry.id === id,
  );

  function toggle(entry: HistoryEntry) {
    const key = `${entry.kind}-${entry.id}`;
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(key)) next.delete(key);
      else if (entry.classificationVersion != null)
        next.set(key, entry.classificationVersion);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected
        ? new Map()
        : new Map(
            rows.map((entry) => [
              `${entry.kind}-${entry.id}`,
              entry.classificationVersion,
            ]),
          ),
    );
  }

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validChoice || selectedRows.length === 0) return;
    setPending(true);
    setError("");
    setNotice("");
    const payload = {
      entries: selectedRows.map(({ id, kind }) => ({
        id,
        kind,
        version: selected.get(`${kind}-${id}`),
      })),
      ...(type === "category" ? { categoryId: id } : { tagId: id }),
    };
    const body = JSON.stringify(payload);
    if (attempt.current?.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/history/bulk-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: attempt.current.key,
        }),
      });
      const data: { error?: string; updated?: number } = await response.json();
      if (!response.ok) {
        if (response.status < 500) attempt.current = null;
        setError(data.error ?? "No pudimos actualizar la clasificación.");
        return;
      }
      attempt.current = null;
      setSelected(new Map());
      setChoice("");
      setNotice(
        data.updated === 1
          ? "1 registro actualizado."
          : `${data.updated} registros actualizados.`,
      );
      router.refresh();
    } catch {
      setError("No pudimos confirmar la edición. Reintentá el mismo envío.");
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
              disabled={pending}
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
              <span className="sr-only">Categoría o etiqueta</span>
              <select
                value={validChoice ? choice : ""}
                onChange={(event) => setChoice(event.target.value)}
                disabled={pending}
                className={control}
              >
                <option value="">Elegí una categoría o etiqueta</option>
                {compatibleCategories.length > 0 && (
                  <optgroup label="Categorías">
                    {compatibleCategories.map(({ id, name }) => (
                      <option key={id} value={`category:${id}`}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {tags.length > 0 && (
                  <optgroup label="Etiquetas">
                    {tags.map(({ id, name }) => (
                      <option key={id} value={`tag:${id}`}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <button
              type="submit"
              disabled={pending || !validChoice}
              className={primary}
            >
              {pending
                ? "Aplicando…"
                : type === "tag"
                  ? "Agregar etiqueta"
                  : "Aplicar categoría"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={pending}
              onClick={() => setSelected(new Map())}
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
      {notice && (
        <p role="status" className="text-sm">
          {notice}
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
              {enabled && selectable(entry) && (
                <input
                  type="checkbox"
                  checked={selected.has(`${entry.kind}-${entry.id}`)}
                  onChange={() => toggle(entry)}
                  disabled={pending}
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
