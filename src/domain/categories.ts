import { movementUuid, type MovementKind } from "./movements.ts";

// RF-039: catálogo por titular de categorías y subcategorías.
// La base limita el nombre a btrim entre 1 y 100 (migración 0001_F0-05).
export const categoryNameLimit = 100;

export const categoryKinds = ["income", "expense"] as const;

export type CatalogCategory = {
  id: string;
  kind: MovementKind;
  name: string;
  parentId: string | null;
};

export type CreateCategoryCommand = {
  kind: MovementKind;
  name: string;
  parentId: string | null;
};

export type CategoryArchiveCommand = { id: string; archived: boolean };

export function parseCategoryArchiveCommand(
  input: unknown,
): { error: string } | CategoryArchiveCommand {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).length !== 2 ||
    !("id" in input) ||
    typeof input.id !== "string" ||
    !movementUuid.test(input.id) ||
    !("archived" in input) ||
    typeof input.archived !== "boolean"
  )
    return { error: "Datos de archivo inválidos." };
  return { id: input.id.toLowerCase(), archived: input.archived };
}

export function normalizeCategoryName(name: string) {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

const inputKeys = ["kind", "name", "parentId"];

export function parseCreateCategoryCommand(
  input: unknown,
): { error: string } | CreateCategoryCommand {
  let data: Record<string, unknown>;
  try {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !inputKeys.includes(key))
    )
      throw new Error();
    data = input as Record<string, unknown>;
  } catch {
    return { error: "Datos de categoría inválidos." };
  }
  const kind = categoryKinds.find((item) => item === data.kind);
  if (!kind) return { error: "Elegí si la categoría es de ingreso o gasto." };
  if (typeof data.name !== "string")
    return { error: "Ingresá el nombre de la categoría." };
  const name = normalizeCategoryName(data.name);
  if (name.includes("\0"))
    return { error: "El nombre contiene un carácter inválido." };
  if (name.length < 1 || name.length > categoryNameLimit)
    return {
      error: `El nombre debe tener entre 1 y ${categoryNameLimit} caracteres.`,
    };
  let parentId: string | null = null;
  if (
    data.parentId !== null &&
    data.parentId !== undefined &&
    data.parentId !== ""
  ) {
    if (typeof data.parentId !== "string" || !movementUuid.test(data.parentId))
      return { error: "La categoría superior no es válida." };
    parentId = data.parentId.toLowerCase();
  }
  return { kind, name, parentId };
}

// El catálogo se muestra a dos niveles: categoría y subcategorías directas.
export function groupCatalogCategories<T extends CatalogCategory>(
  categories: T[],
) {
  const tops = categories.filter(({ parentId }) => parentId === null);
  const childrenOf = (id: string) =>
    categories.filter(({ parentId }) => parentId === id);
  return { tops, childrenOf };
}
