"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  catalogKinds,
  catalogNameLimit,
  type CatalogCommandInput,
  type CatalogEntry,
  type CatalogKind,
} from "@/domain/catalog";
import { Card } from "./ui/card";

const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const secondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border px-2 text-sm hover:bg-accent disabled:opacity-60";
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

// Catálogo privado de comercios y contactos con archivado reversible (v9.45):
// lo archivado deja de sugerirse en movimientos nuevos pero sigue listado aquí,
// sin afectar deudas, obligaciones ni reportes.
export function NameCatalog({ entries }: { entries: CatalogEntry[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<CatalogKind>("merchant");
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const active = entries.filter(({ archived }) => !archived);
  const archived = entries.filter(({ archived }) => archived);

  async function send(command: CatalogCommandInput) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...command,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No pudimos confirmar el guardado.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("No pudimos confirmar el guardado. Reintentá el mismo envío.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    if (await send({ action: "create", kind, name: value })) setName("");
  }

  function toggle(entry: CatalogEntry) {
    void send({
      action: entry.archived ? "restore" : "archive",
      kind: entry.kind,
      entryId: entry.id,
      version: entry.version,
    });
  }

  function row(entry: CatalogEntry) {
    return (
      <li
        key={entry.id}
        className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{entry.name}</span>
          <span className="text-xs text-muted-foreground">
            {catalogKinds[entry.kind]}
          </span>
        </span>
        <button
          type="button"
          className={secondary}
          disabled={pending}
          onClick={() => toggle(entry)}
        >
          {entry.archived ? "Restaurar" : "Archivar"}
        </button>
      </li>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-4">
        <form method="post" onSubmit={create} className="grid gap-3">
          <h2 className="text-base font-semibold">Agregar al catálogo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Tipo
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as CatalogKind)}
                className={control}
              >
                {Object.entries(catalogKinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Nombre
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={catalogNameLimit}
                required
                className={control}
              />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            También se guardan solos al confirmar un gasto con comercio nuevo o
            un gasto compartido con una persona. La búsqueda ignora mayúsculas,
            acentos y espacios extra: no se crean duplicados tipográficos.
          </p>
          <button
            type="submit"
            disabled={pending}
            className={`${primary} justify-self-start`}
          >
            {pending ? "Guardando…" : "Agregar"}
          </button>
        </form>
      </Card>
      <Card className="grid gap-3 p-4">
        <h2 className="text-base font-semibold">
          Activos ({active.length} · {archived.length} archivados)
        </h2>
        {active.length ? (
          <ul className="grid gap-2">{active.map(row)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay comercios ni contactos en tu catálogo.
          </p>
        )}
        {archived.length > 0 && (
          <details
            onToggle={(event) =>
              setShowArchived((event.target as HTMLDetailsElement).open)
            }
          >
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Archivados ({archived.length})
            </summary>
            {showArchived && (
              <p className="mt-2 text-sm text-muted-foreground">
                No se sugieren para movimientos nuevos, pero siguen referidos en
                gastos, préstamos y estadísticas históricos. Archivar un
                contacto no cancela deudas activas.
              </p>
            )}
            <ul className="mt-2 grid gap-2">{archived.map(row)}</ul>
          </details>
        )}
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
