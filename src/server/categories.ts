import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { MovementKind } from "../domain/movements.ts";
import type {
  CatalogCategory,
  CreateCategoryCommand,
} from "../domain/categories.ts";
import { defaultCategories } from "./movements.ts";

type CatalogRow = {
  id: string;
  kind: MovementKind;
  name: string;
  parent_id: string | null;
  archived: boolean;
};

// Catálogo activo del titular + sugerencias estables de v6.3 que aún no son filas.
export async function listCatalogCategories(
  client: pg.PoolClient,
  ownerId: string,
): Promise<CatalogCategory[]> {
  const { rows } = await client.query<CatalogRow>(
    `SELECT id, kind, name, parent_id, archived_at IS NOT NULL AS archived
       FROM finance.categories WHERE owner_id = $1`,
    [ownerId],
  );
  const active = rows.filter(({ archived }) => !archived);
  const suggestions = defaultCategories.filter(
    (suggestion) =>
      !rows.some(
        (row) =>
          row.id === suggestion.id ||
          (row.kind === suggestion.kind && row.name === suggestion.name),
      ),
  );
  return [
    ...active.map(({ id, kind, name, parent_id }) => ({
      id,
      kind,
      name,
      parentId: parent_id,
    })),
    ...suggestions.map(({ id, kind, name }) => ({
      id,
      kind,
      name,
      parentId: null,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type CategorySaveResult =
  | { status: "created"; id: string }
  | { status: "conflict"; message: string }
  | { status: "invalid-parent"; message: string };

// Creación desde formularios (RF-039, CA-051). El titular lo fija el servidor
// de sesión; el archivo y las referencias históricas se gestionan aparte.
export async function createCatalogCategory(
  client: pg.PoolClient,
  ownerId: string,
  command: CreateCategoryCommand,
): Promise<CategorySaveResult> {
  // Serializa creaciones simultáneas del mismo titular: la unicidad por
  // nombre no está garantizada por la base y se verifica en la transacción.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:categories:' || $1::text, 0))",
    [ownerId],
  );
  const {
    rows: [duplicate],
  } = await client.query<{ id: string }>(
    `SELECT id FROM finance.categories
      WHERE owner_id = $1 AND kind = $2 AND lower(btrim(name)) = lower($3)
      ORDER BY archived_at NULLS FIRST, id
      LIMIT 1`,
    [ownerId, command.kind, command.name],
  );
  if (duplicate)
    return {
      status: "conflict",
      message: "Ya existe una categoría con ese nombre en tu catálogo.",
    };

  if (command.parentId) {
    const {
      rows: [parent],
    } = await client.query<{
      parent_id: string | null;
      kind: MovementKind;
      archived: boolean;
    }>(
      `SELECT parent_id, kind, archived_at IS NOT NULL AS archived
         FROM finance.categories WHERE owner_id = $1 AND id = $2`,
      [ownerId, command.parentId],
    );
    if (!parent || parent.archived)
      return {
        status: "invalid-parent",
        message: "La categoría superior no está disponible.",
      };
    if (parent.kind !== command.kind)
      return {
        status: "invalid-parent",
        message:
          "La subcategoría debe ser del mismo tipo que la categoría superior.",
      };
    if (parent.parent_id)
      return {
        status: "invalid-parent",
        message: "Solo se permiten dos niveles: categoría y subcategoría.",
      };
  }

  const id = randomUUID();
  await client.query(
    `INSERT INTO finance.categories (owner_id, id, parent_id, kind, name)
     VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, id, command.parentId, command.kind, command.name],
  );
  return { status: "created", id };
}
