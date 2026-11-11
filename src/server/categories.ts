import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  normalizeCategoryName,
  type CatalogCategory,
  type CreateCategoryCommand,
  type CategoryArchiveCommand,
} from "../domain/categories.ts";
import type { MovementKind } from "../domain/movements.ts";

const defaultNames = {
  income: [
    "Sueldo",
    "Negocios",
    "Alquileres cobrados",
    "Intereses y dividendos",
    "Ventas",
    "Reembolsos",
    "Otros ingresos",
  ],
  expense: [
    "Alimentación",
    "Vivienda",
    "Servicios",
    "Transporte",
    "Auto",
    "Salud",
    "Educación",
    "Ropa",
    "Entretenimiento",
    "Viajes",
    "Seguros",
    "Impuestos",
    "Otros gastos",
  ],
} satisfies Record<MovementKind, string[]>;

const defaultChildren: Record<string, string[]> = {
  Alimentación: ["Supermercado", "Restaurantes", "Delivery"],
  Transporte: ["Transporte público", "Taxi/Uber"],
  Vivienda: ["Alquiler", "Mantenimiento"],
  Ropa: ["Ropa", "Calzado"],
};

function defaultId(key: string) {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Preserve the existing v6.3 IDs. Defaults become private rows on first write.
const defaults: CatalogCategory[] = (
  Object.entries(defaultNames) as [MovementKind, string[]][]
).flatMap(([kind, names]) =>
  names.flatMap((name) => {
    const id = defaultId(`finanzas:v6.3:${kind}:${name}`);
    const children = kind === "expense" ? (defaultChildren[name] ?? []) : [];
    return [
      { id, kind, name, parentId: null },
      ...children.map((child) => ({
        id: defaultId(`finanzas:v6.6:${id}:${child}`),
        kind,
        name: child,
        parentId: id,
      })),
    ];
  }),
);

type CatalogEntry = CatalogCategory & { archived: boolean };

function categoryKey({ kind, parentId, name }: CatalogCategory) {
  return JSON.stringify([
    kind,
    parentId,
    normalizeCategoryName(name).toLocaleLowerCase("es"),
  ]);
}

async function readCatalog(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<CatalogEntry>(
    `SELECT id, kind, name, parent_id AS "parentId", archived_at IS NOT NULL AS archived
       FROM finance.categories WHERE owner_id = $1
       ORDER BY archived_at NULLS FIRST, id`,
    [ownerId],
  );
  const entries = new Map(rows.map((entry) => [entry.id, entry]));
  const storedIds = new Set(entries.keys());
  const byName = new Map<string, CatalogEntry>();
  for (const row of rows) {
    const key = categoryKey(row);
    if (!byName.has(key)) byName.set(key, row);
  }

  // A private row with the same name in the same group replaces the suggestion.
  // The alias also resolves submissions from a form opened before that row existed.
  const aliases = new Map<string, CatalogEntry>();
  for (const suggestion of defaults) {
    const parentId = suggestion.parentId
      ? aliases.get(suggestion.parentId)!.id
      : null;
    const entry = { ...suggestion, parentId, archived: false };
    const existing = entries.get(entry.id) ?? byName.get(categoryKey(entry));
    aliases.set(entry.id, existing ?? entry);
    if (!existing) entries.set(entry.id, entry);
  }

  function available(entry: CatalogEntry) {
    const parent = entry.parentId ? entries.get(entry.parentId) : null;
    return (
      !entry.archived &&
      (entry.parentId === null ||
        (parent &&
          !parent.archived &&
          !parent.parentId &&
          parent.kind === entry.kind))
    );
  }

  return {
    entries: [...entries.values()],
    find: (id: string) => entries.get(id) ?? aliases.get(id),
    available,
    async materialize(entry: CatalogEntry) {
      if (storedIds.has(entry.id)) return;
      const parent = entry.parentId ? entries.get(entry.parentId) : null;
      if (parent && !storedIds.has(parent.id))
        await insertCategory(client, ownerId, parent);
      await insertCategory(client, ownerId, entry);
    },
  };
}

async function insertCategory(
  client: pg.PoolClient,
  ownerId: string,
  category: CatalogCategory,
) {
  await client.query(
    `INSERT INTO finance.categories (owner_id, id, parent_id, kind, name)
     VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, category.id, category.parentId, category.kind, category.name],
  );
}

async function lockCatalog(client: pg.PoolClient, ownerId: string) {
  // Serialize selection/materialization with creation and archival until commit.
  // Financial callers acquire their own write locks before reaching this lock.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:categories:' || $1::text, 0))",
    [ownerId],
  );
}

export async function listCatalogCategories(
  client: pg.PoolClient,
  ownerId: string,
): Promise<CatalogCategory[]> {
  const catalog = await readCatalog(client, ownerId);
  return catalog.entries
    .filter(catalog.available)
    .map(({ id, kind, name, parentId }) => ({ id, kind, name, parentId }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function listManagedCategories(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { entries } = await readCatalog(client, ownerId);
  return entries.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type CategorySaveResult =
  | { status: "created"; id: string }
  | { status: "conflict"; message: string }
  | { status: "invalid-parent"; message: string };

export async function createCatalogCategory(
  client: pg.PoolClient,
  ownerId: string,
  command: CreateCategoryCommand,
): Promise<CategorySaveResult> {
  await lockCatalog(client, ownerId);
  const catalog = await readCatalog(client, ownerId);
  const parent = command.parentId ? catalog.find(command.parentId) : undefined;
  if (
    command.parentId &&
    (!parent ||
      !catalog.available(parent) ||
      parent.parentId ||
      parent.kind !== command.kind)
  )
    return {
      status: "invalid-parent",
      message: "Elegí una categoría superior activa del mismo tipo.",
    };

  const entry = { ...command, id: randomUUID(), parentId: parent?.id ?? null };
  const key = categoryKey(entry);
  if (catalog.entries.some((existing) => categoryKey(existing) === key))
    return {
      status: "conflict",
      message: "Ya existe una categoría con ese nombre en este grupo.",
    };

  if (parent) await catalog.materialize(parent);
  await insertCategory(client, ownerId, entry);
  return { status: "created", id: entry.id };
}

export async function resolveMovementCategory(
  client: pg.PoolClient,
  ownerId: string,
  kind: MovementKind,
  categoryId: string | null,
) {
  if (!categoryId) return null;
  await lockCatalog(client, ownerId);
  const catalog = await readCatalog(client, ownerId);
  const entry = catalog.find(categoryId);
  if (!entry || entry.kind !== kind || !catalog.available(entry))
    return undefined;
  await catalog.materialize(entry);
  return entry.id;
}

export async function setCategoryArchived(
  client: pg.PoolClient,
  ownerId: string,
  { id, archived }: CategoryArchiveCommand,
) {
  await lockCatalog(client, ownerId);
  const catalog = await readCatalog(client, ownerId);
  const entry = catalog.find(id);
  if (!entry) return "not-found";
  if (entry.archived === archived) return "saved";

  if (!archived && entry.parentId) {
    const parent = catalog.find(entry.parentId);
    if (!parent || !catalog.available(parent)) return "archived-parent";
  }
  await catalog.materialize(entry);
  await client.query(
    `UPDATE finance.categories
        SET archived_at = CASE WHEN $3 THEN clock_timestamp() END
      WHERE owner_id = $1 AND id = $2`,
    [ownerId, entry.id, archived],
  );
  return "saved";
}
