"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isBulkHistoryKind } from "@/domain/history-bulk";
import type { HistoryChip } from "@/domain/history-chips";
import {
  historyKinds,
  historySearch,
  type HistoryCursor,
  type HistoryEntry,
  type HistoryFilters as FilterValues,
} from "@/domain/history";
import { movementDisplayMethods } from "@/domain/movements";
import { connectionAwareMessage } from "./connection";
import { useHistoryNavigate } from "./history-explorer";
import {
  compareHistoryAmounts,
  HistoryDate,
  HistoryTableAmount,
  KindBadge,
  StatusPill,
} from "./history-table";
import { Icon } from "./ui/icon";

type SortKey = "date" | "amount";
type Sort = { key: SortKey; dir: "asc" | "desc" };

function selectable(
  entry: HistoryEntry,
): entry is HistoryEntry & { classificationVersion: number } {
  return isBulkHistoryKind(entry.kind) && entry.classificationVersion != null;
}

const rowKey = (entry: HistoryEntry) => `${entry.kind}-${entry.id}`;

// UI-04: tabla del prototipo aprobado con los datos reales de la página. La
// clasificación masiva (F5-04) conserva su lógica: versión por registro,
// idempotencia y validación de categorías compatibles en el servidor.
export function HistorySelection({
  entries,
  filters,
  cursor,
  categories,
  tags,
  enabled,
  year,
  paged,
  periodLabel,
  chips,
  filtered,
}: {
  entries: HistoryEntry[];
  filters: FilterValues;
  cursor?: HistoryCursor;
  categories: { id: string; name: string; kind: "income" | "expense" }[];
  tags: { id: string; name: string }[];
  enabled: boolean;
  year: string;
  paged: boolean;
  periodLabel: string;
  chips: HistoryChip[];
  filtered: boolean;
}) {
  const router = useRouter();
  const navigate = useHistoryNavigate();
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [choice, setChoice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const rows = enabled ? entries.filter(selectable) : [];
  const withSelection = rows.length > 0;
  const selectedRows = rows.filter((entry) => selected.has(rowKey(entry)));
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

  // El servidor entrega la página por fecha descendente. Ordenar por fecha
  // ascendente o por importe reordena solo los registros de esta página.
  const ordered = useMemo(() => {
    if (sort.key === "date")
      return sort.dir === "desc" ? entries : [...entries].reverse();
    const factor = sort.dir === "asc" ? 1 : -1;
    return entries
      .map((entry, index) => ({ entry, index }))
      .sort(
        (a, b) =>
          compareHistoryAmounts(a.entry, b.entry) * factor || a.index - b.index,
      )
      .map(({ entry }) => entry);
  }, [entries, sort]);
  const reordered = sort.key !== "date" || sort.dir !== "desc";

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  }

  const ariaSort = (key: SortKey) =>
    sort.key === key
      ? sort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none";

  function toggle(entry: HistoryEntry) {
    const key = rowKey(entry);
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
            rows.map((entry) => [rowKey(entry), entry.classificationVersion]),
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
      setError(
        connectionAwareMessage(
          "No pudimos confirmar la edición. Reintentá el mismo envío.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const go = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    navigate(href, "resultados");
  };

  const count = entries.length;

  return (
    <>
      <div className="lab-mx__summary">
        <h2 id="resultados" tabIndex={-1} className="lab-mx__title">
          Movimientos
        </h2>
        <p aria-live="polite" className="lab-muted text-sm">
          {count} {count === 1 ? "resultado" : "resultados"}
          {paged && " en esta página"} · {periodLabel}
          {paged && reordered && " · Orden aplicado a esta página"}
        </p>
        {chips.length > 0 && (
          <ul className="lab-chips" aria-label="Filtros activos">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => navigate(chip.href, "resultados")}
                  className="lab-chip"
                  aria-label={`Quitar filtro ${chip.title}: ${chip.value}`}
                >
                  <span className="lab-muted">{chip.title}:</span> {chip.value}
                  <Icon name="close" duotone={false} className="size-3.5" />
                </button>
              </li>
            ))}
            <li>
              <Link
                href="/historial"
                prefetch={false}
                scroll={false}
                onClick={go("/historial")}
                className="lab-link"
              >
                Limpiar todo
              </Link>
            </li>
          </ul>
        )}
        {withSelection && (
          <label className="lab-mx__select-all">
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
            />
            Seleccionar todo
          </label>
        )}
      </div>

      <div className="lab-mx__messages">
        {Boolean(error) && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
        {Boolean(notice) && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>

      {selectedRows.length > 0 && (
        <form
          method="post"
          onSubmit={apply}
          aria-label="Clasificación masiva"
          className="lab-bulk"
        >
          <p className="lab-bulk__count">
            {selectedRows.length}{" "}
            {selectedRows.length === 1
              ? "registro seleccionado"
              : "registros seleccionados"}{" "}
            en esta página.
          </p>
          <div className="lab-bulk__actions">
            <label className="lab-select">
              <span className="sr-only">Categoría o etiqueta</span>
              <select
                value={validChoice ? choice : ""}
                onChange={(event) => setChoice(event.target.value)}
                disabled={pending}
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
              <Icon name="chevronDown" duotone={false} className="size-4" />
            </label>
            <button
              type="submit"
              disabled={pending || !validChoice}
              className="ui-btn ui-btn--primary"
            >
              {pending
                ? "Aplicando…"
                : type === "tag"
                  ? "Agregar etiqueta"
                  : "Aplicar categoría"}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              disabled={pending}
              onClick={() => setSelected(new Map())}
            >
              Quitar selección
            </button>
          </div>
        </form>
      )}

      <div className="lab-table-wrap">
        {count > 0 ? (
          <table
            className={`lab-table${withSelection ? " has-selection" : ""}`}
          >
            <caption className="sr-only">
              Movimientos{paged ? " de esta página" : ""}. Los encabezados Fecha
              e Importe permiten ordenar
              {paged ? " los registros de esta página" : ""}.
            </caption>
            <thead>
              <tr>
                {withSelection && (
                  <th scope="col" className="lab-th-check">
                    <span className="sr-only">Selección</span>
                  </th>
                )}
                <th scope="col" aria-sort={ariaSort("date")}>
                  <button
                    type="button"
                    className="lab-sort"
                    onClick={() => toggleSort("date")}
                  >
                    Fecha
                    <Icon name="sort" duotone={false} className="size-3.5" />
                  </button>
                </th>
                <th scope="col">Concepto</th>
                <th scope="col">Categoría</th>
                <th scope="col">Medio</th>
                <th scope="col">Estado</th>
                <th
                  scope="col"
                  aria-sort={ariaSort("amount")}
                  className="text-right"
                >
                  <button
                    type="button"
                    className="lab-sort ml-auto"
                    onClick={() => toggleSort("amount")}
                  >
                    Importe
                    <Icon name="sort" duotone={false} className="size-3.5" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((entry) => {
                const key = rowKey(entry);
                const checked = selected.has(key);
                return (
                  <tr
                    key={key}
                    className={
                      [
                        entry.status === "voided" && "is-voided",
                        checked && "is-selected",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    {withSelection && (
                      <td className="lab-td-check">
                        {selectable(entry) && (
                          <label className="lab-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(entry)}
                              disabled={pending}
                              aria-label={`Seleccionar ${entry.concept}`}
                            />
                          </label>
                        )}
                      </td>
                    )}
                    <td className="lab-td-date tabular-nums">
                      <HistoryDate iso={entry.effectiveOn} year={year} />
                    </td>
                    <td className="lab-td-concept">
                      <KindBadge kind={entry.kind} />
                      <span className="min-w-0">
                        <a
                          href={`/historial/${entry.kind === "checkpoint" ? "saldos" : "movimientos"}/${entry.id}${historySearch(filters, cursor)}#titulo-pagina`}
                          className="lab-td-concept__title"
                        >
                          {entry.concept}
                        </a>
                        <span className="lab-td-concept__sub">
                          {historyKinds[entry.kind]}
                        </span>
                      </span>
                    </td>
                    <td className="lab-td-category">
                      {entry.category ?? (
                        <span className="lab-muted">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Sin categoría</span>
                        </span>
                      )}
                    </td>
                    <td className="lab-td-method">
                      {entry.method ? (
                        movementDisplayMethods[entry.method]
                      ) : (
                        <span className="lab-muted">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Sin medio</span>
                        </span>
                      )}
                    </td>
                    <td className="lab-td-status">
                      <StatusPill status={entry.status} />
                    </td>
                    <td className="lab-td-amount">
                      <HistoryTableAmount entry={entry} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="lab-empty">
            <Icon name="search" className="size-8" />
            <p className="font-medium">
              {filtered
                ? "No hay movimientos con estos filtros"
                : "Todavía no hay movimientos en el historial"}
            </p>
            {filtered && (
              <Link
                href="/historial"
                prefetch={false}
                scroll={false}
                onClick={go("/historial")}
                className="ui-btn ui-btn--ghost"
              >
                Limpiar filtros
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
