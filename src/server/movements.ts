import "server-only";
import { hasLinkedRefund } from "./refund-schema.ts";
import {
  isSharedExpense,
  sharedExpensesReady,
} from "./shared-expense-schema.ts";
import { mixedPurchasesReady } from "./mixed-purchases.ts";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  BankTransfer,
  MovementCategory,
  MovementInput,
  MovementKind,
  MovementRevision,
  MovementTotal,
  RecentBankTransfer,
  RecentMovement,
} from "../domain/movements.ts";
import type { Currency } from "../domain/money.ts";
import {
  coverageDecimal,
  coverageSum,
  coverageUnits,
} from "../domain/fund-coverage.ts";
import {
  applyFundDeltas,
  listEventFundUses,
  planFundExpense,
  recordEventFundUses,
} from "./fund-coverage.ts";
import {
  bankEventPosition,
  bankEventSource,
  bankReconciliationReady,
  listBankAvailability,
  lockBankWrites,
} from "./bank-balances.ts";

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
export const defaultCategories = (
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
  } = await client.query<{
    readable: boolean;
    writable: boolean;
    transfers: boolean;
  }>(
    `SELECT to_regclass('finance.ordinary_movements') IS NOT NULL AS readable,
            to_regclass('finance.audit_void_command_key') IS NOT NULL AS writable,
            to_regclass('finance.recent_bank_transfers') IS NOT NULL AS transfers`,
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
  | { status: "unconfigured" | "invalid-category" }
  | { status: "invalid-coverage"; message: string };

export function commandHash(fields: readonly (string | null)[]) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export async function findReplay(
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

type TransferResult =
  | Replay
  | Shortfall
  | { status: "created"; id: string }
  | { status: "unconfigured"; currency: Currency }
  | { status: "unavailable" };

export async function saveBankTransfer(
  client: pg.PoolClient,
  ownerId: string,
  transfer: BankTransfer,
): Promise<TransferResult> {
  const {
    sourceCurrency,
    sourceAmount,
    destinationCurrency,
    destinationAmount,
    effectiveOn,
    idempotencyKey,
  } = transfer;
  const hash = commandHash([
    "bank-transfer-v1",
    sourceCurrency,
    sourceAmount,
    destinationCurrency,
    destinationAmount,
    effectiveOn,
  ]);
  await lockBankWrites(client, ownerId);
  if (!(await movementAvailability(client)).transfers)
    return { status: "unavailable" };
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;
  const [source, destination] = await listBankAvailability(
    client,
    ownerId,
    [sourceCurrency, destinationCurrency],
    true,
  );
  if (source?.currency !== sourceCurrency)
    return { status: "unconfigured", currency: sourceCurrency };
  if (!destination)
    return { status: "unconfigured", currency: destinationCurrency };
  if (effectiveOn >= source.asOfDate) {
    const gap = await bankShortfall(
      client,
      sourceCurrency,
      source.availableAmount,
      "0",
      `-${sourceAmount}`,
    );
    if (gap) return gap;
  }

  return {
    status: "created",
    id: await insertBankTransfer(client, ownerId, transfer, hash),
  };
}

async function insertBankTransfer(
  client: pg.PoolClient,
  ownerId: string,
  {
    sourceCurrency,
    sourceAmount,
    destinationCurrency,
    destinationAmount,
    effectiveOn,
    idempotencyKey,
  }: BankTransfer,
  hash: string,
) {
  const id = randomUUID();
  await client.query(
    `WITH saved AS (
       INSERT INTO finance.financial_events
         (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
       VALUES ($1, $2, 'bank_transfer', 'Cambio de moneda', $3, $4, $5, clock_timestamp())
       RETURNING owner_id, id, effective_on
     ), effects AS (
       INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
       SELECT saved.owner_id, effect.id, saved.id, effect.currency, effect.amount, saved.effective_on
         FROM saved
         CROSS JOIN (VALUES
           ($2::uuid, $6::finance.currency, -$7::numeric),
           ($8::uuid, $9::finance.currency, $10::numeric)
         ) AS effect(id, currency, amount)
     )
     INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type)
     SELECT owner_id, id, id, 'created' FROM saved`,
    [
      ownerId,
      id,
      effectiveOn,
      idempotencyKey,
      hash,
      sourceCurrency,
      sourceAmount,
      randomUUID(),
      destinationCurrency,
      destinationAmount,
    ],
  );
  return id;
}

export async function listRecentBankTransfers(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<RecentBankTransfer>(
    `SELECT f.id, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            debit.currency AS "sourceCurrency", abs(debit.amount_signed)::text AS "sourceAmount",
            credit.currency AS "destinationCurrency", credit.amount_signed::text AS "destinationAmount"
       FROM finance.financial_events f
       JOIN finance.bank_effects debit
         ON (debit.owner_id, debit.event_id, debit.id) = (f.owner_id, f.id, f.id)
       JOIN finance.bank_effects credit
         ON (credit.owner_id, credit.event_id) = (f.owner_id, f.id) AND credit.amount_signed > 0
      WHERE f.owner_id = $1 AND f.kind = 'bank_transfer' AND f.status = 'confirmed'
      ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC
      LIMIT 5`,
    [ownerId],
  );
  return rows;
}

export async function saveMovement(
  client: pg.PoolClient,
  ownerId: string,
  movement: MovementInput,
  linkedCommandHash?: string,
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
  const hash =
    linkedCommandHash ??
    commandHash([
      "ordinary-movement-v1",
      kind,
      currency,
      amount,
      effectiveOn,
      movement.method,
      concept,
      note,
      categoryId,
      ...(movement.fundPortions?.length
        ? [JSON.stringify(movement.fundPortions)]
        : []),
    ]);

  await lockBankWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;

  const [balance] = await listBankAvailability(client, ownerId, [currency]);
  if (!balance) return { status: "unconfigured" };
  const portions = movement.fundPortions ?? [];
  const coverage = await planFundExpense(
    client,
    ownerId,
    currency,
    amount,
    portions,
  );
  if ("error" in coverage)
    return { status: "invalid-coverage", message: coverage.error };
  // Dates before the anchor are historical: they cannot spend its balance.
  if (kind === "expense" && effectiveOn >= balance.asOfDate) {
    const gap = await bankShortfall(
      client,
      currency,
      balance.availableAmount,
      "0",
      coverageDecimal(coverageSum(portions) - coverageUnits(amount)),
    );
    if (gap) return { status: gap.status, shortfall: gap.shortfall };
    if (portions.length) {
      const bankGap = await bankShortfall(
        client,
        currency,
        balance.calculatedAmount ?? balance.amount,
        "0",
        signedAmount(kind, amount),
      );
      if (bankGap)
        return { status: bankGap.status, shortfall: bankGap.shortfall };
    }
  }

  const selectedCategoryId = await resolveMovementCategory(
    client,
    ownerId,
    kind,
    categoryId,
  );
  if (selectedCategoryId === undefined) return { status: "invalid-category" };
  const id = await insertMovement(
    client,
    ownerId,
    { ...movement, categoryId: selectedCategoryId },
    hash,
  );
  await applyFundDeltas(client, ownerId, coverage.deltas);
  return { status: "created", id };
}

export async function resolveMovementCategory(
  client: pg.PoolClient,
  ownerId: string,
  kind: MovementKind,
  categoryId: string | null,
) {
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
      if (existing.archived || existing.kind !== kind) return undefined;
      selectedCategoryId = existing.id;
    } else if (!suggestion) {
      return undefined;
    }
  }

  if (suggestion && selectedCategoryId === suggestion.id) {
    await client.query(
      `INSERT INTO finance.categories (owner_id, id, kind, name)
       VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, id) DO NOTHING`,
      [ownerId, suggestion.id, kind, suggestion.name],
    );
  }
  return selectedCategoryId;
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
  await recordEventFundUses(
    client,
    ownerId,
    id,
    currency,
    movement.fundPortions ?? [],
    "expense",
  );
  return id;
}

type RevisionResult =
  | Replay
  | { status: "invalid-coverage"; message: string }
  | Shortfall
  | { status: "revised"; id: string }
  | {
      status:
        | "not-found"
        | "inactive"
        | "checkpoint"
        | "unconfigured"
        | "invalid-category"
        | "invalid-kind"
        | "unavailable";
    };

export async function reviseMovement(
  client: pg.PoolClient,
  ownerId: string,
  command: MovementRevision,
): Promise<RevisionResult> {
  const { action, eventId, idempotencyKey } = command;
  if (action === "edit") return editMovement(client, ownerId, command);
  const amount = action === "correct" ? command.amount : null;
  const hash = commandHash(["movement-revision-v1", action, eventId, amount]);
  await lockBankWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;
  if (await hasLinkedRefund(client, ownerId, eventId))
    return { status: "unavailable" };
  if (await isSharedExpense(client, ownerId, eventId))
    return { status: "unavailable" };
  const reconciliationReady = await bankReconciliationReady(client);

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
                 AND ${
                   reconciliationReady
                     ? `(b.as_of_date, b.created_at) >= ${bankEventPosition(true)}`
                     : "b.as_of_date >= e.effective_on AND b.created_at >= f.created_at"
                 }
            ) AS covered
       FROM ${bankEventSource(reconciliationReady)} f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
      WHERE f.owner_id = $1 AND f.id = $2 AND f.kind IN ('income', 'expense')`,
    [ownerId, eventId],
  );
  if (!original) {
    if (
      action === "void" &&
      reconciliationReady &&
      (await movementAvailability(client)).transfers
    )
      return voidBankTransfer(client, ownerId, command, hash);
    return { status: "not-found" };
  }
  if (original.status !== "confirmed") return { status: "inactive" };
  if (original.covered && !reconciliationReady) return { status: "checkpoint" };

  const { currency, kind, effectiveOn } = original;
  const [balance] = await listBankAvailability(
    client,
    ownerId,
    [currency],
    reconciliationReady,
  );
  if (!balance) return { status: "unconfigured" };
  const prior = await listEventFundUses(client, ownerId, eventId);
  const portions = amount === null ? [] : prior;
  const coverage = await planFundExpense(
    client,
    ownerId,
    currency,
    amount ?? "0",
    portions,
    prior,
  );
  if ("error" in coverage)
    return {
      status: "invalid-coverage",
      message:
        amount !== null && coverageSum(portions) > coverageUnits(amount)
          ? "El nuevo importe es menor que lo cubierto por fondos. Usá Editar para revisar la distribución."
          : coverage.error,
    };
  const applies = !original.covered && effectiveOn >= balance.asOfDate;
  const after = amount === null ? "0" : signedAmount(kind, amount);
  if (applies || prior.length) {
    const gap = await bankShortfall(
      client,
      currency,
      balance.availableAmount,
      coverageDecimal(
        coverageUnits(applies ? original.signed : "0") + coverageSum(prior),
      ),
      coverageDecimal(
        coverageUnits(applies ? after : "0") + coverageSum(portions),
      ),
    );
    if (gap) return gap;
    if (applies && prior.length) {
      const bankGap = await bankShortfall(
        client,
        currency,
        balance.calculatedAmount ?? balance.amount,
        original.signed,
        after,
      );
      if (bankGap) return bankGap;
    }
  }

  const replacement =
    amount === null
      ? null
      : await insertMovement(
          client,
          ownerId,
          { ...original, amount, idempotencyKey, fundPortions: portions },
          hash,
        );
  await applyFundDeltas(client, ownerId, coverage.deltas);
  return recordRevision(client, ownerId, command, hash, replacement);
}

export async function historyReady(client: pg.PoolClient) {
  const {
    rows: [state],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.financial_events_history') IS NOT NULL AS ready",
  );
  return state.ready;
}

async function editMovement(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<MovementRevision, { action: "edit" }>,
): Promise<RevisionResult> {
  const { eventId, idempotencyKey, movement } = command;
  const transfer = movement.kind === "bank_transfer";
  const fields = transfer
    ? [
        movement.sourceCurrency,
        movement.sourceAmount,
        movement.destinationCurrency,
        movement.destinationAmount,
      ]
    : [
        movement.currency,
        movement.amount,
        movement.method,
        movement.concept,
        movement.note,
        movement.categoryId,
        ...(movement.fundPortions !== undefined
          ? [JSON.stringify(movement.fundPortions)]
          : []),
      ];
  const hash = commandHash([
    "movement-edit-v1",
    eventId,
    movement.kind,
    movement.effectiveOn,
    ...fields,
  ]);
  await lockBankWrites(client, ownerId);
  if (!(await historyReady(client))) return { status: "unavailable" };
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;
  if (await hasLinkedRefund(client, ownerId, eventId))
    return { status: "unavailable" };
  if (await isSharedExpense(client, ownerId, eventId))
    return { status: "unavailable" };

  const {
    rows: [original],
  } = await client.query<{
    kind: string;
    status: string;
    categoryId: string | null;
    recordedAt: string;
    effectiveOn: string;
  }>(
    `SELECT f.kind, f.status, m.category_id AS "categoryId",
            f.bank_recorded_at::text AS "recordedAt", f.effective_on::text AS "effectiveOn"
       FROM finance.bank_event_positions f
       LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
      WHERE f.owner_id = $1 AND f.id = $2
        AND (m.event_id IS NOT NULL OR f.kind = 'bank_transfer')`,
    [ownerId, eventId],
  );
  if (!original) return { status: "not-found" };
  if (original.status !== "confirmed") return { status: "inactive" };
  if (original.kind !== movement.kind) return { status: "invalid-kind" };

  const newEffects: { currency: Currency; signed: string }[] = transfer
    ? [
        {
          currency: movement.sourceCurrency,
          signed: `-${movement.sourceAmount}`,
        },
        {
          currency: movement.destinationCurrency,
          signed: movement.destinationAmount,
        },
      ]
    : [
        {
          currency: movement.currency,
          signed: signedAmount(movement.kind, movement.amount),
        },
      ];
  const { rows: effects } = await client.query<{
    currency: Currency;
    before: string;
    after: string;
  }>(
    `WITH replacement AS (
       SELECT * FROM unnest($6::finance.currency[], $7::numeric[]) AS e(currency, amount_signed)
     ), original AS (
       SELECT currency, amount_signed FROM finance.bank_effects WHERE owner_id = $1 AND event_id = $2
     )
     SELECT coalesce(o.currency, r.currency) AS currency,
            CASE WHEN ($3::date, $5::timestamptz) > (b.as_of_date, b.created_at)
                 THEN coalesce(o.amount_signed, 0)::text ELSE '0' END AS before,
            CASE WHEN ($4::date, $5::timestamptz) > (b.as_of_date, b.created_at)
                 THEN coalesce(r.amount_signed, 0)::text ELSE '0' END AS after
       FROM original o FULL JOIN replacement r USING (currency)
       LEFT JOIN LATERAL (
         SELECT as_of_date, created_at FROM finance.balance_checkpoints
          WHERE owner_id = $1 AND currency = coalesce(o.currency, r.currency)
          ORDER BY as_of_date DESC, created_at DESC, id DESC LIMIT 1
       ) b ON true`,
    [
      ownerId,
      eventId,
      original.effectiveOn,
      movement.effectiveOn,
      original.recordedAt,
      newEffects.map(({ currency }) => currency),
      newEffects.map(({ signed }) => signed),
    ],
  );
  const prior = transfer
    ? []
    : await listEventFundUses(client, ownerId, eventId);
  const portions = transfer ? [] : (movement.fundPortions ?? prior);
  const coverage = transfer
    ? { deltas: [] }
    : await planFundExpense(
        client,
        ownerId,
        movement.currency,
        movement.amount,
        portions,
        prior,
      );
  if ("error" in coverage)
    return { status: "invalid-coverage", message: coverage.error };
  const balances = await listBankAvailability(
    client,
    ownerId,
    effects.map(({ currency }) => currency),
    true,
  );
  for (const { currency, before, after } of effects) {
    const balance = balances.find((entry) => entry.currency === currency);
    if (!balance) return { status: "unconfigured" };
    const gap = await bankShortfall(
      client,
      currency,
      balance.availableAmount,
      coverageDecimal(
        coverageUnits(before) +
          coverageSum(prior.filter((part) => part.currency === currency)),
      ),
      coverageDecimal(
        coverageUnits(after) +
          (!transfer && movement.currency === currency
            ? coverageSum(portions)
            : BigInt(0)),
      ),
    );
    if (gap) return gap;
    if (
      prior.some((part) => part.currency === currency) ||
      (!transfer && movement.currency === currency && portions.length)
    ) {
      const bankGap = await bankShortfall(
        client,
        currency,
        balance.calculatedAmount ?? balance.amount,
        before,
        after,
      );
      if (bankGap) return bankGap;
    }
  }

  let replacement: string;
  if (transfer) {
    replacement = await insertBankTransfer(
      client,
      ownerId,
      { ...movement, idempotencyKey },
      hash,
    );
  } else {
    const categoryId =
      movement.categoryId === original.categoryId
        ? original.categoryId
        : await resolveMovementCategory(
            client,
            ownerId,
            movement.kind,
            movement.categoryId,
          );
    if (categoryId === undefined) return { status: "invalid-category" };
    replacement = await insertMovement(
      client,
      ownerId,
      { ...movement, idempotencyKey, categoryId, fundPortions: portions },
      hash,
    );
  }
  await applyFundDeltas(client, ownerId, coverage.deltas);
  return recordRevision(client, ownerId, command, hash, replacement);
}

async function voidBankTransfer(
  client: pg.PoolClient,
  ownerId: string,
  command: MovementRevision,
  hash: string,
): Promise<RevisionResult> {
  const {
    rows: [credit],
  } = await client.query<{
    status: string;
    currency: Currency;
    signed: string;
    covered: boolean;
  }>(
    `SELECT f.status, e.currency, e.amount_signed::text AS signed,
            EXISTS (
              SELECT 1 FROM finance.balance_checkpoints b
               WHERE b.owner_id = f.owner_id AND b.currency = e.currency
                 AND (b.as_of_date, b.created_at) >= ${bankEventPosition(true)}
            ) AS covered
       FROM ${bankEventSource(true)} f
       JOIN finance.bank_effects e ON (e.owner_id, e.event_id) = (f.owner_id, f.id)
      WHERE f.owner_id = $1 AND f.id = $2 AND f.kind = 'bank_transfer' AND e.amount_signed > 0`,
    [ownerId, command.eventId],
  );
  if (!credit) return { status: "not-found" };
  if (credit.status !== "confirmed") return { status: "inactive" };
  // Covered effects change the checkpoint's reconciliation while preserving the anchor.
  // Only removing an uncovered credit can reduce a current bank balance.
  if (!credit.covered) {
    const [balance] = await listBankAvailability(
      client,
      ownerId,
      [credit.currency],
      true,
    );
    if (!balance) return { status: "unconfigured" };
    const gap = await bankShortfall(
      client,
      credit.currency,
      balance.availableAmount,
      credit.signed,
      "0",
    );
    if (gap) return gap;
  }
  return recordRevision(client, ownerId, command, hash, null);
}

export async function recordRevision(
  client: pg.PoolClient,
  ownerId: string,
  {
    eventId,
    idempotencyKey,
  }: Pick<MovementRevision, "eventId" | "idempotencyKey">,
  hash: string,
  replacement: string | null,
) {
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
  return { status: "revised", id: replacement ?? eventId } as const;
}

export async function creditOperationsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.credit_expenses') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function loansReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.loan_operations') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function listMovementTotals(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
) {
  const credit = await creditOperationsReady(client);
  const mixed = credit && (await mixedPurchasesReady(client));
  const loans = await loansReady(client);
  const shared = loans && (await sharedExpensesReady(client));
  const { rows } = await client.query<MovementTotal>(
    `SELECT kind, currency, sum(amount)::text AS amount FROM (
       SELECT f.kind, e.currency, abs(e.amount_signed) AS amount
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
      WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.effective_on >= $2::date
        AND f.effective_on < $2::date + interval '1 month'
      ${
        shared
          ? `AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
        UNION ALL
        SELECT 'expense', s.currency, s.own_amount FROM finance.shared_expenses s
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
        WHERE s.owner_id = $1 AND s.method <> 'credit' AND s.own_amount > 0 AND f.status = 'confirmed'
          AND f.effective_on >= $2::date AND f.effective_on < $2::date + interval '1 month'`
          : ""
      }
      ${
        credit
          ? `UNION ALL
        SELECT 'expense', x.currency, x.amount FROM finance.${shared ? "credit_consumption" : "credit_expenses"} x
         WHERE x.owner_id = $1 ${shared ? "AND x.amount > 0" : ""} AND x.effective_on >= $2::date
           AND x.effective_on < $2::date + interval '1 month'
           ${
             mixed
               ? `AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
             WHERE (m.owner_id, m.event_id) = (x.owner_id, x.id))
           UNION ALL
           SELECT 'expense', currency, amount FROM finance.mixed_purchase_expenses
            WHERE owner_id = $1 AND effective_on >= $2::date AND effective_on < $2::date + interval '1 month'`
               : ""
           }`
          : ""
      }
      ${
        loans
          ? `UNION ALL
        SELECT 'expense', o.currency, o.expense FROM finance.loan_operations o
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
        WHERE o.owner_id = $1 AND o.expense > 0 AND f.status = 'confirmed'
          AND f.effective_on >= $2::date AND f.effective_on < $2::date + interval '1 month'`
          : ""
      }
      ) amounts GROUP BY kind, currency`,
    [ownerId, monthStart],
  );
  return rows;
}

export async function listRecentMovements(
  client: pg.PoolClient,
  ownerId: string,
  kind: MovementKind,
  installmentsReady = false,
) {
  const credit = kind === "expense" && (await creditOperationsReady(client));
  const mixed = credit && (await mixedPurchasesReady(client));
  const shared = kind === "expense" && (await sharedExpensesReady(client));
  const { rows } = await client.query<RecentMovement>(
    `SELECT id, kind, concept, to_char(effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            currency, amount, method, note, category
            ${shared ? ", EXISTS (SELECT 1 FROM finance.shared_expenses s WHERE s.owner_id = $1 AND s.event_id = recent.id) AS shared" : ""} FROM (
      SELECT f.id, f.kind, f.concept, f.effective_on, f.created_at,
            e.currency, abs(e.amount_signed)::text AS amount, m.method, m.note, c.name AS category
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
       LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (m.owner_id, m.category_id)
      WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.kind = $2
      ${
        shared
          ? `AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
        UNION ALL
        SELECT f.id, 'expense', s.concept, f.effective_on, f.created_at,
               s.currency, s.own_amount::text, s.method, s.note, c.name
          FROM finance.current_shared_expenses s
          JOIN finance.financial_events f ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
          LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (s.owner_id, s.category_id)
         WHERE s.owner_id = $1 AND s.method <> 'credit' AND s.own_amount > 0 AND f.status = 'confirmed'`
          : ""
      }
      ${
        credit
          ? `UNION ALL
        SELECT x.id, 'expense', x.concept, x.effective_on, x.created_at,
               x.currency, ${mixed ? "(x.amount + coalesce(d.amount, 0))" : "x.amount"}::text,
               ${mixed ? "CASE WHEN d.id IS NOT NULL THEN 'mixed' ELSE x.method END" : "x.method"}, x.note,
               CASE WHEN f.kind = 'card_payment' THEN 'Comisiones bancarias'
                 ${
                   mixed
                     ? `WHEN d.id IS NOT NULL AND EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
                   WHERE (s.owner_id, s.event_id) = (x.owner_id, x.id)) THEN 'Categorías repartidas'`
                     : ""
                 }
                 ELSE c.name END
          FROM finance.${shared ? "credit_consumption" : "credit_expenses"} x
          JOIN finance.financial_events f ON (f.owner_id, f.id) = (x.owner_id, x.id)
          LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (x.owner_id, x.category_id)
          ${
            mixed
              ? `LEFT JOIN finance.mixed_purchase_debits d
            ON (d.owner_id, d.id) = (x.owner_id, x.id) AND x.installment_ordinal IS NULL`
              : ""
          }
         WHERE x.owner_id = $1 ${shared ? "AND x.amount > 0" : ""} ${installmentsReady ? "AND x.installment_ordinal IS NULL" : ""}
         ${
           mixed
             ? `UNION ALL
         SELECT f.id, 'expense', f.concept, d.effective_on, f.created_at,
                d.currency, d.amount::text, 'debit', o.note,
                CASE WHEN EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
                  WHERE (s.owner_id, s.event_id) = (d.owner_id, d.id)) THEN 'Categorías repartidas' ELSE c.name END
           FROM finance.mixed_purchase_debits d
           JOIN finance.financial_events f ON (f.owner_id, f.id) = (d.owner_id, d.id)
           JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (d.owner_id, d.id)
           JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (d.owner_id, d.id)
           LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (o.owner_id, o.category_id)
          WHERE d.owner_id = $1 AND f.status = 'confirmed'`
             : ""
         }`
          : ""
      }
      ) recent ORDER BY effective_on DESC, created_at DESC, id DESC, currency LIMIT 5`,
    [ownerId, kind],
  );
  return shared
    ? rows.map(({ shared: linked, ...movement }) =>
        linked ? { ...movement, shared: true } : movement,
      )
    : rows;
}
