"use client";

import { useRef, useState, type ReactNode } from "react";
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
import { FormFoot, FormPanel, RowIcon, StateTag } from "./glaciar/screen";
import { buttonClass } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Icon } from "./ui/icon";

// Catálogo privado de comercios y contactos con archivado reversible (v9.45):
// lo archivado deja de sugerirse en movimientos nuevos pero sigue listado aquí,
// sin afectar deudas, obligaciones ni reportes.
export function NameCatalog({
  entries,
  contactId,
  children,
}: {
  entries: CatalogEntry[];
  contactId?: string;
  children?: ReactNode;
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
      >
        <RowIcon name={entry.kind === "person" ? "account" : "merchants"} />
        <div className="gs-row__main">
          <p
            className={`gs-row__title ${entry.archived ? "text-[var(--glaciar-faint)]" : ""}`}
          >
            {entry.name}
          </p>
          <p className="gs-row__sub">{catalogKinds[entry.kind]}</p>
        </div>
        {entry.archived && <StateTag tone="neutral">Archivado</StateTag>}
        <button
          type="button"
          aria-label={`${entry.archived ? "Restaurar" : "Archivar"} ${entry.name}`}
          className={buttonClass("ghost")}
          disabled={pending}
          onClick={() => toggle(entry)}
        >
          {entry.archived ? "Restaurar" : "Archivar"}
        </button>
      </li>
    );
  }

  const canMerge =
    merchants.length > 1 && merchants.some((entry) => !entry.archived);

  return (
    <>
      {canMerge && (
        <details className="gs-creator" open={Boolean(preview) || undefined}>
          <summary className={buttonClass("outline")}>
            <Icon name="merchants" duotone={false} className="size-4" />
            Unificar comercios
          </summary>
          <FormPanel
            labelId="form-unificar"
            title="Unificar comercios"
            description="El duplicado queda como alias del que se conserva. Los movimientos existentes no cambian de importe."
          >
            <form onSubmit={loadPreview} className="grid gap-4">
              <div className="gs-form__grid">
                <Field label="Comercio duplicado">
                  <Select
                    value={sourceId}
                    onChange={(event) => {
                      setSourceId(event.target.value);
                      setPreview(null);
                    }}
                    required
                    disabled={pending}
                  >
                    <option value="">Elegí el duplicado</option>
                    {merchants.map(({ id, name, archived }) => (
                      <option key={id} value={id} disabled={id === targetId}>
                        {name}
                        {archived ? " (archivado)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Comercio que se conserva">
                  <Select
                    value={targetId}
                    onChange={(event) => {
                      setTargetId(event.target.value);
                      setPreview(null);
                    }}
                    required
                    disabled={pending}
                  >
                    <option value="">Elegí el nombre que se conserva</option>
                    {merchants
                      .filter((entry) => !entry.archived)
                      .map(({ id, name }) => (
                        <option key={id} value={id} disabled={id === sourceId}>
                          {name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
              <FormFoot>
                <button
                  type="submit"
                  disabled={pending || !sourceId || !targetId}
                  className={buttonClass("outline")}
                >
                  Ver vista previa
                </button>
              </FormFoot>
            </form>
            {preview && (
              <div className="grid gap-3">
                <p role="status" className="gs-hint">
                  <strong>{preview.target.name}</strong> quedará asociado a{" "}
                  {preview.movementCount}{" "}
                  {preview.movementCount === 1 ? "movimiento" : "movimientos"}.{" "}
                  <strong>{preview.source.name}</strong> quedará como alias.
                </p>
                <FormFoot>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    disabled={pending}
                    className={buttonClass("ghost")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmMerge}
                    disabled={pending}
                    className={buttonClass("primary")}
                  >
                    Confirmar unificación
                  </button>
                </FormFoot>
              </div>
            )}
          </FormPanel>
        </details>
      )}
      {notice && (
        <p role="status" className="gs-hint">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="gs-hint">
          {error}
        </p>
      )}
      <div className="gs-grid">
        <section
          className={`lab-panel ${children ? "gs-span-7" : ""}`}
          aria-labelledby="catalogo-lista"
        >
          <header className="lab-panel__head">
            <h2 id="catalogo-lista" className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="merchants" className="size-4.5" />
              </span>
              Catálogo
            </h2>
            <span className="lab-tag lab-tag--neutral">
              {active.length} activos · {archived.length} archivados
            </span>
          </header>
          <form
            method="post"
            onSubmit={create}
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          >
            <Field label="Nombre">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={
                  kind === "person" ? personNameLimit : catalogNameLimit
                }
                placeholder="Agregar comercio o contacto"
                required
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value as CatalogKind)}
              >
                {Object.entries(catalogKinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <button
              type="submit"
              disabled={pending}
              className={buttonClass("primary")}
            >
              {pending ? "Guardando…" : "Agregar"}
            </button>
          </form>
          <p className="gs-hint">
            Los nombres que ingresás al guardar gastos o deudas también se
            agregan al catálogo.
          </p>
          {active.length ? (
            <ul className="gs-rows">{active.map(row)}</ul>
          ) : (
            <p className="lab-muted py-6 text-center text-sm">
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
              <p className="gs-hint mb-2">
                No se sugieren para movimientos nuevos, pero siguen referidos en
                gastos, préstamos y estadísticas históricos. Archivar un
                contacto no cancela deudas activas.
              </p>
              <ul className="gs-rows">{archived.map(row)}</ul>
            </details>
          )}
        </section>
        {children && <div className="gs-span-5">{children}</div>}
      </div>
    </>
  );
}
