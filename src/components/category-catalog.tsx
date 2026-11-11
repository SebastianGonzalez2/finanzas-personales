"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  categoryNameLimit,
  groupCatalogCategories,
  type CatalogCategory,
} from "@/domain/categories";
import type { MovementKind } from "@/domain/movements";
import { Card } from "./ui/card";

const control =
  "block min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";
const primary =
  "min-h-11 justify-self-start rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const kinds = {
  income: "Ingresos",
  expense: "Gastos",
} satisfies Record<MovementKind, string>;

export function CategoryCatalog({
  categories,
}: {
  categories: (CatalogCategory & { archived: boolean })[];
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [kind, setKind] = useState<MovementKind>("expense");
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
      setError("No pudimos actualizar la categoría. Reintentá el envío.");
    } finally {
      setPending(false);
    }
  }

  function categoryRow(
    category: (typeof categories)[number],
    parentArchived = false,
  ) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <span className="font-medium">{category.name}</span>
        {parentArchived ? (
          <span className="text-muted-foreground">
            Categoría superior archivada
          </span>
        ) : (
          <button
            type="button"
            aria-label={`${category.archived ? "Restaurar" : "Archivar"} ${category.name}`}
            className="min-h-11 rounded-lg px-2 hover:bg-accent disabled:opacity-60"
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
      setError("No pudimos crear la categoría. Reintentá el envío.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="gap-3 rounded-[1.125rem] p-4 shadow-none sm:p-6">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
          Crear categoría o subcategoría
        </h2>
        <form
          method="post"
          onSubmit={submit}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="space-y-1 text-sm">
            <span>Tipo</span>
            <select
              className={control}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as MovementKind);
                setParentId("");
              }}
              disabled={pending}
            >
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Nombre</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={categoryNameLimit}
              autoComplete="off"
              className={control}
              disabled={pending}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Subcategoría de (opcional)</span>
            <select
              className={control}
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
            </select>
          </label>
          <p
            role="alert"
            className={
              error ? "text-sm sm:col-span-2" : "sr-only sm:col-span-2"
            }
          >
            {error}
          </p>
          <button
            type="submit"
            className={`${primary} sm:col-span-2`}
            disabled={pending}
          >
            {pending ? "Creando…" : "Crear categoría"}
          </button>
        </form>
        <p role="status" className={message ? "text-sm" : "sr-only"}>
          {message}
        </p>
      </Card>
      {(["expense", "income"] as const).map((section) => {
        const sectionTops = tops.filter((top) => top.kind === section);
        return (
          <Card
            key={section}
            className="gap-3 rounded-[1.125rem] p-4 shadow-none sm:p-6"
          >
            <h2 className="text-lg font-semibold">{kinds[section]}</h2>
            {sectionTops.length ? (
              <ul className="grid gap-1 text-sm">
                {sectionTops.map((top) => {
                  const children = childrenOf(top.id);
                  return (
                    <li key={top.id} className="grid gap-1">
                      {categoryRow(top)}
                      {children.length > 0 && (
                        <ul className="ml-4 grid gap-1 border-l pl-3 text-muted-foreground">
                          {children.map((child) => (
                            <li key={child.id}>
                              {categoryRow(child, top.archived)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Todavía no usaste categorías de {kinds[section].toLowerCase()}.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
