"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  historySearch,
  type HistoryFilters as FilterValues,
} from "@/domain/history";
import {
  savedFilterCriteria,
  savedFilterNameLimit,
  savedFilterNeedsReview,
  type SavedFilter,
} from "@/domain/history-filters";
import { Panel } from "./glaciar-summary/panel";

// UI-04: estilo Glaciar (vidrio de panel y controles del Historial).
const primary = "ui-btn ui-btn--primary";
const secondary = "ui-btn ui-btn--ghost";
const control = "lab-input";

// Filtros guardados del historial (v9.47, DECISIÓN 1A): se guarda la
// combinación de criterios, nunca una lista de resultados. Al aplicarlos se
// consultan los datos actuales; los rangos relativos («mes actual») se
// resuelven en cada consulta y no quedan fijados a la fecha de creación.
export function SavedHistoryFilters({
  values,
  saved,
  categories,
  tags,
  canUpdateCriteria,
}: {
  values: FilterValues;
  saved: SavedFilter[];
  categories: { id: string; archived: boolean }[];
  tags: { id: string; archived: boolean }[];
  canUpdateCriteria: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState("");
  const [replacing, setReplacing] = useState("");
  const [editedName, setEditedName] = useState("");
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const criteria = savedFilterCriteria(values);
  const canSave = Object.values(criteria).some(Boolean);

  async function send(body: Record<string, unknown>, retry: string) {
    setPending(true);
    setError("");
    setNotice("");
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/history-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, idempotencyKey: attempt.current.key }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        if (response.status < 500) attempt.current = null;
        setError(data.error ?? retry);
        return false;
      }
      attempt.current = null;
      router.refresh();
      return true;
    } catch {
      setError(retry);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function saveCurrent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    if (
      await send(
        { action: "create", name: name.trim(), criteria },
        "No pudimos guardar el filtro. Reintentá el mismo envío.",
      )
    ) {
      setName("");
      setNotice("Filtro guardado.");
    }
  }

  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry = saved.find(({ id }) => id === editing);
    if (!entry || !editedName.trim()) return;
    if (
      await send(
        {
          action: "rename",
          entryId: entry.id,
          version: entry.version,
          name: editedName.trim(),
        },
        "No pudimos renombrar el filtro. Reintentá el mismo envío.",
      )
    ) {
      setEditing("");
      setNotice("Filtro renombrado.");
    }
  }

  async function remove(entry: SavedFilter) {
    if (
      await send(
        {
          action: "delete",
          entryId: entry.id,
          version: entry.version,
        },
        "No pudimos eliminar el filtro. Reintentá el mismo envío.",
      )
    )
      setNotice("Filtro eliminado.");
  }

  async function replaceCriteria(entry: SavedFilter) {
    if (
      await send(
        {
          action: "update-criteria",
          entryId: entry.id,
          version: entry.version,
          criteria,
        },
        "No pudimos actualizar el filtro. Reintentá el mismo envío.",
      )
    ) {
      setReplacing("");
      setNotice("Criterios actualizados.");
    }
  }

  return (
    <Panel title="Filtros guardados" icon="filter">
      {canSave && (
        <form method="post" onSubmit={saveCurrent} className="lab-saved__form">
          <div className="lab-field">
            <label
              htmlFor="filtro-guardado-nombre"
              className="lab-field__label"
            >
              Guardar la búsqueda actual como
            </label>
            <input
              id="filtro-guardado-nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={savedFilterNameLimit}
              required
              placeholder="Ej. Ropa mes actual"
              className={control}
            />
          </div>
          <button type="submit" disabled={pending} className={primary}>
            {pending ? "Guardando…" : "Guardar filtro"}
          </button>
        </form>
      )}
      {saved.length > 0 ? (
        <ul className="lab-saved" aria-label="Filtros guardados">
          {saved.map((entry) => (
            <li key={entry.id} className="lab-saved__item">
              {editing === entry.id ? (
                <form
                  method="post"
                  onSubmit={rename}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                >
                  <input
                    value={editedName}
                    onChange={(event) => setEditedName(event.target.value)}
                    maxLength={savedFilterNameLimit}
                    required
                    autoFocus
                    aria-label="Nuevo nombre del filtro"
                    className={`${control} min-w-0 flex-1 basis-48`}
                  />
                  <button type="submit" disabled={pending} className={primary}>
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing("")}
                    disabled={pending}
                    className={secondary}
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <a
                      href={`/historial${historySearch(entry.criteria)}#titulo-pagina`}
                      className="lab-link min-h-6 max-w-full text-sm wrap-anywhere"
                    >
                      {entry.name}
                    </a>
                    {savedFilterNeedsReview(
                      entry.criteria,
                      categories,
                      tags,
                    ) && (
                      <span className="lab-muted block text-xs">
                        Un criterio cambió y requiere revisión.
                      </span>
                    )}
                    {(categories.some(
                      ({ id, archived }) =>
                        archived &&
                        id === entry.criteria.category?.toLowerCase(),
                    ) ||
                      tags.some(
                        ({ id, archived }) =>
                          archived &&
                          entry.criteria.tags?.split(",").includes(id),
                      )) && (
                      <span className="lab-muted block text-xs">
                        Incluye un criterio archivado. El filtro sigue
                        disponible.
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondary}
                      disabled={pending}
                      onClick={() => {
                        setEditing(entry.id);
                        setEditedName(entry.name);
                      }}
                    >
                      Renombrar
                    </button>
                    {canUpdateCriteria && canSave && (
                      <button
                        type="button"
                        className={secondary}
                        disabled={pending}
                        onClick={() => setReplacing(entry.id)}
                      >
                        Usar búsqueda actual
                      </button>
                    )}
                    <button
                      type="button"
                      className={secondary}
                      disabled={pending}
                      onClick={() => remove(entry)}
                    >
                      Eliminar
                    </button>
                  </span>
                </>
              )}
              {replacing === entry.id && (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <p className="text-sm">
                    ¿Reemplazar los criterios de «{entry.name}» por la búsqueda
                    actual?
                  </p>
                  <button
                    type="button"
                    className={primary}
                    disabled={pending}
                    onClick={() => replaceCriteria(entry)}
                  >
                    Reemplazar criterios
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    disabled={pending}
                    onClick={() => setReplacing("")}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="lab-muted text-sm">
          Guardá combinaciones de criterios que usás seguido para aplicarlas con
          un toque. Se guardan con tu cuenta y no se mezclan con otros usuarios.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </Panel>
  );
}
