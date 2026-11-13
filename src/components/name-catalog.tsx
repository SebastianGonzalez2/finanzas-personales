"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  catalogKinds,
  catalogNameLimit,
  personNameLimit,
  type CatalogCommandInput,
  type CatalogEntry,
  type CatalogKind,
  type MerchantMergePreview,
} from "@/domain/catalog";
import { connectionAwareMessage } from "./connection";
import { Card } from "./ui/card";

const primary =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-2 text-sm hover:bg-accent disabled:opacity-60";
const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";

// Catálogo privado de comercios y contactos con archivado reversible (v9.45):
// lo archivado deja de sugerirse en movimientos nuevos pero sigue listado aquí,
// sin afectar deudas, obligaciones ni reportes.
export function NameCatalog({
  entries,
  contactId,
}: {
  entries: CatalogEntry[];
  contactId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<CatalogKind>("merchant");
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<MerchantMergePreview | null>(null);
  const [notice, setNotice] = useState("");
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const active = entries.filter(({ archived }) => !archived);
  const archived = entries.filter(({ archived }) => archived);
  const merchants = entries.filter((entry) => entry.kind === "merchant");

  async function send(command: CatalogCommandInput) {
    setPending(true);
    setError("");
    setNotice("");
    const body = JSON.stringify(command);
    if (attempt.current?.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...command,
          idempotencyKey: attempt.current.key,
        }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          attempt.current = null;
          if (command.action === "merge") {
            setPreview(null);
            router.refresh();
          }
        }
        setError(data.error ?? "No pudimos confirmar el guardado.");
        return false;
      }
      attempt.current = null;
      router.refresh();
      return true;
    } catch {
      setError(
        connectionAwareMessage(
          "No pudimos confirmar el guardado. Reintentá el mismo envío.",
        ),
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function loadPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const params = new URLSearchParams({ sourceId, targetId });
      const response = await fetch(`/api/catalog?${params}`);
      const data: { preview?: MerchantMergePreview; error?: string } =
        await response.json();
      if (!response.ok || !data.preview) {
        setError(data.error ?? "No pudimos cargar la vista previa.");
        return;
      }
      setPreview(data.preview);
    } catch {
      setError("No pudimos cargar la vista previa. Volvé a intentarlo.");
    } finally {
      setPending(false);
    }
  }

  async function confirmMerge() {
    if (!preview) return;
    const { source, target, movementCount } = preview;
    if (
      await send({
        action: "merge",
        kind: "merchant",
        sourceId: source.id,
        targetId: target.id,
        sourceVersion: source.version,
        targetVersion: target.version,
        movementCount,
      })
    ) {
      setPreview(null);
      setSourceId("");
      setTargetId("");
      setNotice(`Comercios unificados en ${target.name}.`);
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
        id={entry.kind === "person" ? `contacto-${entry.id}` : undefined}
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
                maxLength={
                  kind === "person" ? personNameLimit : catalogNameLimit
                }
                required
                className={control}
              />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Los nombres que ingresás al guardar gastos o deudas también se
            agregan al catálogo.
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
      {merchants.length > 1 && merchants.some((entry) => !entry.archived) && (
        <Card className="grid gap-3 p-4">
          <h2 className="text-base font-semibold">Unificar comercios</h2>
          <form onSubmit={loadPreview} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Comercio duplicado
                <select
                  value={sourceId}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    setPreview(null);
                  }}
                  required
                  disabled={pending}
                  className={control}
                >
                  <option value="">Elegí el duplicado</option>
                  {merchants.map(({ id, name, archived }) => (
                    <option key={id} value={id} disabled={id === targetId}>
                      {name}
                      {archived ? " (archivado)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Comercio que se conserva
                <select
                  value={targetId}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    setPreview(null);
                  }}
                  required
                  disabled={pending}
                  className={control}
                >
                  <option value="">Elegí el nombre que se conserva</option>
                  {merchants
                    .filter((entry) => !entry.archived)
                    .map(({ id, name }) => (
                      <option key={id} value={id} disabled={id === sourceId}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={pending || !sourceId || !targetId}
              className={`${secondary} justify-self-start`}
            >
              Ver vista previa
            </button>
          </form>
          {preview && (
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <p role="status">
                <strong>{preview.target.name}</strong> quedará asociado a{" "}
                {preview.movementCount}{" "}
                {preview.movementCount === 1 ? "movimiento" : "movimientos"}.{" "}
                <strong>{preview.source.name}</strong> quedará como alias.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmMerge}
                  disabled={pending}
                  className={primary}
                >
                  Confirmar unificación
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={pending}
                  className={secondary}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
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
            open={
              archived.some(
                ({ id, kind }) => id === contactId && kind === "person",
              ) || undefined
            }
          >
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Archivados ({archived.length})
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              No se sugieren para movimientos nuevos, pero siguen referidos en
              gastos, préstamos y estadísticas históricos. Archivar un contacto
              no cancela deudas activas.
            </p>
            <ul className="mt-2 grid gap-2">{archived.map(row)}</ul>
          </details>
        )}
      </Card>
    </div>
  );
}
