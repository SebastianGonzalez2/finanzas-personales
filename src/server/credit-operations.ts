import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  CreditCommand,
  CreditPaymentLine,
  CreditPurchaseOption,
  CreditVoid,
  DebtAmount,
  InstallmentRevision,
  MixedPurchase,
  OpeningDebt,
  PurchaseCategory,
} from "../domain/credit-operations.ts";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import {
  installmentPeriodAt,
  installmentTotal,
  type InstallmentVersion,
} from "../domain/installments.ts";
import { Money, type Currency } from "../domain/money.ts";
import { listBankBalances, lockBankWrites } from "./bank-balances.ts";
import { insertInstallmentVersion } from "./installments.ts";
import { isSharedExpense } from "./shared-expense-schema.ts";
import { mixedPurchasesReady } from "./mixed-purchases.ts";
import {
  commandHash,
  findReplay,
  recordRevision,
  resolveMovementCategory,
} from "./movements.ts";

import {
  hasLaterCreditChange,
  hasLinkedRefund,
  refundsReady,
} from "./refund-schema.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;
const zero = "0.0000";
const maxUnits = BigInt("99999999999999999999");
const units = (amount: string) => {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
};
const decimal = (units: bigint) => {
  const digits = units.toString().padStart(5, "0");
  return digits.slice(0, -4) + "." + digits.slice(-4);
};

export async function lockCardWrites(client: pg.PoolClient, ownerId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:cards:' || $1::text, 0))",
    [ownerId],
  );
}

type RecordedLine = DebtAmount & {
  debtDelta: string;
  debtAfter: string;
  creditDelta?: string;
  payment?: CreditPaymentLine;
};
type CreditEvent = {
  cardId: string;
  effectiveOn: string;
  idempotencyKey: string;
  kind:
    | "card_purchase"
    | "card_payment"
    | "card_opening"
    | "card_adjustment"
    | "purchase_refund"
    | "card_credit_return";
  concept: string;
  categoryId?: string | null;
  note?: string | null;
  lines: RecordedLine[];
  mixed?: boolean;
};

export async function insertCreditEvent(
  client: pg.PoolClient,
  ownerId: string,
  event: CreditEvent,
  hash: string,
  bankDebits = new Map<Currency, bigint>(),
  id: string = randomUUID(),
) {
  const {
    cardId,
    effectiveOn,
    idempotencyKey,
    kind,
    concept,
    categoryId,
    note,
  } = event;
  await client.query(
    `INSERT INTO finance.financial_events
      (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
    [ownerId, id, kind, concept, effectiveOn, idempotencyKey, hash],
  );
  await client.query(
    `INSERT INTO finance.credit_operations (owner_id, event_id, card_id, category_id, note)
      VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, id, cardId, categoryId ?? null, note ?? null],
  );
  for (const {
    currency,
    amount,
    debtDelta,
    debtAfter,
    creditDelta,
    payment,
  } of event.lines) {
    const statement = payment?.statementPeriod;
    await client.query(
      `INSERT INTO finance.credit_lines
        (owner_id, event_id, card_id, currency, amount, debt_delta, debt_after, bank_currency, bank_amount, fee${statement ? ", statement_period" : ""})
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10${statement ? ", $11" : ""})`,
      [
        ownerId,
        id,
        cardId,
        currency,
        amount,
        debtDelta,
        debtAfter,
        payment?.bankCurrency ?? null,
        payment?.bankAmount ?? null,
        payment?.fee ?? zero,
        ...(statement ? [`${statement}-01`] : []),
      ],
    );
    await client.query(
      `UPDATE finance.card_currencies SET debt = $4
        WHERE owner_id = $1 AND card_id = $2 AND currency = $3`,
      [ownerId, cardId, currency, debtAfter],
    );
    if (creditDelta !== undefined) {
      await client.query(
        "INSERT INTO finance.card_credit_changes (owner_id, event_id, card_id, currency, delta) VALUES ($1, $2, $3, $4, $5)",
        [ownerId, id, cardId, currency, creditDelta],
      );
    }
    for (const allocation of payment?.allocations ?? []) {
      await client.query(
        `INSERT INTO finance.credit_allocations (owner_id, card_id, payment_id, purchase_id, currency, amount)
          VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ownerId,
          cardId,
          id,
          allocation.purchaseId,
          currency,
          allocation.amount,
        ],
      );
    }
  }
  for (const [currency, debit] of bankDebits) {
    await client.query(
      `INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
        VALUES ($1, $2, $3, $4, -$5::numeric, $6)`,
      [
        ownerId,
        event.mixed ? id : randomUUID(),
        id,
        currency,
        decimal(debit),
        effectiveOn,
      ],
    );
  }
  await client.query(
    "INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type) VALUES ($1, $2, $2, 'created')",
    [ownerId, id],
  );
  return id;
}

// The caller holds the bank and card write locks and already inserted the currencies.
export async function saveOpeningDebt(
  client: pg.PoolClient,
  ownerId: string,
  cardId: string,
  cardName: string,
  idempotencyKey: string,
  opening: OpeningDebt,
  hash: string,
) {
  await insertCreditEvent(
    client,
    ownerId,
    {
      ...opening,
      cardId,
      idempotencyKey,
      kind: "card_opening",
      concept: `Deuda inicial · ${cardName}`,
      lines: opening.lines.map((line) => ({
        ...line,
        debtDelta: line.amount,
        debtAfter: line.amount,
      })),
    },
    hash,
  );
}

type Position = {
  currency: Currency;
  debt: string;
  creditBalance: string;
  latestActivity: string | null;
  reference: string | null;
  latest: string | null;
};

export async function listPositions(
  client: pg.PoolClient,
  ownerId: string,
  cardId: string,
) {
  const refunds = await refundsReady(client);
  const { rows } = await client.query<Position>(
    `SELECT p.currency, coalesce(p.debt, 0)::text AS debt,
            (coalesce(p.credit_balance, 0)${refunds ? " + coalesce(b.delta, 0)" : ""})::text AS "creditBalance",
            to_char(activity.last_activity, 'YYYY-MM-DD') AS "latestActivity",
            to_char(activity.reference, 'YYYY-MM-DD') AS reference,
            to_char(activity.latest, 'YYYY-MM-DD') AS latest
       FROM finance.card_currencies p
       ${refunds ? "LEFT JOIN finance.card_credit_balances b USING (owner_id, card_id, currency)" : ""}
       CROSS JOIN LATERAL (
         SELECT max(f.effective_on) FILTER (WHERE f.kind IN ('card_opening', 'card_adjustment')) AS reference,
                max(f.effective_on) FILTER (WHERE l.debt_delta <> 0) AS latest,
                max(f.effective_on) AS last_activity
           FROM finance.credit_lines l
           JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
          WHERE (l.owner_id, l.card_id, l.currency) = (p.owner_id, p.card_id, p.currency)
            AND f.status = 'confirmed'
       ) activity
      WHERE p.owner_id = $1 AND p.card_id = $2`,
    [ownerId, cardId],
  );
  return new Map(rows.map((position) => [position.currency, position]));
}

export async function minimumDebtFrom(
  client: pg.PoolClient,
  ownerId: string,
  cardId: string,
  currency: Currency,
  effectiveOn: string,
  debt: string,
  afterEvent?: string,
) {
  const {
    rows: [row],
  } = await client.query<{ minimum: string }>(
    `SELECT least($5::numeric, min(balance))::text AS minimum FROM (
       SELECT $5::numeric - sum(l.debt_delta) OVER (
         ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC
       ) AS balance
         FROM finance.credit_lines l
         JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
        WHERE l.owner_id = $1 AND l.card_id = $2 AND l.currency = $3
          AND f.status = 'confirmed'
          AND (f.effective_on > $4::date OR (f.effective_on = $4 AND
            (f.created_at, f.id) > (SELECT created_at, id FROM finance.financial_events
              WHERE owner_id = $1 AND id = $6::uuid)))
     ) timeline`,
    [ownerId, cardId, currency, effectiveOn, debt, afterEvent ?? null],
  );
  return row.minimum;
}

export async function listCreditPurchaseOptions(
  client: pg.PoolClient,
  ownerId: string,
) {
  const refunds = await refundsReady(client);
  const available = refunds
    ? "l.amount - coalesce(used.total, 0) - coalesce(credited.amount, 0) + coalesce(applied.delta, 0)"
    : "l.amount - coalesce(used.total, 0)";
  const { rows } = await client.query<CreditPurchaseOption>(
    `SELECT f.id, l.card_id AS "cardId", f.concept, l.currency,
            to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            (${available})::text AS amount
       FROM finance.credit_lines l
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
       LEFT JOIN LATERAL (
         SELECT sum(a.amount) AS total
           FROM finance.credit_allocations a
           JOIN finance.financial_events payment ON (payment.owner_id, payment.id) = (a.owner_id, a.payment_id)
          WHERE (a.owner_id, a.purchase_id, a.currency) = (l.owner_id, l.event_id, l.currency)
            AND payment.status = 'confirmed'
       ) used ON true
       ${
         refunds
           ? `LEFT JOIN finance.card_credit_changes applied ON (applied.owner_id, applied.event_id, applied.currency) = (l.owner_id, l.event_id, l.currency)
       LEFT JOIN LATERAL (
         SELECT sum(x.amount) AS amount FROM finance.purchase_refunds r
         JOIN finance.financial_events rf ON (rf.owner_id, rf.id) = (r.owner_id, r.event_id)
         JOIN finance.refund_parts x ON (x.owner_id, x.event_id) = (r.owner_id, r.event_id)
         WHERE r.owner_id = l.owner_id AND r.purchase_id = l.event_id
           AND rf.status = 'confirmed' AND r.action = 'credit' AND x.method = 'credit'
       ) credited ON true`
           : ""
       }
      WHERE l.owner_id = $1 AND f.kind = 'card_purchase' AND f.status = 'confirmed'
        AND (${available}) > 0
      ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC`,
    [ownerId],
  );
  return rows;
}

export async function voidCreditOperation(
  client: pg.PoolClient,
  ownerId: string,
  command: CreditVoid,
) {
  const { eventId, idempotencyKey } = command;
  const hash = commandHash(["credit-void-v1", eventId]);
  await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay)
    return replay.status === "replayed"
      ? replay
      : conflict("Este envío ya se usó con otros datos.");

  const blocked = await reverseCreditDebt(client, ownerId, eventId);
  return blocked ?? recordRevision(client, ownerId, command, hash, null);
}

async function reverseCreditDebt(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (await hasLinkedRefund(client, ownerId, eventId))
    return conflict(
      "La compra tiene devoluciones vinculadas. Revisalas antes de corregirla.",
    );
  if (await isSharedExpense(client, ownerId, eventId))
    return conflict(
      "La compra tiene obligaciones vinculadas y requiere una corrección coordinada.",
    );
  const { rows } = await client.query<{
    cardId: string;
    currency: Currency;
    kind: "card_purchase" | "card_payment";
    status: string;
    effectiveOn: string;
    debt: string;
    delta: string;
    anchored: boolean;
    allocated: boolean;
  }>(
    `SELECT l.card_id AS "cardId", l.currency, f.kind, f.status,
            to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            p.debt::text, l.debt_delta::text AS delta,
            EXISTS (
              SELECT 1 FROM finance.credit_lines anchor
              JOIN finance.financial_events af ON (af.owner_id, af.id) = (anchor.owner_id, anchor.event_id)
               WHERE (anchor.owner_id, anchor.card_id, anchor.currency) = (l.owner_id, l.card_id, l.currency)
                 AND af.kind IN ('card_opening', 'card_adjustment') AND af.status = 'confirmed'
                 AND (af.effective_on, af.created_at, af.id) > (f.effective_on, f.created_at, f.id)
            ) AS anchored,
            EXISTS (
              SELECT 1 FROM finance.credit_allocations a
              JOIN finance.financial_events payment ON (payment.owner_id, payment.id) = (a.owner_id, a.payment_id)
               WHERE (a.owner_id, a.purchase_id, a.currency) = (l.owner_id, l.event_id, l.currency)
                 AND payment.status = 'confirmed'
            ) AS allocated
       FROM finance.credit_lines l
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
       JOIN finance.card_currencies p ON (p.owner_id, p.card_id, p.currency) = (l.owner_id, l.card_id, l.currency)
      WHERE f.owner_id = $1 AND f.id = $2 AND f.kind IN ('card_purchase', 'card_payment')`,
    [ownerId, eventId],
  );
  if (!rows.length) return { status: "not-found" } as const;
  if (rows[0].status !== "confirmed")
    return conflict("El registro ya fue anulado.");
  if (rows.some(({ allocated }) => allocated))
    return conflict("Anulá primero los pagos asignados a esta compra.");

  const refundSchema = await refundsReady(client);
  const updates: { cardId: string; currency: Currency; debt: string }[] = [];
  for (const line of rows) {
    const { cardId, currency, effectiveOn, debt } = line;
    const delta = units(line.delta);
    if (
      await hasLaterCreditChange(
        client,
        ownerId,
        cardId,
        currency,
        effectiveOn,
        eventId,
      )
    )
      return conflict(
        "La operación respalda devoluciones o usos posteriores de saldo a favor.",
      );
    const applied =
      refundSchema &&
      (
        await client.query<{ delta: string; balance: string }>(
          `SELECT x.delta::text, (coalesce(p.credit_balance, 0) + coalesce(b.delta, 0))::text AS balance
       FROM finance.card_credit_changes x
       JOIN finance.card_currencies p ON (p.owner_id, p.card_id, p.currency) = (x.owner_id, x.card_id, x.currency)
       LEFT JOIN finance.card_credit_balances b ON (b.owner_id, b.card_id, b.currency) = (p.owner_id, p.card_id, p.currency)
       WHERE x.owner_id = $1 AND x.event_id = $2 AND x.currency = $3`,
          [ownerId, eventId, currency],
        )
      ).rows[0];
    const credit = applied
      ? units(applied.balance) - units(applied.delta)
      : undefined;
    if (credit !== undefined && credit > maxUnits)
      return conflict("El saldo a favor resultante está fuera de rango.");
    if (line.anchored || delta === BigInt(0)) continue;
    if (
      line.kind === "card_purchase" &&
      delta >
        units(
          await minimumDebtFrom(
            client,
            ownerId,
            cardId,
            currency,
            effectiveOn,
            debt,
            eventId,
          ),
        )
    )
      return conflict(
        "La compra respalda pagos registrados. Revisá esos pagos antes de anularla.",
      );
    const restored = units(debt) - delta;
    if (restored > maxUnits)
      return conflict("La deuda resultante está fuera de rango.");
    updates.push({
      cardId,
      currency,
      debt: decimal(restored),
    });
  }
  for (const { cardId, currency, debt } of updates) {
    await client.query(
      "UPDATE finance.card_currencies SET debt = $4 WHERE owner_id = $1 AND card_id = $2 AND currency = $3",
      [ownerId, cardId, currency, debt],
    );
  }
}

export async function saveCreditOperation(
  client: pg.PoolClient,
  ownerId: string,
  command: CreditCommand,
  linkedCommandHash?: string,
) {
  const { idempotencyKey } = command;
  const hash =
    linkedCommandHash ??
    commandHash(["credit-operation-v1", JSON.stringify(command)]);
  await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay)
    return replay.status === "replayed"
      ? replay
      : conflict("Este envío ya se usó con otros datos.");

  if (command.action !== "purchase" || !command.mixed)
    return applyCreditOperation(client, ownerId, command, hash);

  // Domain conflicts must leave neither half of the purchase nor a revision.
  const id = randomUUID();
  await client.query("SAVEPOINT mixed_purchase");
  const result = await applyMixedPurchase(
    client,
    ownerId,
    command,
    command.mixed,
    hash,
    id,
  );
  if (result.status !== "created")
    await client.query("ROLLBACK TO SAVEPOINT mixed_purchase");
  await client.query("RELEASE SAVEPOINT mixed_purchase");
  return result;
}

async function applyMixedPurchase(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<CreditCommand, { action: "purchase" }>,
  mixed: MixedPurchase,
  hash: string,
  id: string,
) {
  if (mixed.correction) {
    const { eventId, planVersion } = mixed.correction;
    const {
      rows: [original],
    } = await client.query<{
      cancelled: boolean;
      version: number;
      assigned: boolean;
    }>(
      `SELECT coalesce(p.active_count < p.installment_count, false) AS cancelled,
              coalesce(p.version, 0) AS version,
              EXISTS (SELECT 1 FROM finance.current_card_cycles c
                WHERE (c.owner_id, c.purchase_id) = (m.owner_id, m.event_id)
                  AND c.assigned_period IS NOT NULL) AS assigned
         FROM finance.mixed_purchases m
         LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (m.owner_id, m.event_id)
        WHERE m.owner_id = $1 AND m.event_id = $2`,
      [ownerId, eventId],
    );
    if (!original) return { status: "not-found" } as const;
    if (planVersion !== original.version)
      return conflict(
        "El plan cambió. Actualizá la página antes de corregir la compra.",
      );
    if (original.cancelled)
      return conflict(
        "La compra tiene cuotas canceladas. Conservá el plan registrado o anulá la compra si corresponde.",
      );
    if (await refundsReady(client)) {
      const {
        rows: [previous],
      } = await client.query<{
        cardId: string;
        currency: Currency;
        amount: string;
      }>(
        `SELECT card_id AS "cardId", currency, (-delta)::text AS amount
          FROM finance.card_credit_changes WHERE owner_id = $1 AND event_id = $2 AND delta < 0`,
        [ownerId, eventId],
      );
      if (previous) {
        if (
          previous.cardId !== command.cardId ||
          previous.currency !== command.currency
        )
          return conflict(
            "La compensación registrada pertenece a la tarjeta y moneda originales.",
          );
        command = {
          ...command,
          creditApplied: command.creditApplied ?? previous.amount,
        };
      }
    }
    if (original.assigned)
      return conflict(
        "Restablecé las asignaciones manuales de la compra al resumen antes de corregirla.",
      );
    const blocked = await reverseCreditDebt(client, ownerId, eventId);
    if (blocked) return blocked;
    await client.query(
      "SET CONSTRAINTS finance.audit_changes_owner_id_replacement_event_id_fkey DEFERRED",
    );
    await recordRevision(
      client,
      ownerId,
      { eventId, idempotencyKey: command.idempotencyKey },
      hash,
      id,
    );
  }
  const result = await applyCreditOperation(client, ownerId, command, hash, id);
  if (mixed.correction && result.status === "created")
    await client.query(
      "SET CONSTRAINTS finance.audit_changes_owner_id_replacement_event_id_fkey IMMEDIATE",
    );
  return result;
}

async function applyCreditOperation(
  client: pg.PoolClient,
  ownerId: string,
  command: CreditCommand,
  hash: string,
  eventId?: string,
) {
  const { cardId, effectiveOn, idempotencyKey, action } = command;
  const {
    rows: [card],
  } = await client.query<{ name: string; archived: boolean }>(
    "SELECT name, archived_at IS NOT NULL AS archived FROM finance.cards WHERE owner_id = $1 AND id = $2 AND kind = 'credit'",
    [ownerId, cardId],
  );
  if (!card) return { status: "not-found" } as const;
  const correction =
    action === "purchase" ? command.mixed?.correction : undefined;
  if (
    card.archived &&
    action === "purchase" &&
    !(
      correction &&
      (
        await client.query(
          "SELECT 1 FROM finance.credit_lines WHERE owner_id = $1 AND event_id = $2 AND card_id = $3 AND currency = $4",
          [ownerId, correction.eventId, cardId, command.currency],
        )
      ).rowCount
    )
  )
    return conflict("La tarjeta está archivada.");

  const positions = await listPositions(client, ownerId, cardId);
  const event = { cardId, effectiveOn, idempotencyKey };
  if (action === "payment") {
    const bankDebits = new Map<Currency, bigint>();
    const lines: RecordedLine[] = [];
    const purchases = command.lines.some(
      ({ allocations }) => allocations.length,
    )
      ? new Map(
          (await listCreditPurchaseOptions(client, ownerId)).map((purchase) => [
            purchase.id,
            purchase,
          ]),
        )
      : new Map<string, CreditPurchaseOption>();
    for (const line of command.lines) {
      const { currency, bankCurrency } = line;
      const position = positions.get(currency);
      if (!position)
        return conflict("La moneda no está habilitada en la tarjeta.");
      if (position.reference && effectiveOn < position.reference)
        return conflict(
          "El pago es anterior a la fecha de referencia de la deuda.",
        );
      if (
        await hasLaterCreditChange(
          client,
          ownerId,
          cardId,
          currency,
          effectiveOn,
        )
      )
        return conflict(
          "El pago es anterior a una devolución o uso de saldo a favor. Revisá la conciliación.",
        );
      const paid = units(line.amount);
      if (
        paid > units(position.debt) ||
        paid >
          units(
            await minimumDebtFrom(
              client,
              ownerId,
              cardId,
              currency,
              effectiveOn,
              position.debt,
            ),
          )
      )
        return conflict(
          `El pago supera la deuda disponible en ${currency} para esa fecha.`,
        );
      let allocated = BigInt(0);
      for (const allocation of line.allocations) {
        const purchase = purchases.get(allocation.purchaseId);
        const applied = units(allocation.amount);
        if (
          !purchase ||
          purchase.cardId !== cardId ||
          purchase.currency !== currency ||
          purchase.effectiveOn > effectiveOn ||
          applied > units(purchase.amount)
        )
          return conflict(
            "Una compra elegida ya no está disponible por ese importe.",
          );
        allocated += applied;
      }
      if (allocated > paid)
        return conflict(
          "La asignación a compras supera el pago en esa moneda.",
        );
      bankDebits.set(
        bankCurrency,
        (bankDebits.get(bankCurrency) ?? BigInt(0)) +
          units(line.bankAmount) +
          units(line.fee),
      );
      lines.push({
        currency,
        amount: line.amount,
        debtDelta: `-${line.amount}`,
        debtAfter: decimal(units(position.debt) - paid),
        payment: line,
      });
    }
    const balances = await listBankBalances(client, ownerId, [
      ...bankDebits.keys(),
    ]);
    for (const [currency, debit] of bankDebits) {
      const bank = balances.find((balance) => balance.currency === currency);
      if (!bank) return conflict(`Configurá un saldo bancario en ${currency}.`);
      if (debit > maxUnits)
        return conflict(
          `El importe bancario total en ${currency} está fuera de rango.`,
        );
      // A bank anchor already includes payments before its date.
      if (
        effectiveOn >= bank.asOfDate &&
        debit > units(bank.calculatedAmount ?? bank.amount)
      )
        return conflict(`Saldo bancario insuficiente en ${currency}.`);
    }
    const id = await insertCreditEvent(
      client,
      ownerId,
      {
        ...event,
        kind: "card_payment",
        concept: `Pago de tarjeta · ${card.name}`,
        lines,
      },
      hash,
      bankDebits,
    );
    return { status: "created", id } as const;
  }

  const { currency, amount } = command;
  const position = positions.get(currency);
  if (!position) return conflict("La moneda no está habilitada en la tarjeta.");
  const debt = Money.parse(position.debt, currency);
  if (action === "adjustment") {
    if (
      await hasLaterCreditChange(client, ownerId, cardId, currency, effectiveOn)
    )
      return conflict(
        "El ajuste es anterior a una devolución o uso de saldo a favor.",
      );
    if (command.expectedDebt !== debt.toDecimal())
      return conflict(
        "La deuda cambió. Actualizá la página y revisá el importe.",
      );
    if (
      (position.latest && effectiveOn < position.latest) ||
      (position.reference && effectiveOn < position.reference)
    )
      return conflict(
        "Usá una fecha igual o posterior al último movimiento de deuda registrado.",
      );
    const delta = Money.parse(amount, currency).add(debt.negate()).toDecimal();
    const id = await insertCreditEvent(
      client,
      ownerId,
      {
        ...event,
        kind: "card_adjustment",
        concept: `Ajuste de deuda · ${card.name}`,
        lines: [{ currency, amount, debtDelta: delta, debtAfter: amount }],
      },
      hash,
    );
    return { status: "created", id } as const;
  }

  if (
    command.covered &&
    (!position.reference || effectiveOn > position.reference)
  )
    return conflict(
      "La compra solo puede estar incluida en una deuda confirmada de esa fecha o posterior.",
    );
  if (
    !command.covered &&
    amount !== zero &&
    position.reference &&
    effectiveOn <= position.reference
  ) {
    const earlier =
      effectiveOn < position.reference ||
      (correction &&
        (
          await client.query(
            `SELECT 1 FROM finance.credit_lines l
           JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
           JOIN finance.bank_event_positions original ON original.owner_id = f.owner_id AND original.id = $2
          WHERE l.owner_id = $1 AND l.card_id = $3 AND l.currency = $4 AND f.effective_on = $5
            AND f.kind IN ('card_opening', 'card_adjustment') AND f.status = 'confirmed'
            AND f.created_at > original.bank_recorded_at`,
            [ownerId, correction.eventId, cardId, currency, effectiveOn],
          )
        ).rowCount);
    if (earlier)
      return conflict(
        "La compra es anterior a la deuda confirmada. Verificá si ya está incluida.",
      );
  }
  const applied = command.creditApplied
    ? units(command.creditApplied)
    : BigInt(0);
  if (
    applied &&
    (!(await refundsReady(client)) ||
      command.covered ||
      applied > units(amount) ||
      applied > units(position.creditBalance) ||
      (position.latestActivity && effectiveOn < position.latestActivity))
  )
    return conflict(
      "Revisá el saldo a favor disponible y la fecha de la compensación.",
    );
  if (
    !command.covered &&
    amount !== zero &&
    (await hasLaterCreditChange(client, ownerId, cardId, currency, effectiveOn))
  )
    return conflict(
      "El cargo es anterior a una devolución o uso de saldo a favor. Revisá la conciliación.",
    );
  const charge = decimal(units(amount) - applied);
  let debtAfter = debt.toDecimal();
  try {
    if (!command.covered)
      debtAfter = debt.add(Money.parse(charge, currency)).toDecimal();
  } catch {
    return conflict("La deuda resultante está fuera de rango.");
  }
  const { mixed } = command;
  const bankDebits = new Map<Currency, bigint>();
  const categories: PurchaseCategory[] = [];
  if (mixed) {
    if (mixed.debitCardId) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM finance.card_currencies p
          JOIN finance.cards c ON (c.owner_id, c.id) = (p.owner_id, p.card_id)
         WHERE p.owner_id = $1 AND p.card_id = $2 AND p.currency = $3
           AND p.kind = 'debit' AND c.archived_at IS NULL
         UNION ALL
         SELECT 1 FROM finance.mixed_purchases m
          WHERE m.owner_id = $1 AND m.debit_card_id = $2 AND m.currency = $3 AND m.event_id = $4`,
        [ownerId, mixed.debitCardId, currency, correction?.eventId ?? null],
      );
      if (!rowCount)
        return conflict(
          "La tarjeta de débito no está disponible en esa moneda.",
        );
    }
    const [bank] = await listBankBalances(client, ownerId, [currency]);
    if (!bank) return conflict(`Configurá un saldo bancario en ${currency}.`);
    const debit = units(mixed.debitAmount);
    if (
      effectiveOn >= bank.asOfDate &&
      debit > units(bank.calculatedAmount ?? bank.amount)
    ) {
      // A same-day replacement can be before the latest checkpoint.
      const covered =
        mixed.correction &&
        (
          await client.query(
            `SELECT 1 FROM finance.bank_event_positions original
           CROSS JOIN LATERAL (
             SELECT as_of_date, created_at FROM finance.balance_checkpoints
              WHERE owner_id = $1 AND currency = $3
              ORDER BY as_of_date DESC, created_at DESC, id DESC LIMIT 1
           ) b
          WHERE original.owner_id = $1 AND original.id = $2
            AND ($4::date, original.bank_recorded_at) <= (b.as_of_date, b.created_at)`,
            [ownerId, mixed.correction.eventId, currency, effectiveOn],
          )
        ).rowCount;
      if (!covered)
        return conflict(`Saldo bancario insuficiente en ${currency}.`);
    }
    bankDebits.set(currency, debit);
    for (const split of mixed.categories) {
      const categoryId = await resolvePurchaseCategory(
        client,
        ownerId,
        split.categoryId,
        correction?.eventId,
      );
      if (
        categoryId === undefined ||
        categories.some(
          (row) => row.method === split.method && row.categoryId === categoryId,
        )
      )
        return conflict(
          "Revisá que las categorías estén disponibles y no se repitan por medio.",
        );
      categories.push({ ...split, categoryId });
    }
  }
  const categoryId = await resolvePurchaseCategory(
    client,
    ownerId,
    command.categoryId,
    correction?.eventId,
  );
  if (categoryId === undefined)
    return conflict("La categoría no está disponible.");
  const id = await insertCreditEvent(
    client,
    ownerId,
    {
      ...event,
      kind: "card_purchase",
      concept: command.concept,
      note: command.note,
      categoryId,
      mixed: !!mixed,
      lines: [
        {
          currency,
          amount,
          debtDelta: command.covered ? zero : charge,
          debtAfter,
          ...(applied && {
            creditDelta: "-" + command.creditApplied,
          }),
        },
      ],
    },
    hash,
    bankDebits,
    eventId,
  );
  if (command.plan) {
    await insertInstallmentVersion(client, ownerId, id, currency, {
      ...command.plan,
      version: 1,
      activeCount: command.plan.count,
      change: "created",
    });
  }
  if (mixed) {
    await client.query(
      "INSERT INTO finance.mixed_purchases (owner_id, event_id, currency, debit_card_id) VALUES ($1, $2, $3, $4)",
      [ownerId, id, currency, mixed.debitCardId],
    );
    if (categories.length)
      await client.query(
        `INSERT INTO finance.mixed_purchase_categories (owner_id, event_id, method, category_id, amount)
         SELECT $1, $2, method, category_id, amount
           FROM jsonb_to_recordset($3::jsonb) AS split(method text, category_id uuid, amount numeric)`,
        [
          ownerId,
          id,
          JSON.stringify(
            categories.map(({ method, categoryId, amount }) => ({
              method,
              category_id: categoryId,
              amount,
            })),
          ),
        ],
      );
  }
  return { status: "created", id } as const;
}

async function resolvePurchaseCategory(
  client: pg.PoolClient,
  ownerId: string,
  categoryId: string | null,
  original?: string,
) {
  const category = await resolveMovementCategory(
    client,
    ownerId,
    "expense",
    categoryId,
  );
  if (category !== undefined || !original || !categoryId) return category;
  const { rowCount } = await client.query(
    `SELECT 1 FROM finance.mixed_purchase_categories
      WHERE owner_id = $1 AND event_id = $2 AND category_id = $3
     UNION ALL
     SELECT 1 FROM finance.credit_operations
      WHERE owner_id = $1 AND event_id = $2 AND category_id = $3`,
    [ownerId, original, categoryId],
  );
  return rowCount ? categoryId : undefined;
}

export async function reviseInstallments(
  client: pg.PoolClient,
  ownerId: string,
  command: InstallmentRevision,
  today = bankReferenceToday(),
) {
  const { eventId, idempotencyKey, expectedVersion } = command;
  const hash = commandHash(["credit-installments-v1", JSON.stringify(command)]);
  // Share the event/void idempotency namespace and lock order with credit writes.
  await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay)
    return replay.status === "replayed"
      ? replay
      : conflict("Este envío ya se usó con otros datos.");

  const withMixed = await mixedPurchasesReady(client);
  const {
    rows: [current],
  } = await client.query<
    InstallmentVersion & { currency: Currency; status: string; mixed: boolean }
  >(
    `SELECT p.version, p.currency, f.status, p.installment_amount::text AS "installmentAmount",
            ${withMixed ? "m.event_id IS NOT NULL" : "false"} AS mixed,
            p.installment_count AS count, p.active_count AS "activeCount", to_char(p.first_period, 'YYYY-MM') AS "firstPeriod"
       FROM finance.current_installment_plans p
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (p.owner_id, p.event_id)
       ${withMixed ? "LEFT JOIN finance.mixed_purchases m ON (m.owner_id, m.event_id) = (p.owner_id, p.event_id)" : ""}
      WHERE p.owner_id = $1 AND p.event_id = $2 AND f.kind = 'card_purchase'`,
    [ownerId, eventId],
  );
  if (!current) return { status: "not-found" } as const;
  if (current.status !== "confirmed")
    return conflict("La compra ya fue anulada.");
  if (current.version !== expectedVersion)
    return conflict("El plan cambió. Actualizá la página antes de corregirlo.");

  if (await hasLinkedRefund(client, ownerId, eventId))
    return conflict(
      "El plan tiene devoluciones vinculadas. Revisalas desde la compra antes de cambiarlo.",
    );
  const editing = command.action === "edit-installments";
  const shared = await isSharedExpense(client, ownerId, eventId);
  if (shared && !editing)
    return conflict(
      "La cancelación requiere corregir las obligaciones vinculadas a la compra.",
    );
  const terms = editing ? command.plan : current;
  const hasCancellations = current.activeCount !== current.count;
  let activeCount = current.activeCount;
  if (editing) {
    if (hasCancellations && terms.count !== current.count)
      return conflict(
        "La cantidad original queda fija después de confirmar una cancelación.",
      );
    try {
      const total = installmentTotal(terms, current.currency);
      if (
        (current.mixed || shared) &&
        total !== installmentTotal(current, current.currency)
      )
        return conflict(
          "El plan debe conservar el total de la porción de crédito. Para cambiarlo, corregí la compra completa.",
        );
    } catch {
      return conflict("El total financiado está fuera de rango.");
    }
    if (!hasCancellations) activeCount = terms.count;
  } else {
    activeCount = Array.from({ length: current.activeCount }, (_, offset) =>
      installmentPeriodAt(current.firstPeriod, offset),
    ).indexOf(command.fromPeriod);
    if (activeCount === -1 || command.fromPeriod <= today.slice(0, 7))
      return conflict(
        "Elegí el primer mes futuro de las cuotas que canceló el emisor.",
      );
  }

  await insertInstallmentVersion(client, ownerId, eventId, current.currency, {
    ...terms,
    version: current.version + 1,
    activeCount,
    change: editing ? "edited" : "cancelled",
  });
  await client.query(
    `INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type, idempotency_key, command_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      ownerId,
      randomUUID(),
      eventId,
      editing ? "installment_edited" : "installment_cancelled",
      idempotencyKey,
      hash,
    ],
  );
  return { status: "created", id: eventId } as const;
}
