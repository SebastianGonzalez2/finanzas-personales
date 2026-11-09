import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  MovementCategory,
  MovementInput,
  MovementKind,
  MovementRevision,
  MovementTotal,
  RecentMovement,
} from "../domain/movements.ts";
import type { Currency } from "../domain/money.ts";
import { listBankBalances, lockBankWrites } from "./bank-balances.ts";

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

export async function movementAvailability(client: pg.PoolClient) {
  const {
    rows: [state],
  } = await client.query<{ readable: boolean; writable: boolean }>(
    `SELECT to_regclass('finance.ordinary_movements') IS NOT NULL AS readable,
            to_regclass('finance.audit_void_command_key') IS NOT NULL AS writable`,
  );
  return state;
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

type Replay = { status: "replayed"; id: string } | { status: "conflict" };
type Shortfall = {
  status: "insufficient-funds";
  shortfall: string;
  currency: Currency;
};
type SaveResult =
  | Replay
  | Omit<Shortfall, "currency">
  | { status: "created"; id: string }
  | { status: "unconfigured" | "invalid-category" };

function commandHash(fields: readonly (string | null)[]) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

async function findReplay(
  client: pg.PoolClient,
  ownerId: string,
  key: string,
  hash: string,
): Promise<Replay | undefined> {
  const {
    rows: [saved],
  } = await client.query<{ id: string; command_hash: string }>(
    `SELECT id, command_hash FROM finance.financial_events
      WHERE owner_id = $1 AND idempotency_key = $2
     UNION ALL
     SELECT event_id AS id, command_hash FROM finance.audit_changes
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, key],
  );
  if (saved)
    return saved.command_hash === hash
      ? { status: "replayed", id: saved.id }
      : { status: "conflict" };
}

function signedAmount(kind: MovementKind, amount: string) {
  return kind === "expense" ? `-${amount}` : amount;
}

async function bankShortfall(
  client: pg.PoolClient,
  currency: Currency,
  available: string,
  before: string,
  after: string,
): Promise<Shortfall | undefined> {
  const {
    rows: [gap],
  } = await client.query<{ shortfall: string }>(
    `SELECT ($2::numeric - $3::numeric - greatest($1::numeric, 0))::text AS shortfall
      WHERE $2::numeric - $3::numeric > greatest($1::numeric, 0)`,
    [available, before, after],
  );
  if (gap)
    return { status: "insufficient-funds", shortfall: gap.shortfall, currency };
}

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
    concept,
    note,
    categoryId,
  } = movement;
  // Preserve the hash of commands already recorded by F1-03.
  const hash = commandHash([
    "ordinary-movement-v1",
    kind,
    currency,
    amount,
    effectiveOn,
    movement.method,
    concept,
    note,
    categoryId,
  ]);

  await lockBankWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;

  const [balance] = await listBankBalances(client, ownerId, [currency]);
  if (!balance) return { status: "unconfigured" };
  // Dates before the anchor are historical: they cannot spend its balance.
  if (kind === "expense" && effectiveOn >= balance.asOfDate) {
    const gap = await bankShortfall(
      client,
      currency,
      balance.calculatedAmount ?? balance.amount,
      "0",
      signedAmount(kind, amount),
    );
    if (gap) return { status: gap.status, shortfall: gap.shortfall };
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

  if (suggestion && selectedCategoryId === suggestion.id) {
    await client.query(
      `INSERT INTO finance.categories (owner_id, id, kind, name)
       VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, id) DO NOTHING`,
      [ownerId, suggestion.id, kind, suggestion.name],
    );
  }
  const id = await insertMovement(
    client,
    ownerId,
    {
      ...movement,
      categoryId: selectedCategoryId,
    },
    hash,
  );
  return { status: "created", id };
}

async function insertMovement(
  client: pg.PoolClient,
  ownerId: string,
  movement: MovementInput,
  hash: string,
) {
  const {
    kind,
    concept,
    effectiveOn,
    idempotencyKey,
    categoryId,
    method,
    note,
    currency,
    amount,
  } = movement;
  const id = randomUUID();
  await client.query(
    `INSERT INTO finance.financial_events
       (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
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
  await client.query(
    `INSERT INTO finance.ordinary_movements (owner_id, event_id, category_id, method, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, id, categoryId, method, note],
  );
  await client.query(
    `INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
     VALUES ($1, $2, $2, $3, $4, $5)`,
    [ownerId, id, currency, signedAmount(kind, amount), effectiveOn],
  );
  await client.query(
    "INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type) VALUES ($1, $2, $2, 'created')",
    [ownerId, id],
  );
  return id;
}

type RevisionResult =
  | Replay
  | Shortfall
  | { status: "revised"; id: string }
  | { status: "not-found" | "inactive" | "checkpoint" | "unconfigured" };

export async function reviseMovement(
  client: pg.PoolClient,
  ownerId: string,
  command: MovementRevision,
): Promise<RevisionResult> {
  const { action, eventId, idempotencyKey } = command;
  const amount = action === "correct" ? command.amount : null;
  const hash = commandHash(["movement-revision-v1", action, eventId, amount]);
  await lockBankWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;

  const {
    rows: [original],
  } = await client.query<
    Omit<MovementInput, "idempotencyKey" | "amount"> & {
      status: string;
      signed: string;
      covered: boolean;
    }
  >(
    `SELECT f.kind, f.concept, f.status, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            m.category_id AS "categoryId", m.method, m.note, e.currency, e.amount_signed::text AS signed,
            EXISTS (
              SELECT 1 FROM finance.balance_checkpoints b
               WHERE b.owner_id = f.owner_id AND b.currency = e.currency
                 AND b.as_of_date >= e.effective_on AND b.created_at >= f.created_at
            ) AS covered
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
      WHERE f.owner_id = $1 AND f.id = $2 AND f.kind IN ('income', 'expense')`,
    [ownerId, eventId],
  );
  if (!original) return { status: "not-found" };
  if (original.status !== "confirmed") return { status: "inactive" };
  if (original.covered) return { status: "checkpoint" };

  const { currency, kind, effectiveOn } = original;
  const [balance] = await listBankBalances(client, ownerId, [currency]);
  if (!balance) return { status: "unconfigured" };
  if (effectiveOn >= balance.asOfDate) {
    const gap = await bankShortfall(
      client,
      currency,
      balance.calculatedAmount ?? balance.amount,
      original.signed,
      amount === null ? "0" : signedAmount(kind, amount),
    );
    if (gap) return gap;
  }

  const replacement =
    amount === null
      ? null
      : await insertMovement(
          client,
          ownerId,
          { ...original, amount, idempotencyKey },
          hash,
        );
  const state = replacement === null ? "voided" : "corrected";
  await client.query(
    `INSERT INTO finance.audit_changes
       (owner_id, id, event_id, change_type, replacement_event_id, idempotency_key, command_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ownerId,
      randomUUID(),
      eventId,
      state,
      replacement,
      replacement === null ? idempotencyKey : null,
      replacement === null ? hash : null,
    ],
  );
  const changed = await client.query(
    `UPDATE finance.financial_events SET status = $3
      WHERE owner_id = $1 AND id = $2 AND status = 'confirmed'`,
    [ownerId, eventId, state],
  );
  if (changed.rowCount !== 1) throw new Error("Revisión no confirmada");
  return { status: "revised", id: replacement ?? eventId };
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
