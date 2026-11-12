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
import { Card } from "./ui/card";

const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const secondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border px-2 text-sm hover:bg-accent disabled:opacity-60";
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

// Filtros guardados del historial (v9.47, DECISIÓN 1A): se guarda la
// combinación de criterios, nunca una lista de resultados. Al aplicarlos se
// consultan los datos actuales; los rangos relativos («mes actual») se
// resuelven en cada consulta y no quedan fijados a la fecha de creación.
export function SavedHistoryFilters({
  values,
  saved,
  categories,
}: {
  values: FilterValues;
  saved: SavedFilter[];
  categories: { id: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState("");
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

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 className="font-semibold">Filtros guardados</h2>
      {canSave && (
        <form
          method="post"
          onSubmit={saveCurrent}
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <label className="grid gap-1 text-sm font-medium">
            Guardar la búsqueda actual como
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={savedFilterNameLimit}
              required
              placeholder="Ej. Ropa mes actual"
              className={control}
            />
          </label>
          <button type="submit" disabled={pending} className={primary}>
            {pending ? "Guardando…" : "Guardar filtro"}
          </button>
        </form>
      )}
      {saved.length > 0 ? (
        <ul className="grid gap-2">
          {saved.map((entry) => (
            <li
              key={entry.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
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
                    className={`${control} min-w-0 flex-1`}
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
                      className="block truncate font-medium underline-offset-2 hover:underline"
                    >
                      {entry.name}
                    </a>
                    {savedFilterNeedsReview(entry.criteria, categories) && (
                      <span className="text-xs text-muted-foreground">
                        Un criterio cambió y requiere revisión.
                      </span>
                    )}
                  </span>
                  <span className="flex gap-2">
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Guardá combinaciones de criterios que usás seguido para aplicarlas con
          un toque. Se guardan con tu cuenta y no se mezclan con otros usuarios.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </Card>
  );
}
