"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent } from "react";
import {
  categoryNameLimit,
  groupCatalogCategories,
  normalizeCategoryName,
  type CatalogCategory,
} from "@/domain/categories";
import type { MovementKind } from "@/domain/movements";
import { connectionAwareMessage } from "./connection";

const createValue = "__create__";
const createButton =
  "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const cancelButton = "min-h-11 rounded-lg px-2 text-sm hover:bg-accent";

// Selector de categorías con creación desde el formulario (RF-039, CA-051).
// La creación no envía el formulario contenedor: solo registra la categoría.
export function CategorySelect({
  kind,
  categories,
  controlClassName,
  labelClassName,
  labelText = "Categoría (opcional)",
  name = "categoryId",
  defaultValue = "",
  optional = true,
  unlisted = null,
  excludedIds,
}: {
  kind: MovementKind;
  categories: CatalogCategory[];
  controlClassName: string;
  labelClassName?: string;
  labelText?: string;
  name?: string;
  defaultValue?: string;
  optional?: boolean;
  unlisted?: { value: string; label: string } | null;
  excludedIds?: ReadonlySet<string>;
}) {
  const router = useRouter();
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [created, setCreated] = useState<CatalogCategory[]>([]);
  const [panel, setPanel] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const catalog = [...categories, ...created]
    .filter((category) => category.kind === kind)
    .filter(
      (category, index, all) =>
        all.findIndex((other) => other.id === category.id) === index,
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const { tops, childrenOf } = groupCatalogCategories(catalog);

  function openPanel() {
    setPanel(true);
    setError("");
    requestAnimationFrame(() => nameInput.current?.focus());
  }

  function closePanel() {
    setPanel(false);
    setNewName("");
    setNewParent("");
    setError("");
    requestAnimationFrame(() => select.current?.focus());
  }

  function change(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (next === createValue) {
      event.target.value = value;
      openPanel();
      return;
    }
    setValue(next);
    setError("");
  }

  async function create() {
    if (pending) return;
    const trimmed = normalizeCategoryName(newName);
    if (!trimmed) {
      setError("Ingresá el nombre de la categoría.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: trimmed,
          parentId: newParent || null,
        }),
      });
      const data: { id?: string; error?: string } = await response.json();
      if (response.ok && data.id) {
        setCreated((current) => [
          ...current,
          {
            id: data.id as string,
            kind,
            name: trimmed,
            parentId: newParent || null,
          },
        ]);
        setValue(data.id);
        closePanel();
        router.refresh();
      } else {
        setError(
          data.error ?? "No pudimos crear la categoría. Reintentá el envío.",
        );
      }
    } catch {
      setError(
        connectionAwareMessage(
          "No pudimos crear la categoría. Reintentá el envío.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={labelClassName ?? "space-y-1 text-sm"}>
      {labelText ? (
        <label htmlFor={id}>
          <span>{labelText}</span>
        </label>
      ) : null}
      <select
        ref={select}
        id={id}
        name={name}
        className={controlClassName}
        value={value}
        onChange={change}
      >
        {optional ? (
          <option value="">Sin categorizar</option>
        ) : (
          <option value="" disabled>
            Elegí una categoría
          </option>
        )}
        {unlisted && !catalog.some(({ id }) => id === unlisted.value) && (
          <option value={unlisted.value}>{unlisted.label}</option>
        )}
        {tops.map((top) => {
          const children = childrenOf(top.id).filter(
            ({ id }) => !excludedIds?.has(id),
          );
          const showTop = !excludedIds?.has(top.id);
          if (!showTop && !children.length) return null;
          return (
            <optgroup key={top.id} label={top.name}>
              {showTop && <option value={top.id}>{top.name}</option>}
              {children.map(({ id: childId, name: childName }) => (
                <option key={childId} value={childId}>
                  {top.name} › {childName}
                </option>
              ))}
            </optgroup>
          );
        })}
        <option value={createValue}>＋ Crear categoría…</option>
      </select>
      {panel && (
        <div className="grid gap-2 rounded-lg border p-3">
          <label className="space-y-1 text-sm">
            <span>Nombre de la categoría nueva</span>
            <input
              ref={nameInput}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void create();
                }
              }}
              inputMode="text"
              maxLength={categoryNameLimit}
              autoComplete="off"
              className={controlClassName}
              disabled={pending}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Subcategoría de (opcional)</span>
            <select
              value={newParent}
              onChange={(event) => setNewParent(event.target.value)}
              className={controlClassName}
              disabled={pending}
            >
              <option value="">Sin subcategoría</option>
              {tops.map(({ id: topId, name: topName }) => (
                <option key={topId} value={topId}>
                  {topName}
                </option>
              ))}
            </select>
          </label>
          <p role="alert" className={error ? "text-sm" : "sr-only"}>
            {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={createButton}
              disabled={pending}
              onClick={() => void create()}
            >
              {pending ? "Creando…" : "Crear categoría"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={closePanel}
              className={cancelButton}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
