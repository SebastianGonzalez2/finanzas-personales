"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  categoryNameLimit,
  groupCatalogCategories,
  type CatalogCategory,
} from "@/domain/categories";
import type { MovementKind } from "@/domain/movements";
import { FormFoot, FormPanel, StateTag } from "./glaciar/screen";
import { connectionAwareMessage } from "./connection";
import { buttonClass } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Icon } from "./ui/icon";

const kinds = {
  income: "Ingresos",
  expense: "Gastos",
} satisfies Record<MovementKind, string>;

// Color decorativo de la paleta de datos (§3): se reparte por posición y nunca
// es la única señal (el nombre siempre acompaña).
const swatch = (index: number) => `var(--data-category-${(index % 5) + 1})`;

export function CategoryCatalog({
  categories,
}: {
  categories: (CatalogCategory & { archived: boolean })[];
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const kind: MovementKind = "expense";
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { tops, childrenOf } = groupCatalogCategories(categories);
  const activeTops = tops.filter((top) => !top.archived);

  async function changeArchive(category: (typeof categories)[number]) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: category.id, archived: !category.archived }),
      });
      if (!response.ok) {
        const data: { error?: string } = await response.json();
        setError(data.error ?? "No pudimos actualizar la categoría.");
        return;
      }
      if (!category.archived && parentId === category.id) setParentId("");
      setMessage(
        category.archived ? "Categoría restaurada." : "Categoría archivada.",
      );
      router.refresh();
    } catch {
      setError(
        connectionAwareMessage(
          "No pudimos actualizar la categoría. Reintentá el envío.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  function categoryRow(
    category: (typeof categories)[number],
    options: { parentArchived?: boolean; color?: string; count?: number } = {},
  ) {
    const { parentArchived, color, count } = options;
    return (
      <div
        className={`gs-tree__node ${category.archived || parentArchived ? "is-archived" : ""}`}
      >
        {color && (
          <span
            className="gs-swatch"
            style={{ background: color }}
            aria-hidden="true"
          />
        )}
        <span className={color ? "font-semibold" : "text-sm"}>
          {category.name}
        </span>
        {category.archived && <StateTag tone="neutral">Archivada</StateTag>}
        {count ? (
          <span className="lab-muted text-xs">
            {count} {count === 1 ? "subcategoría" : "subcategorías"}
          </span>
        ) : null}
        {parentArchived ? (
          <span className="lab-muted ml-auto text-xs">
            Categoría superior archivada
          </span>
        ) : (
          <button
            type="button"
            aria-label={`${category.archived ? "Restaurar" : "Archivar"} ${category.name}`}
            className={buttonClass("ghost", "ml-auto")}
            disabled={pending}
            onClick={() => void changeArchive(category)}
          >
            {category.archived ? "Restaurar" : "Archivar"}
          </button>
        )}
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Ingresá el nombre de la categoría.");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: trimmed,
          parentId: parentId || null,
        }),
      });
      const data: { id?: string; error?: string } = await response.json();
      if (response.ok && data.id) {
        setName("");
        setParentId("");
        setMessage(
          parentId
            ? "Subcategoría creada."
            : "Categoría creada. Ya podés usarla en tus formularios.",
        );
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
    <>
      <details className="gs-creator" open={categories.length === 0}>
        <summary className={buttonClass("primary")}>
          <Icon name="plus" duotone={false} className="size-4" />
          Nueva categoría
        </summary>
        <FormPanel
          labelId="form-categoria"
          title="Crear categoría o subcategoría"
          headingRef={heading}
        >
          <form method="post" onSubmit={submit} className="grid gap-4">
            <div className="gs-form__grid gs-form__grid--3">
              <Field label="Nombre">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={categoryNameLimit}
                  autoComplete="off"
                  disabled={pending}
                />
              </Field>
              <Field label="Subcategoría de (opcional)">
                <Select
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  disabled={pending}
                >
                  <option value="">Sin subcategoría</option>
                  {activeTops
                    .filter((top) => top.kind === kind)
                    .map(({ id, name: topName }) => (
                      <option key={id} value={id}>
                        {topName}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <p role="alert" className={error ? "gs-hint" : "sr-only"}>
              {error}
            </p>
            <FormFoot>
              <button
                type="submit"
                className={buttonClass("primary")}
                disabled={pending}
              >
                {pending ? "Creando…" : "Crear categoría"}
              </button>
            </FormFoot>
          </form>
        </FormPanel>
      </details>
      <p role="status" className={message ? "gs-hint" : "sr-only"}>
        {message}
      </p>
      <div className="gs-grid">
        {(["expense"] as const).map((section) => {
          const sectionTops = tops.filter((top) => top.kind === section);
          const subCount = sectionTops.reduce(
            (sum, top) => sum + childrenOf(top.id).length,
            0,
          );
          return (
            <section
              key={section}
              className="lab-panel gs-span-12"
              aria-labelledby={`cat-${section}`}
            >
              <header className="lab-panel__head">
                <h2 id={`cat-${section}`} className="lab-panel__title">
                  <span
                    className={`lab-kind lab-kind--${section}`}
                    aria-hidden="true"
                  >
                    <Icon name={section} duotone={false} className="size-4" />
                  </span>
                  {kinds[section]}
                </h2>
                {sectionTops.length > 0 && (
                  <span className="lab-tag lab-tag--neutral">
                    {sectionTops.length}{" "}
                    {sectionTops.length === 1 ? "categoría" : "categorías"}
                    {subCount > 0 && ` · ${subCount} sub.`}
                  </span>
                )}
              </header>
              {sectionTops.length ? (
                <ul className="gs-tree">
                  {sectionTops.map((top, index) => {
                    const children = childrenOf(top.id);
                    return (
                      <li key={top.id}>
                        {categoryRow(top, {
                          color: swatch(index),
                          count: children.length,
                        })}
                        {children.length > 0 && (
                          <ul className="gs-tree__children">
                            {children.map((child) => (
                              <li key={child.id}>
                                {categoryRow(child, {
                                  parentArchived: top.archived,
                                })}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="lab-muted py-6 text-center text-sm">
                  {`Todavía no usaste categorías de ${kinds[section].toLowerCase()}.`}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
