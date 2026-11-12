"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { MovementTag } from "@/domain/classification";
import { useFinancialCommand } from "./financial-command";
import {
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";
import { Card } from "./ui/card";

export function TagCatalog({ tags }: { tags: MovementTag[] }) {
  return (
    <div className="grid gap-4">
      <TagForm />
      {tags.length > 0 && (
        <Card className="gap-2 p-4">
          <h2 className="font-semibold">Mis etiquetas</h2>
          <ul className="divide-y">
            {tags.map((tag) => (
              <li key={`${tag.id}-${tag.version}`} className="py-3">
                <TagForm tag={tag} />
              </li>
            ))}
          </ul>
        </Card>
      )}
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
    <form
      onSubmit={submit}
      className={tag ? "grid gap-2" : "grid gap-2 rounded-xl border p-4"}
    >
      <fieldset
        disabled={pending || uncertain}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-0 flex-1">
          <HistoryField
            label={
              tag
                ? tag.archived
                  ? "Etiqueta archivada"
                  : "Nombre de la etiqueta"
                : "Nueva etiqueta"
            }
          >
            <input
              name="name"
              maxLength={60}
              defaultValue={tag?.name}
              className={historyControl}
              required
            />
          </HistoryField>
        </div>
        <button
          value={tag ? "rename" : "create"}
          type="submit"
          className={tag ? historyButton : historyPrimary}
        >
          {tag ? "Renombrar" : "Crear etiqueta"}
        </button>
        {tag && (
          <button
            value={tag.archived ? "restore" : "archive"}
            type="submit"
            formNoValidate
            className={historyButton}
          >
            {tag.archived ? "Restaurar" : "Archivar"}
          </button>
        )}
      </fieldset>
      {uncertain && (
        <button
          type="submit"
          formNoValidate
          className={`${historyButton} justify-self-start`}
        >
          Reintentar guardado
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Etiqueta guardada.
        </p>
      )}
    </form>
  );
}
