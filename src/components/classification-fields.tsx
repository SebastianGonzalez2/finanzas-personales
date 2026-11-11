"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  classificationLimit,
  type CategoryAllocation,
  type MovementTag,
} from "@/domain/classification";
import { useFinancialCommand } from "./financial-command";
import {
  AmountInput,
  HistoryField,
  historyButton,
  historyControl,
} from "./history-fields";

type Category = { id: string; name: string };

export function formClassification(form: FormData) {
  const enabled = form.has("allocations-enabled");
  const categoryIds = form.getAll("allocation-category");
  const amounts = form.getAll("allocation-amount");
  const tagIds = form.getAll("tag-id").map(String);
  form.delete("allocations-enabled");
  form.delete("allocation-category");
  form.delete("allocation-amount");
  form.delete("tag-id");
  return {
    ...(enabled && {
      allocations: amounts.map((amount, index) => ({
        amount: String(amount),
        categoryId: String(categoryIds[index]) || null,
      })),
    }),
    ...(tagIds.length > 0 && { tagIds }),
  };
}

export function AllocationFields({
  categories,
  available = true,
  initial = [],
  children,
}: {
  categories: Category[];
  available?: boolean;
  initial?: (CategoryAllocation & { category: string | null })[];
  children?: ReactNode;
}) {
  const [enabled, setEnabled] = useState(initial.length > 0);
  const nextId = useRef(Math.max(2, initial.length));
  const [rows, setRows] = useState<
    { id: number; allocation?: CategoryAllocation }[]
  >(() =>
    initial.length
      ? initial.map((allocation, id) => ({ id, allocation }))
      : [
          { id: 0, allocation: undefined },
          { id: 1, allocation: undefined },
        ],
  );
  const options = [
    ...categories,
    ...initial.flatMap(({ categoryId, category }) =>
      categoryId && category && !categories.some(({ id }) => id === categoryId)
        ? [{ id: categoryId, name: category }]
        : [],
    ),
  ];
  if (!available) return children;
  return (
    <>
      <div className="grid gap-2 sm:col-span-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            name="allocations-enabled"
            type="checkbox"
            className="size-5"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Dividir entre categorías
        </label>
        {enabled && (
          <fieldset className="grid gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Porciones del movimiento
            </legend>
            <p className="text-sm text-muted-foreground">
              La suma de las porciones debe coincidir con el total.
            </p>
            {rows.map(({ id, allocation }, index) => (
              <div key={id} className="grid items-end gap-2 sm:grid-cols-2">
                <HistoryField label={`Categoría ${index + 1}`}>
                  <select
                    name="allocation-category"
                    defaultValue={allocation?.categoryId ?? ""}
                    className={historyControl}
                  >
                    <option value="">Sin categorizar</option>
                    {options.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </HistoryField>
                <HistoryField label={`Importe ${index + 1}`}>
                  <AmountInput
                    name="allocation-amount"
                    defaultValue={allocation?.amount}
                    required
                  />
                </HistoryField>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className={`${historyButton} justify-self-start sm:col-span-2`}
                    aria-label={`Quitar porción ${index + 1}`}
                    onClick={() => setRows(rows.filter((row) => row.id !== id))}
                  >
                    Quitar porción
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className={`${historyButton} justify-self-start`}
              disabled={rows.length >= classificationLimit}
              onClick={() => {
                const id = nextId.current++;
                setRows([...rows, { id, allocation: undefined }]);
              }}
            >
              Agregar porción
            </button>
          </fieldset>
        )}
      </div>
      {!enabled && children}
    </>
  );
}

export function TagFields({
  tags,
  initial = [],
  filter = false,
}: {
  tags: MovementTag[];
  initial?: string[];
  filter?: boolean;
}) {
  const [created, setCreated] = useState<MovementTag[]>([]);
  const [name, setName] = useState("");
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/classification",
    "POST",
  );
  const available = [
    ...tags,
    ...created.filter((tag) => !tags.some(({ id }) => id === tag.id)),
  ].filter((tag) => filter || !tag.archived || initial.includes(tag.id));
  async function createTag() {
    const id = await send({ action: "create", name });
    if (id) {
      setCreated((previous) => [
        ...previous,
        {
          id,
          name: name.normalize("NFC").trim().replace(/\s+/g, " "),
          archived: false,
          version: 1,
        },
      ]);
      setName("");
    }
  }
  return (
    <details className="rounded-lg border px-3 py-2 sm:col-span-2">
      <summary className="cursor-pointer py-1 text-sm font-medium">
        {filter ? "Filtrar por etiquetas" : "Etiquetas (opcional)"}
        {initial.length > 0 && ` (${initial.length})`}
      </summary>
      <div className="mt-2 grid gap-1">
        {filter && (
          <p className="text-sm text-muted-foreground">
            Coincide con cualquiera de las etiquetas elegidas.
          </p>
        )}
        {available.map(({ id, name, archived }) => (
          <label
            key={id}
            className="flex min-h-9 items-center gap-2 text-sm wrap-anywhere"
          >
            <input
              className="size-4 shrink-0"
              type="checkbox"
              name={filter ? "tags" : "tag-id"}
              value={id}
              defaultChecked={
                initial.includes(id) || created.some((tag) => tag.id === id)
              }
            />
            {name}
            {archived && " (archivada)"}
          </label>
        ))}
        {!filter && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <HistoryField label="Nueva etiqueta">
                  <input
                    className={historyControl}
                    maxLength={60}
                    value={name}
                    disabled={pending || uncertain}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (name.trim() && !pending) void createTag();
                      }
                    }}
                  />
                </HistoryField>
              </div>
              <button
                type="button"
                className={historyButton}
                disabled={pending || !name.trim()}
                onClick={createTag}
              >
                {uncertain ? "Reintentar etiqueta" : "Crear etiqueta"}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-sm">
                {error}
              </p>
            )}
            <a
              href="/etiquetas"
              target="_blank"
              rel="noreferrer"
              className="w-fit py-2 text-sm underline"
            >
              Gestionar etiquetas (abre otra pestaña)
            </a>
          </>
        )}
      </div>
    </details>
  );
}
