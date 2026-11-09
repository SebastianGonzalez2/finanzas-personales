import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  MovementCategory,
  MovementInput,
  MovementKind,
  MovementTotal,
  RecentMovement,
} from "../domain/movements.ts";
import { listBankBalances } from "./bank-balances.ts";

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

// Stable suggestions from v6.3. They become private catalog rows on first use.
const defaultCategories = (
  Object.entries(defaultNames) as [MovementKind, string[]][]
).flatMap(([kind, names]) =>
  names.map((name): MovementCategory => {
    const hash = createHash("sha256")
      .update(`finanzas:v6.3:${kind}:${name}`)
      .digest("hex");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return { id, kind, name };
  }),
);

type CatalogRow = MovementCategory & { archived: boolean };

export async function isMovementRegistrationReady(
  client: pg.PoolClient,
): Promise<boolean> {
  const {
    rows: [state],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.ordinary_movements') IS NOT NULL AS ready",
  );
  return state.ready;
}

export async function listMovementCategories(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<CatalogRow>(
    `SELECT id, kind, name, archived_at IS NOT NULL AS archived
       FROM finance.categories WHERE owner_id = $1`,
    [ownerId],
  );
  const suggestions = defaultCategories.filter(
    (suggestion) =>
      !rows.some(
        (row) =>
          row.id === suggestion.id ||
          (row.kind === suggestion.kind && row.name === suggestion.name),
      ),
  );
  return [
    ...rows
      .filter((row) => !row.archived)
      .map(({ id, kind, name }) => ({ id, kind, name })),
    ...suggestions,
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

type SaveResult =
  | { status: "created" | "replayed"; id: string }
  | { status: "insufficient-funds"; shortfall: string }
  | { status: "conflict" | "unconfigured" | "invalid-category" };

export async function saveMovement(
  client: pg.PoolClient,
  ownerId: string,
  movement: MovementInput,
): Promise<SaveResult> {
  const {
    idempotencyKey,
    kind,
    currency,
    amount,
    effectiveOn,
    method,
    concept,
    note,
    categoryId,
  } = movement;
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        "ordinary-movement-v1",
        kind,
        currency,
        amount,
        effectiveOn,
        method,
        concept,
        note,
        categoryId,
      ]),
    )
    .digest("hex");

  async function findReplay(): Promise<SaveResult | undefined> {
    const {
      rows: [saved],
    } = await client.query<{ id: string; command_hash: string }>(
      "SELECT id, command_hash FROM finance.financial_events WHERE owner_id = $1 AND idempotency_key = $2",
      [ownerId, idempotencyKey],
    );
    if (saved)
      return saved.command_hash === hash
        ? { status: "replayed", id: saved.id }
        : { status: "conflict" };
  }

  // Serialize bank-backed writes against the same owner's balance and currency.
  // The balance and idempotency lookup below see the preceding commit.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:bank:' || $1::text || ':' || $2::text, 0))",
    [ownerId, currency],
  );
  const replay = await findReplay();
  if (replay) return replay;

  const [balance] = await listBankBalances(client, ownerId, [currency]);
  if (!balance) return { status: "unconfigured" };
  // Dates before the anchor are historical: they cannot spend its balance.
  if (kind === "expense" && effectiveOn >= balance.asOfDate) {
    const {
      rows: [gap],
    } = await client.query<{ shortfall: string }>(
      `SELECT ($2::numeric - greatest($1::numeric, 0))::text AS shortfall
        WHERE $1::numeric < $2::numeric`,
      [balance.calculatedAmount ?? balance.amount, amount],
    );
    if (gap) return { status: "insufficient-funds", shortfall: gap.shortfall };
  }

  const suggestion = defaultCategories.find(
    (category) => category.id === categoryId && category.kind === kind,
  );
  let selectedCategoryId = categoryId;
  if (categoryId) {
    const {
      rows: [existing],
    } = await client.query<CatalogRow>(
      `SELECT id, kind, archived_at IS NOT NULL AS archived
         FROM finance.categories
        WHERE owner_id = $1 AND (id = $2 OR (kind = $3 AND name = $4))
        ORDER BY (id = $2) DESC, archived_at NULLS FIRST, id
        LIMIT 1`,
      [ownerId, categoryId, kind, suggestion?.name ?? null],
    );
    if (existing) {
      if (existing.archived || existing.kind !== kind)
        return { status: "invalid-category" };
      selectedCategoryId = existing.id;
    } else if (!suggestion) {
      return { status: "invalid-category" };
    }
  }

  const id = randomUUID();
  const created = await client.query(
    `INSERT INTO finance.financial_events
       (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())
     ON CONFLICT (owner_id, idempotency_key) DO NOTHING`,
    [
      ownerId,
      id,
      kind,
      concept || "Ingreso",
      effectiveOn,
      idempotencyKey,
      hash,
    ],
  );
  if (!created.rowCount) return (await findReplay()) ?? { status: "conflict" };

  if (suggestion && selectedCategoryId === suggestion.id) {
    await client.query(
      `INSERT INTO finance.categories (owner_id, id, kind, name)
       VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, id) DO NOTHING`,
      [ownerId, suggestion.id, kind, suggestion.name],
    );
  }
  await client.query(
    `INSERT INTO finance.ordinary_movements (owner_id, event_id, category_id, method, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, id, selectedCategoryId, method, note],
  );
  await client.query(
    `INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
     VALUES ($1, $2, $2, $3, $4, $5)`,
    [
      ownerId,
      id,
      currency,
      kind === "expense" ? `-${amount}` : amount,
      effectiveOn,
    ],
  );
  await client.query(
    "INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type) VALUES ($1, $2, $2, 'created')",
    [ownerId, id],
  );
  return { status: "created", id };
}

export async function listMovementTotals(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
) {
  const { rows } = await client.query<MovementTotal>(
    `SELECT f.kind, e.currency, sum(abs(e.amount_signed))::text AS amount
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
      WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.effective_on >= $2::date
        AND f.effective_on < $2::date + interval '1 month'
      GROUP BY f.kind, e.currency`,
    [ownerId, monthStart],
  );
  return rows;
}

export async function listRecentMovements(
  client: pg.PoolClient,
  ownerId: string,
  kind: MovementKind,
) {
  const { rows } = await client.query<RecentMovement>(
    `SELECT f.id, f.kind, f.concept, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            e.currency, abs(e.amount_signed)::text AS amount, m.method, m.note, c.name AS category
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
       LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (m.owner_id, m.category_id)
      WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.kind = $2
      ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC
      LIMIT 5`,
    [ownerId, kind],
  );
  return rows;
}
