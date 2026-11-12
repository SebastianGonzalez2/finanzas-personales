"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  parseClassification,
  type CategoryAllocation,
  type MovementTag,
} from "@/domain/classification";
import { useFinancialCommand } from "./financial-command";
import { formatBankAmount } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import {
  AllocationFields,
  TagFields,
  formClassification,
} from "./classification-fields";
import { historyPrimary } from "./history-fields";

export function MovementClassification({
  eventId,
  version,
  allocations,
  tags,
  tagIds,
  categories,
  currency,
  editable,
  allocatable,
}: {
  eventId: string;
  version: number;
  allocations: (CategoryAllocation & { category: string | null })[];
  tags: MovementTag[];
  tagIds: string[];
  categories: { id: string; name: string }[];
  currency: Currency;
  editable: boolean;
  allocatable: boolean;
}) {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/classification",
    "PATCH",
  );
  const [message, setMessage] = useState("");
  const names = tags.filter((tag) => tagIds.includes(tag.id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const fields = formClassification(new FormData(event.currentTarget));
    const candidate = fields.allocations ?? [];
    const parsed = parseClassification({ allocations: candidate });
    const changeAllocations =
      allocatable &&
      ("error" in parsed ||
        JSON.stringify(parsed.allocations) !==
          JSON.stringify(
            allocations.map(({ categoryId, amount }) => ({
              categoryId,
              amount,
            })),
          ));
    const nextTags = (fields.tagIds ?? []).sort();
    const changeTags = nextTags.join(",") !== tagIds.join(",");
    if (!uncertain && !changeAllocations && !changeTags) {
      setMessage("No hay cambios para guardar.");
      return;
    }
    if (
      await send({
        eventId,
        version,
        ...(changeAllocations && { allocations: candidate }),
        ...(changeTags && { tagIds: nextTags }),
      })
    ) {
      if (details.current) details.current.open = false;
      setMessage("Clasificación guardada.");
      router.refresh();
    }
  }
  return (
    <section
      className="grid gap-3 border-t pt-4"
      aria-label="Clasificación del movimiento"
    >
      {allocations.length > 0 && (
        <div>
          <h2 className="font-semibold">Desglose por categorías</h2>
          <ul className="mt-1 grid gap-1 text-sm">
            {allocations.map(({ categoryId, category, amount }) => (
              <li key={categoryId ?? "none"} className="wrap-anywhere">
                {category ?? "Sin categorizar"} ·{" "}
                {formatBankAmount({ currency, amount })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {names.length > 0 && (
        <div>
          <h2 className="font-semibold">Etiquetas</h2>
          <ul className="mt-1 flex flex-wrap gap-2 text-sm">
            {names.map(({ id, name, archived }) => (
              <li
                key={id}
                className="rounded-md border px-2 py-1 wrap-anywhere"
              >
                {name}
                {archived && " (archivada)"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editable && (
        <details ref={details}>
          <summary className="w-fit cursor-pointer py-2 text-sm font-semibold">
            Editar clasificación
          </summary>
          <form key={version} onSubmit={submit} className="mt-2 grid gap-3">
            <fieldset disabled={pending || uncertain} className="grid gap-2">
              {allocatable && (
                <AllocationFields
                  categories={categories}
                  initial={allocations}
                />
              )}
              <TagFields tags={tags} initial={tagIds} />
            </fieldset>
            <button
              type="submit"
              className={`${historyPrimary} justify-self-start`}
              disabled={pending}
            >
              {uncertain ? "Reintentar guardado" : "Guardar clasificación"}
            </button>
          </form>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
