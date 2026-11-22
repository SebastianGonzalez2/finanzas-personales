import "server-only";
import { validRecurringRevision } from "./recurrence-links.ts";
import {
  classificationHashFields,
  allocationSumMatches,
} from "../domain/classification.ts";
import {
  classificationReady,
  readClassification,
  prepareClassification,
  insertClassification,
} from "./classification.ts";
import {
  copyEventMerchant,
  nameCatalogReady,
  recordEventMerchant,
} from "./catalog.ts";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  MovementInput,
  MovementKind,
  MovementRevision,
  MovementTotal,
  RecentMovement,
  SummaryRecentMovement,
} from "../domain/movements.ts";
import { resolveMovementCategory } from "./categories.ts";
export {
  listCatalogCategories as listMovementCategories,
  resolveMovementCategory,
} from "./categories.ts";
import { lockOwnerWrites } from "./owner-lock.ts";
import {
  creditOperationsReady,
  loansReady,
  mixedPurchasesReady,
  sharedExpensesReady,
} from "./schema-ready.ts";
import {
  expenseInstallmentsReady,
  insertInstallmentVersion,
} from "./installments.ts";
import { rememberSchema, schemaKnown } from "./schema-ready.ts";

export async function movementAvailability(client: pg.PoolClient) {
  if (schemaKnown.has("movementAvailability"))
    return { readable: true, writable: true };
  const {
    rows: [state],
  } = await client.query<{
    readable: boolean;
    writable: boolean;
  }>(
    `SELECT to_regclass('finance.ordinary_movements') IS NOT NULL AS readable,
            to_regclass('finance.audit_void_command_key') IS NOT NULL AS writable`,
  );
  rememberSchema("movementAvailability", state.readable && state.writable);
  return state;
}

type Replay = { status: "replayed"; id: string } | { status: "conflict" };
type ClassificationError = {
  status: "invalid-classification";
  message: string;
};
type SaveResult =
  | ClassificationError
  | { status: "catalog-unavailable" }
  | Replay
  | { status: "created"; id: string }
  | { status: "invalid-category" | "update-required" };

export function commandHash(fields: readonly (string | null)[]) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

// Se agregan solo con plan: los hashes de gastos sin cuotas no cambian.
function planHashFields({ plan }: Pick<MovementInput, "plan">) {
  return plan
    ? ["plan", plan.installmentAmount, String(plan.count), plan.firstPeriod]
    : [];
}

// Cuotas y gastos sin medio bancario requieren la migración SIMP-02.
async function expensesReady(
  client: pg.PoolClient,
  movement: Pick<MovementInput, "plan" | "method">,
) {
  return (
    (!movement.plan && movement.method !== "unspecified") ||
    expenseInstallmentsReady(client)
  );
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

// Un gasto heredado con reparto entre personas es de solo consulta.
async function isSharedExpense(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (!(await sharedExpensesReady(client))) return false;
  const { rowCount } = await client.query(
    "SELECT 1 FROM finance.shared_expenses WHERE owner_id = $1 AND event_id = $2",
    [ownerId, eventId],
  );
  return !!rowCount;
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
      ...classificationHashFields(movement),
      ...(movement.merchantName ? ["merchant", movement.merchantName] : []),
      ...planHashFields(movement),
    ]);

  await lockOwnerWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;

  if (movement.merchantName && !(await nameCatalogReady(client)))
    return { status: "catalog-unavailable" };
  if (!(await expensesReady(client, movement)))
    return { status: "update-required" };
  // SIMP-02: un gasto ya no depende de un saldo bancario configurado.
  const wantsClassification = classificationHashFields(movement).length > 0;
  if (wantsClassification && !(await classificationReady(client)))
    return {
      status: "invalid-classification",
      message: "Actualizá la base de datos para clasificar el movimiento.",
    };
  const prepared = wantsClassification
    ? await prepareClassification(client, ownerId, movement, amount, kind)
    : null;
  if (prepared && "error" in prepared)
    return { status: "invalid-classification", message: prepared.error };

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
  if (prepared)
    await insertClassification(
      client,
      ownerId,
      id,
      1,
      idempotencyKey,
      hash,
      prepared,
    );
  if (movement.merchantName)
    await recordEventMerchant(client, ownerId, id, movement.merchantName);
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
    [ownerId, id, kind, concept, effectiveOn, idempotencyKey, hash],
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
  if (movement.plan)
    await insertInstallmentVersion(client, ownerId, id, currency, {
      ...movement.plan,
      version: 1,
      activeCount: movement.plan.count,
      change: "created",
    });
  return id;
}

type RevisionResult =
  | { status: "recurrence-conflict" }
  | ClassificationError
  | { status: "catalog-unavailable" }
  | Replay
  | { status: "revised"; id: string }
  | {
      status:
        | "not-found"
        | "inactive"
        | "invalid-category"
        | "invalid-kind"
        | "unavailable"
        | "planned"
        | "update-required";
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
  await lockOwnerWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;
  if (await isSharedExpense(client, ownerId, eventId))
    return { status: "unavailable" };
  const {
    rows: [original],
  } = await client.query<
    Omit<MovementInput, "idempotencyKey" | "amount"> & {
      status: string;
      planned: boolean;
    }
  >(
    `SELECT f.kind, f.concept, f.status, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            m.category_id AS "categoryId", m.method, m.note, e.currency,
            ${
              (await expenseInstallmentsReady(client))
                ? `EXISTS (SELECT 1 FROM finance.installment_plans p
              WHERE (p.owner_id, p.event_id) = (f.owner_id, f.id))`
                : "false"
            } AS planned
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
      WHERE f.owner_id = $1 AND f.id = $2 AND f.kind = 'expense'`,
    [ownerId, eventId],
  );
  if (!original) return { status: "not-found" };
  if (original.status !== "confirmed") return { status: "inactive" };
  // Las cuotas se corrigen editando el gasto completo.
  if (amount !== null && original.planned) return { status: "planned" };

  const classification =
    amount !== null && (await classificationReady(client))
      ? await readClassification(client, ownerId, eventId)
      : null;
  if (
    amount !== null &&
    classification?.allocations.length &&
    !allocationSumMatches(classification.allocations, amount)
  )
    return {
      status: "invalid-classification",
      message: "Usá Editar para ajustar el desglose al nuevo importe.",
    };

  const { currency } = original;
  if (
    amount !== null &&
    !(await validRecurringRevision(client, ownerId, eventId, amount, currency))
  )
    return { status: "recurrence-conflict" };
  const replacement =
    amount === null
      ? null
      : await insertMovement(
          client,
          ownerId,
          {
            kind: original.kind,
            concept: original.concept,
            effectiveOn: original.effectiveOn,
            categoryId: original.categoryId,
            method: original.method,
            note: original.note,
            currency,
            amount,
            idempotencyKey,
          },
          hash,
        );
  if (
    replacement &&
    classification &&
    (classification.tagIds.length || classification.allocations.length)
  )
    await insertClassification(
      client,
      ownerId,
      replacement,
      1,
      idempotencyKey,
      hash,
      {
        ...classification,
        allocatedTotal: classification.allocations.length ? amount : null,
      },
    );
  if (replacement && original.kind === "expense")
    await copyEventMerchant(client, ownerId, eventId, replacement);
  return recordRevision(client, ownerId, command, hash, replacement);
}

export async function historyReady(client: pg.PoolClient) {
  if (schemaKnown.has("historyReady")) return true;
  const {
    rows: [state],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.financial_events_history') IS NOT NULL AS ready",
  );
  return rememberSchema("historyReady", state.ready);
}

async function editMovement(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<MovementRevision, { action: "edit" }>,
): Promise<RevisionResult> {
  const { eventId, idempotencyKey, movement } = command;
  const fields = [
    movement.currency,
    movement.amount,
    movement.method,
    movement.concept,
    movement.note,
    movement.categoryId,
    ...classificationHashFields(movement),
    ...(movement.allocations?.length === 0 ? ["clear-allocations"] : []),
    ...(movement.tagIds?.length === 0 ? ["clear-tags"] : []),
    ...(movement.merchantName !== undefined
      ? ["merchant", movement.merchantName]
      : []),
    ...planHashFields(movement),
  ];
  const hash = commandHash([
    "movement-edit-v1",
    eventId,
    movement.kind,
    movement.effectiveOn,
    ...fields,
    ...(command.classificationVersion !== undefined
      ? ["classification-version", String(command.classificationVersion)]
      : []),
  ]);
  await lockOwnerWrites(client, ownerId);
  if (!(await historyReady(client))) return { status: "unavailable" };
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay) return replay;
  if (await isSharedExpense(client, ownerId, eventId))
    return { status: "unavailable" };

  const {
    rows: [original],
  } = await client.query<{
    kind: string;
    status: string;
    categoryId: string | null;
  }>(
    `SELECT f.kind, f.status, m.category_id AS "categoryId"
       FROM finance.financial_events f
       LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
      WHERE f.owner_id = $1 AND f.id = $2
        AND m.event_id IS NOT NULL`,
    [ownerId, eventId],
  );
  if (!original) return { status: "not-found" };
  if (original.status !== "confirmed") return { status: "inactive" };
  if (original.kind !== movement.kind) return { status: "invalid-kind" };
  if (!(await expensesReady(client, movement)))
    return { status: "update-required" };
  if (
    !(await validRecurringRevision(
      client,
      ownerId,
      eventId,
      movement.amount,
      movement.currency,
    ))
  )
    return { status: "recurrence-conflict" };
  if (movement.merchantName && !(await nameCatalogReady(client)))
    return { status: "catalog-unavailable" };

  let replacement: string;
  {
    const ready = await classificationReady(client);
    if (
      !ready &&
      (movement.allocations !== undefined || movement.tagIds !== undefined)
    )
      return {
        status: "invalid-classification",
        message: "Actualizá la base de datos para clasificar el movimiento.",
      };
    const priorClassification = ready
      ? await readClassification(client, ownerId, eventId)
      : undefined;
    if (
      command.classificationVersion !== undefined &&
      command.classificationVersion !== priorClassification?.version
    )
      return {
        status: "invalid-classification",
        message: "La clasificación cambió. Actualizá la página.",
      };
    const prepared =
      ready &&
      (priorClassification?.version ||
        movement.allocations?.length ||
        movement.tagIds?.length)
        ? await prepareClassification(
            client,
            ownerId,
            movement,
            movement.amount,
            movement.kind,
            priorClassification,
          )
        : null;
    if (prepared && "error" in prepared)
      return { status: "invalid-classification", message: prepared.error };
    if (movement.plan && prepared?.allocations.length)
      return {
        status: "invalid-classification",
        message: "Un gasto en cuotas se asigna a una sola categoría.",
      };
    if (
      prepared?.allocations.length &&
      movement.allocations === undefined &&
      movement.categoryId !== original.categoryId
    )
      return {
        status: "invalid-classification",
        message: "Revisá el desglose al cambiar la categoría del movimiento.",
      };
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
      { ...movement, idempotencyKey, categoryId },
      hash,
    );
    if (prepared && (prepared.allocations.length || prepared.tagIds.length))
      await insertClassification(
        client,
        ownerId,
        replacement,
        1,
        idempotencyKey,
        hash,
        prepared,
      );
    if (movement.merchantName)
      await recordEventMerchant(
        client,
        ownerId,
        replacement,
        movement.merchantName,
      );
    else if (movement.kind === "expense" && movement.merchantName === undefined)
      await copyEventMerchant(client, ownerId, eventId, replacement);
  }
  return recordRevision(client, ownerId, command, hash, replacement);
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

export async function listMovementTotals(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
) {
  return movementTotals<MovementTotal>(client, ownerId, monthStart, false);
}

export async function listMerchantTotals(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
) {
  return movementTotals<MovementTotal & { merchantId: string }>(
    client,
    ownerId,
    monthStart,
    true,
  );
}

async function movementTotals<T extends MovementTotal>(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
  byMerchant: boolean,
) {
  const credit = await creditOperationsReady(client);
  const mixed = credit && (await mixedPurchasesReady(client));
  const loans = await loansReady(client);
  const shared = loans && (await sharedExpensesReady(client));
  const planned = await expenseInstallmentsReady(client);
  const { rows } = await client.query<T>(
    `SELECT kind, currency, sum(amount)::text AS amount ${byMerchant ? ', ref.merchant_id AS "merchantId"' : ""} FROM (
       SELECT f.id, f.kind, e.currency, abs(e.amount_signed) AS amount
       FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e
         ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
      WHERE f.owner_id = $1 AND f.status = 'confirmed' AND f.effective_on >= $2::date
        AND f.effective_on < $2::date + interval '1 month'
        ${planned ? "AND NOT EXISTS (SELECT 1 FROM finance.installment_plans p WHERE (p.owner_id, p.event_id) = (f.owner_id, f.id))" : ""}
      ${
        shared
          ? `AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))
        UNION ALL
        SELECT f.id, 'expense', s.currency, s.own_amount FROM finance.current_shared_expenses s
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
        WHERE s.owner_id = $1 AND s.method <> 'credit' AND s.own_amount > 0 AND f.status = 'confirmed'
          AND f.effective_on >= $2::date AND f.effective_on < $2::date + interval '1 month'`
          : ""
      }
      ${
        planned
          ? `UNION ALL
        SELECT x.id, 'expense', x.currency, x.amount FROM finance.expense_installments x
         WHERE x.owner_id = $1 AND x.effective_on >= $2::date
           AND x.effective_on < $2::date + interval '1 month'`
          : ""
      }
      ${
        credit
          ? `UNION ALL
        SELECT x.id, 'expense', x.currency, x.amount FROM finance.${shared ? "credit_consumption" : "credit_expenses"} x
         WHERE x.owner_id = $1 ${shared ? "AND x.amount > 0" : ""} AND x.effective_on >= $2::date
           AND x.effective_on < $2::date + interval '1 month'
           ${
             mixed
               ? `AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
             WHERE (m.owner_id, m.event_id) = (x.owner_id, x.id))
           UNION ALL
           SELECT id, 'expense', currency, amount FROM finance.mixed_purchase_expenses
            WHERE owner_id = $1 AND effective_on >= $2::date AND effective_on < $2::date + interval '1 month'`
               : ""
           }`
          : ""
      }
      ${
        loans
          ? `UNION ALL
        SELECT f.id, 'expense', o.currency, o.expense FROM finance.loan_operations o
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
        WHERE o.owner_id = $1 AND o.expense > 0 AND f.status = 'confirmed'
          AND f.effective_on >= $2::date AND f.effective_on < $2::date + interval '1 month'`
          : ""
      }
      ) amounts
      ${
        byMerchant
          ? `JOIN finance.canonical_event_merchants ref
        ON ref.owner_id = $1 AND ref.event_id = amounts.id
        WHERE amounts.kind = 'expense'`
          : ""
      }
      GROUP BY kind, currency ${byMerchant ? " , ref.merchant_id ORDER BY ref.merchant_id, currency" : ""}`,
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
  return recentMovementRows<RecentMovement>(
    client,
    ownerId,
    kind,
    installmentsReady,
    false,
  );
}

/** SIMP-03: últimos gastos del Resumen (los ingresos heredados no se muestran). */
export async function listSummaryRecentExpenses(
  client: pg.PoolClient,
  ownerId: string,
  installmentsReady: boolean,
) {
  return recentMovementRows<SummaryRecentMovement>(
    client,
    ownerId,
    "expense",
    installmentsReady,
    true,
  );
}

async function recentMovementRows<T extends RecentMovement>(
  client: pg.PoolClient,
  ownerId: string,
  kind: MovementKind,
  installmentsReady: boolean,
  withSummaryMetadata: boolean,
) {
  const credit = kind === "expense" && (await creditOperationsReady(client));
  const mixed = credit && (await mixedPurchasesReady(client));
  const shared = kind === "expense" && (await sharedExpensesReady(client));
  const classified = await classificationReady(client);
  const planned =
    withSummaryMetadata && (await expenseInstallmentsReady(client));
  const category = classified
    ? `CASE WHEN EXISTS (SELECT 1 FROM finance.current_movement_allocations a
        WHERE a.owner_id = $1 AND a.event_id = recent.id)
      THEN (SELECT CASE WHEN count(*) > 1 THEN 'Categorías repartidas' ELSE max(c.name) END
        FROM finance.current_movement_allocations a
        LEFT JOIN finance.categories c ON (c.owner_id,c.id)=(a.owner_id,a.category_id)
        WHERE a.owner_id = $1 AND a.event_id = recent.id)
      ELSE recent.category END AS category`
    : "category";
  // Una fila de crédito o mixta puede mostrar un débito que no admite
  // corrección por la vía de los movimientos bancarios ordinarios.
  const amountCorrectable = withSummaryMetadata
    ? `, (EXISTS (
        SELECT 1 FROM finance.ordinary_movements m
         WHERE m.owner_id = $1 AND m.event_id = recent.id
      ) ${
        planned
          ? `AND NOT EXISTS (
        SELECT 1 FROM finance.installment_plans p
         WHERE p.owner_id = $1 AND p.event_id = recent.id
      )`
          : ""
      }) AS "amountCorrectable"`
    : "";
  const { rows } = await client.query<T>(
    `SELECT id, kind, concept, to_char(effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            ${withSummaryMetadata ? `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS "createdAt",` : ""}
            currency, amount, method, note, ${category}
            ${amountCorrectable}
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
