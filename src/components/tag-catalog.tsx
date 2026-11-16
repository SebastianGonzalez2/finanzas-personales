"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { MovementTag } from "@/domain/classification";
import { useFinancialCommand } from "./financial-command";
import { StateTag } from "./glaciar/screen";
import { buttonClass } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Icon } from "./ui/icon";

export function TagCatalog({ tags }: { tags: MovementTag[] }) {
  return (
    <div className="gs-grid">
      <section className="lab-panel gs-span-8" aria-labelledby="mis-etiquetas">
        <header className="lab-panel__head">
          <h2 id="mis-etiquetas" className="lab-panel__title">
            <span className="lab-panel__icon">
              <Icon name="categories" className="size-4.5" />
            </span>
            Mis etiquetas
          </h2>
          {tags.length > 0 && (
            <span className="lab-tag lab-tag--neutral">{tags.length}</span>
          )}
        </header>
        <TagForm />
        {tags.length > 0 ? (
          <ul className="gs-rows">
            {tags.map((tag) => (
              <li key={`${tag.id}-${tag.version}`}>
                <TagForm tag={tag} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="lab-muted py-6 text-center text-sm">
            Todavía no creaste etiquetas. También podés crearlas al clasificar
            un movimiento.
          </p>
        )}
      </section>
    </div>
  );
}

function TagForm({ tag }: { tag?: MovementTag }) {
  const router = useRouter();
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/classification",
    "POST",
  );
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const action =
      button instanceof HTMLButtonElement
        ? button.value
        : tag
          ? "rename"
          : "create";
    const form = new FormData(event.currentTarget);
    const target = event.currentTarget;
    setSaved(false);
    if (
      await send({
        action,
        name: form.get("name"),
        ...(tag && { id: tag.id, version: tag.version }),
      })
    ) {
      if (!tag) target.reset();
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid min-w-0 flex-1 gap-2">
      <fieldset
        disabled={pending || uncertain}
        className="flex min-w-0 flex-wrap items-end gap-2"
      >
        <Field
          className="min-w-0 flex-1"
          label={
            tag
              ? tag.archived
                ? "Etiqueta archivada"
                : "Nombre de la etiqueta"
              : "Nueva etiqueta"
          }
        >
          <Input
            name="name"
            maxLength={60}
            defaultValue={tag?.name}
            placeholder={tag ? undefined : "Ej.: vacaciones"}
            required
          />
        </Field>
        {tag?.archived && <StateTag tone="neutral">Archivada</StateTag>}
        <button
          value={tag ? "rename" : "create"}
          type="submit"
          className={buttonClass(tag ? "outline" : "primary")}
        >
          {tag ? "Renombrar" : "Crear etiqueta"}
        </button>
        {tag && (
          <button
            value={tag.archived ? "restore" : "archive"}
            type="submit"
            formNoValidate
            className={buttonClass("ghost")}
          >
            {tag.archived ? "Restaurar" : "Archivar"}
          </button>
        )}
      </fieldset>
      {uncertain && (
        <button
          type="submit"
          formNoValidate
          className={buttonClass("outline", "justify-self-start")}
        >
          Reintentar guardado
        </button>
      )}
      {error && (
        <p role="alert" className="gs-hint">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="gs-hint">
          Etiqueta guardada.
        </p>
      )}
    </form>
  );
}
