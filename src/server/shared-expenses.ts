import "server-only";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import { coverageDecimal, coverageUnits } from "../domain/fund-coverage.ts";
import { recurringSharesReady } from "./recurring-shares.ts";
import { recurrenceEventPeriods } from "./recurrence-links.ts";
import { classificationReady, readClassification } from "./classification.ts";
import { hasLinkedRefund } from "./refund-schema.ts";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  allocationMatches,
  type SharedExpenseCommand,
} from "../domain/shared-expenses.ts";
import type { Currency } from "../domain/money.ts";
import { lockBankWrites } from "./bank-balances.ts";
import { saveCreditOperation } from "./credit-operations.ts";
import { listLoans, saveLoanOperation } from "./loans.ts";
import {
  commandHash,
  findReplay,
  resolveMovementCategory,
  saveMovement,
} from "./movements.ts";
import { sharedExpensesReady } from "./shared-expense-schema.ts";

type Details = {
  concept: string;
  categoryId: string | null;
  note: string | null;
};
type Expense = Details & {
  currency: Currency;
  amount: string;
  effectiveOn: string;
  method: "debit" | "transfer" | "credit" | "third_party";
};
type SharedExpense = Expense & { ownAmount: string; version: number };
const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;
const missing = { status: "not-found" } as const;

async function splitSource(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const {
    rows: [row],
  } = await client.query<Expense>(
    `SELECT f.concept, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
       coalesce(b.currency, l.currency) AS currency,
       coalesce(-b.amount_signed, p.installment_amount * p.installment_count, l.amount)::text AS amount,
       coalesce(m.method, 'credit') AS method,
       coalesce(m.category_id, o.category_id) AS "categoryId", coalesce(m.note, o.note) AS note
       FROM finance.financial_events f
       LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       LEFT JOIN finance.bank_effects b ON (b.owner_id, b.event_id, b.id) = (m.owner_id, m.event_id, m.event_id)
       LEFT JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
       LEFT JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (o.owner_id, o.event_id)
       LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (f.owner_id, f.id)
       WHERE f.owner_id = $1 AND f.id = $2 AND f.status = 'confirmed'
         AND ((f.kind = 'expense' AND b.amount_signed < 0)
           OR (f.kind = 'card_purchase' AND l.event_id IS NOT NULL
             AND (p.version IS NULL OR p.active_count = p.installment_count)))
         AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m2 WHERE (m2.owner_id, m2.event_id) = (f.owner_id, f.id))
         AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))`,
    [ownerId, eventId],
  );
  return row;
}

async function findExpense(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const {
    rows: [expense],
  } = await client.query<SharedExpense>(
    `SELECT s.concept, s.category_id AS "categoryId", s.note, s.currency, s.total::text AS amount,
            s.method, s.own_amount::text AS "ownAmount", s.version, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn"
       FROM finance.current_shared_expenses s
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (s.owner_id, s.event_id)
      WHERE s.owner_id = $1 AND s.event_id = $2 AND f.status = 'confirmed'`,
    [ownerId, eventId],
  );
  return expense;
}

export async function sharedExpenseDetail(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  recurring = false,
) {
  const expense = await findExpense(client, ownerId, eventId);
  if (!expense) return undefined;
  const splitReady =
    recurring &&
    expense.method !== "third_party" &&
    (await recurringSharesReady(client));
  const loans = await listLoans(client, ownerId, eventId);
  const revisions = await client.query<{
    concept: string;
    category: string | null;
    note: string | null;
    version: number;
    recordedOn: string;
    correctedOwn: string | null;
  }>(
    `SELECT d.version, d.concept, c.name AS "category", d.note,
              ${splitReady ? "d.own_amount::text" : "NULL"} AS "correctedOwn",
              to_char(d.recorded_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD HH24:MI') AS "recordedOn"
         FROM finance.shared_expense_details d
         LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (d.owner_id, d.category_id)
        WHERE d.owner_id = $1 AND d.event_id = $2 ORDER BY d.version DESC`,
    [ownerId, eventId],
  );
  const portions = splitReady
    ? await recordedPortions(client, ownerId, eventId)
    : [];
  const byLoan = new Map(portions.map((portion) => [portion.id, portion]));
  return {
    ...expense,
    loans,
    revisions: revisions.rows,
    portions: loans.flatMap(({ id, concept }) => {
      const portion = byLoan.get(id);
      return portion ? [{ ...portion, name: concept }] : [];
    }),
  };
}

async function appendDetails(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  version: number,
  details: Details,
) {
  await client.query(
    `INSERT INTO finance.shared_expense_details (owner_id, event_id, version, concept, category_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      ownerId,
      eventId,
      version,
      details.concept,
      details.categoryId,
      details.note,
    ],
  );
}

async function audit(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  type: "created" | "expense_split" | "shared_expense_edited",
  key?: string,
  hash?: string,
) {
  await client.query(
    `INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type, idempotency_key, command_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ownerId, randomUUID(), eventId, type, key ?? null, hash ?? null],
  );
}

async function openObligations(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  expense: Expense,
  parties: { name: string; amount: string; dueOn: string | null }[],
) {
  const direction = expense.method === "third_party" ? "payable" : "receivable";
  // Child events have no cash flow. The parent command controls the whole write
  // and the existing loan service handles all subsequent payments and collections.
  await client.query(
    `WITH people AS (
       SELECT * FROM jsonb_to_recordset($5::jsonb) AS p(id uuid, name text, amount numeric, due_on date)
     ), events AS (
       INSERT INTO finance.financial_events
         (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash)
       SELECT $1, id, 'loan_operation', name, $4, id, $6 FROM people
       RETURNING id
     ), loans AS (
       INSERT INTO finance.loans (owner_id, id, direction, currency, installment_loan, due_on, source_expense_id)
       SELECT $1, p.id, $7, $3, false, p.due_on, $2 FROM people p JOIN events USING (id)
       RETURNING id
     ), operations AS (
       INSERT INTO finance.loan_operations (owner_id, event_id, loan_id, currency, version, action, amount,
         outstanding, accrued_interest, accrued_paid, expense, needs_reconciliation)
       SELECT $1, p.id, p.id, $3, 1, 'shared_expense', p.amount, p.amount, 0.0000, 0.0000, 0.0000, false
         FROM people p JOIN loans USING (id)
       RETURNING event_id
     )
     INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type)
       SELECT $1, event_id, event_id, 'created' FROM operations`,
    [
      ownerId,
      eventId,
      expense.currency,
      expense.effectiveOn,
      JSON.stringify(
        parties.map(({ name, amount, dueOn }) => ({
          id: randomUUID(),
          name,
          amount,
          due_on: dueOn,
        })),
      ),
      commandHash(["shared-expense-obligations", eventId]),
      direction,
    ],
  );
}

async function recordedPortions(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const { rows } = await client.query<{
    id: string;
    amount: string;
    collected: string;
  }>(
    `WITH revision AS (
       SELECT party_amounts FROM finance.shared_expense_details
        WHERE owner_id = $1 AND event_id = $2 AND party_amounts IS NOT NULL
        ORDER BY version DESC LIMIT 1
     )
     SELECT l.id, coalesce((SELECT party_amounts ->> l.id::text FROM revision),
       max(o.amount) FILTER (WHERE o.version = 1)::text) AS amount,
       coalesce(sum(o.principal_paid), 0)::finance.exact_amount::text AS collected
     FROM finance.loans l JOIN finance.loan_operations o
       ON (o.owner_id, o.loan_id) = (l.owner_id, l.id)
     WHERE l.owner_id = $1 AND l.source_expense_id = $2 AND l.direction = 'receivable'
     GROUP BY l.id`,
    [ownerId, eventId],
  );
  return rows;
}

async function reviseSplit(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<SharedExpenseCommand, { action: "revise-split" }>,
  hash: string,
) {
  const { eventId, ownAmount, parties, expectedVersion, idempotencyKey } =
    command;
  if (!(await recurringSharesReady(client))) return missing;
  const current = await findExpense(client, ownerId, eventId);
  if (
    !current ||
    current.method === "third_party" ||
    !(await recurrenceEventPeriods(client, ownerId, eventId)).length
  )
    return missing;
  if (current.version !== expectedVersion)
    return conflict(
      "El gasto cambió. Actualizá la página antes de corregirlo.",
    );
  if (await hasLinkedRefund(client, ownerId, eventId))
    return conflict("El gasto tiene devoluciones vinculadas.");
  const total = parties.reduce(
    (sum, party) => sum + coverageUnits(party.amount),
    coverageUnits(ownAmount),
  );
  if (total !== coverageUnits(current.amount))
    return conflict("Las partes deben sumar exactamente el pago original.");

  const portions = await recordedPortions(client, ownerId, eventId);
  const requested = new Map(
    parties.map(({ loanId, amount }) => [loanId, amount]),
  );
  if (
    parties.length !== portions.length ||
    portions.some(({ id }) => !requested.has(id))
  )
    return conflict("Corregí los importes de las personas vinculadas al pago.");
  const loans = await listLoans(client, ownerId, eventId);
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const changes = [];
  for (const { id, amount, collected } of portions) {
    const proposed = requested.get(id)!;
    if (proposed === amount) continue;
    const loan = loanById.get(id)!;
    const paid = coverageUnits(collected);
    const remaining = coverageUnits(proposed) - paid;
    if (remaining < BigInt(0))
      return conflict(
        "Una parte corregida no puede ser menor que lo ya cobrado.",
      );
    if (coverageUnits(amount) - paid !== coverageUnits(loan.outstanding))
      return conflict(
        "Hay un ajuste previo en una cuenta por cobrar. Revisá su historial antes de corregir el reparto.",
      );
    changes.push({ loan, amount: coverageDecimal(remaining) });
  }

  const effectiveOn = bankReferenceToday();
  for (const { loan, amount } of changes) {
    const saved = await saveLoanOperation(client, ownerId, {
      action: "adjust",
      loanId: loan.id,
      expectedVersion: loan.version,
      amount,
      accruedInterest: null,
      effectiveOn,
      idempotencyKey: randomUUID(),
      note: "Corrección del reparto del pago recurrente",
    });
    // A downstream failure must roll back any previously revised obligation.
    if (saved.status !== "created")
      throw new Error("No se pudo revisar la obligación.");
  }
  await client.query(
    `INSERT INTO finance.shared_expense_details
       (owner_id,event_id,version,concept,category_id,note,own_amount,party_amounts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      ownerId,
      eventId,
      current.version + 1,
      current.concept,
      current.categoryId,
      current.note,
      ownAmount,
      JSON.stringify(Object.fromEntries(requested)),
    ],
  );
  await audit(
    client,
    ownerId,
    eventId,
    "shared_expense_edited",
    idempotencyKey,
    hash,
  );
  return { status: "created", id: eventId } as const;
}

export async function saveSharedExpense(
  client: pg.PoolClient,
  ownerId: string,
  command: SharedExpenseCommand,
  suppliedHash?: string,
) {
  if (!(await sharedExpensesReady(client)))
    return conflict("La base de datos aún no admite gastos compartidos.");
  await lockBankWrites(client, ownerId);
  const { idempotencyKey } = command;
  const hash =
    suppliedHash ?? commandHash(["shared-expense-v1", JSON.stringify(command)]);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay)
    return replay.status === "replayed"
      ? replay
      : conflict("Este envío ya se usó con otros datos.");

  if (
    command.action === "split" &&
    (await hasLinkedRefund(client, ownerId, command.eventId))
  )
    return conflict("El gasto tiene devoluciones vinculadas.");
  if (command.action === "revise-split")
    return reviseSplit(client, ownerId, command, hash);
  if (command.action === "edit") {
    const current = await findExpense(client, ownerId, command.eventId);
    if (!current) return missing;
    if (current.version !== command.expectedVersion)
      return conflict(
        "El gasto cambió. Actualizá la página antes de corregirlo.",
      );
    const categoryId =
      command.categoryId === current.categoryId
        ? current.categoryId
        : await resolveMovementCategory(
            client,
            ownerId,
            "expense",
            command.categoryId,
          );
    if (categoryId === undefined)
      return conflict("La categoría no está disponible.");
    await appendDetails(client, ownerId, command.eventId, current.version + 1, {
      ...command,
      categoryId,
    });
    await audit(
      client,
      ownerId,
      command.eventId,
      "shared_expense_edited",
      idempotencyKey,
      hash,
    );
    return { status: "created", id: command.eventId } as const;
  }

  let expense: Expense;
  let id: string;
  let ownAmount: string;
  let parties: Parameters<typeof openObligations>[4];
  if (command.action === "split") {
    if ((await recurrenceEventPeriods(client, ownerId, command.eventId)).length)
      return conflict("Este pago está vinculado a una recurrencia.");
    const existing = await splitSource(client, ownerId, command.eventId);
    if (!existing) return missing;
    if (!allocationMatches(command, existing.amount, existing.currency))
      return conflict(
        "Tu parte y las de tus amigos deben sumar el total exacto del gasto.",
      );
    if (
      (await classificationReady(client)) &&
      (await readClassification(client, ownerId, command.eventId)).allocations
        .length
    )
      return conflict(
        "Quitá el desglose por categorías antes de dividir el gasto entre personas.",
      );
    expense = existing;
    id = command.eventId;
    ({ ownAmount, parties } = command);
  } else {
    expense = command;
    if (command.method === "third_party") {
      const categoryId = await resolveMovementCategory(
        client,
        ownerId,
        "expense",
        command.categoryId,
      );
      if (categoryId === undefined)
        return conflict("La categoría no está disponible.");
      expense = { ...command, categoryId };
      id = randomUUID();
      ownAmount = command.amount;
      parties = [{ ...command.creditor, amount: ownAmount }];
      await client.query(
        `INSERT INTO finance.financial_events
           (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
         VALUES ($1, $2, 'expense', $3, $4, $5, $6, clock_timestamp())`,
        [
          ownerId,
          id,
          expense.concept,
          expense.effectiveOn,
          idempotencyKey,
          hash,
        ],
      );
      await audit(client, ownerId, id, "created");
    } else {
      ({ ownAmount, parties } = command);
      if (command.purchase) {
        const result = await saveCreditOperation(
          client,
          ownerId,
          command.purchase,
          hash,
        );
        if (result.status !== "created") return result;
        id = result.id;
      } else {
        if (command.method === "credit")
          return conflict("Elegí una tarjeta de crédito.");
        const result = await saveMovement(
          client,
          ownerId,
          {
            ...expense,
            method: command.method,
            kind: "expense",
            idempotencyKey,
          },
          hash,
        );
        if (result.status === "unconfigured")
          return conflict("Registrá primero un saldo de Bancos en esa moneda.");
        if (result.status !== "created")
          return conflict(
            "Revisá el saldo disponible en esa moneda y la categoría elegida.",
          );
        id = result.id;
      }
      // Keep the actual saved category, including default catalog aliases.
      const recorded = await splitSource(client, ownerId, id);
      if (!recorded)
        throw new Error("El gasto compartido no tiene un medio registrado.");
      expense = recorded;
    }
  }

  await client.query(
    `INSERT INTO finance.shared_expenses (owner_id, event_id, currency, method, total, own_amount)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ownerId, id, expense.currency, expense.method, expense.amount, ownAmount],
  );
  await appendDetails(client, ownerId, id, 1, expense);
  await openObligations(client, ownerId, id, expense, parties);
  if (command.action === "split")
    await audit(client, ownerId, id, "expense_split", idempotencyKey, hash);
  return { status: "created", id } as const;
}

export async function sourceExpenseId(
  client: pg.PoolClient,
  ownerId: string,
  loanId: string,
) {
  if (!(await sharedExpensesReady(client))) return undefined;
  const {
    rows: [row],
  } = await client.query<{ id: string | null }>(
    "SELECT source_expense_id AS id FROM finance.loans WHERE owner_id = $1 AND id = $2",
    [ownerId, loanId],
  );
  return row?.id;
}
