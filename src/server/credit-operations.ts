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
  OpeningDebt,
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
import {
  commandHash,
  findReplay,
  recordRevision,
  resolveMovementCategory,
} from "./movements.ts";

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
  payment?: CreditPaymentLine;
};
type CreditEvent = {
  cardId: string;
  effectiveOn: string;
  idempotencyKey: string;
  kind: "card_purchase" | "card_payment" | "card_opening" | "card_adjustment";
  concept: string;
  categoryId?: string | null;
  note?: string | null;
  lines: RecordedLine[];
};

async function insertCreditEvent(
  client: pg.PoolClient,
  ownerId: string,
  event: CreditEvent,
  hash: string,
  bankDebits = new Map<Currency, bigint>(),
) {
  const id = randomUUID();
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
    payment,
  } of event.lines) {
    await client.query(
      `INSERT INTO finance.credit_lines
        (owner_id, event_id, card_id, currency, amount, debt_delta, debt_after, bank_currency, bank_amount, fee)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
      ],
    );
    await client.query(
      `UPDATE finance.card_currencies SET debt = $4
        WHERE owner_id = $1 AND card_id = $2 AND currency = $3`,
      [ownerId, cardId, currency, debtAfter],
    );
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
      [ownerId, randomUUID(), id, currency, decimal(debit), effectiveOn],
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
  reference: string | null;
  latest: string | null;
};

async function listPositions(
  client: pg.PoolClient,
  ownerId: string,
  cardId: string,
) {
  const { rows } = await client.query<Position>(
    `SELECT p.currency, coalesce(p.debt, 0)::text AS debt,
            to_char(activity.reference, 'YYYY-MM-DD') AS reference,
            to_char(activity.latest, 'YYYY-MM-DD') AS latest
       FROM finance.card_currencies p
       CROSS JOIN LATERAL (
         SELECT max(f.effective_on) FILTER (WHERE f.kind IN ('card_opening', 'card_adjustment')) AS reference,
                max(f.effective_on) FILTER (WHERE l.debt_delta <> 0) AS latest
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

async function minimumDebtFrom(
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
  const { rows } = await client.query<CreditPurchaseOption>(
    `SELECT f.id, l.card_id AS "cardId", f.concept, l.currency,
            to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
            (l.amount - coalesce(used.total, 0))::text AS amount
       FROM finance.credit_lines l
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
       LEFT JOIN LATERAL (
         SELECT sum(a.amount) AS total
           FROM finance.credit_allocations a
           JOIN finance.financial_events payment ON (payment.owner_id, payment.id) = (a.owner_id, a.payment_id)
          WHERE (a.owner_id, a.purchase_id, a.currency) = (l.owner_id, l.event_id, l.currency)
            AND payment.status = 'confirmed'
       ) used ON true
      WHERE l.owner_id = $1 AND f.kind = 'card_purchase' AND f.status = 'confirmed'
        AND l.amount > coalesce(used.total, 0)
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

  const updates: { cardId: string; currency: Currency; debt: string }[] = [];
  for (const line of rows) {
    const { cardId, currency, effectiveOn, debt } = line;
    const delta = units(line.delta);
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
    updates.push({ cardId, currency, debt: decimal(restored) });
  }
  for (const { cardId, currency, debt } of updates) {
    await client.query(
      "UPDATE finance.card_currencies SET debt = $4 WHERE owner_id = $1 AND card_id = $2 AND currency = $3",
      [ownerId, cardId, currency, debt],
    );
  }
  return recordRevision(client, ownerId, command, hash, null);
}

export async function saveCreditOperation(
  client: pg.PoolClient,
  ownerId: string,
  command: CreditCommand,
) {
  const { cardId, effectiveOn, idempotencyKey, action } = command;
  const hash = commandHash(["credit-operation-v1", JSON.stringify(command)]);
  await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay)
    return replay.status === "replayed"
      ? replay
      : conflict("Este envío ya se usó con otros datos.");

  const {
    rows: [card],
  } = await client.query<{ name: string; archived: boolean }>(
    "SELECT name, archived_at IS NOT NULL AS archived FROM finance.cards WHERE owner_id = $1 AND id = $2 AND kind = 'credit'",
    [ownerId, cardId],
  );
  if (!card) return { status: "not-found" } as const;
  if (card.archived && action === "purchase")
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
    effectiveOn < position.reference
  )
    return conflict(
      "La compra es anterior a la deuda confirmada. Verificá si ya está incluida.",
    );
  let debtAfter = debt.toDecimal();
  try {
    if (!command.covered)
      debtAfter = debt.add(Money.parse(amount, currency)).toDecimal();
  } catch {
    return conflict("La deuda resultante está fuera de rango.");
  }
  const categoryId = await resolveMovementCategory(
    client,
    ownerId,
    "expense",
    command.categoryId,
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
      lines: [
        {
          currency,
          amount,
          debtDelta: command.covered ? zero : amount,
          debtAfter,
        },
      ],
    },
    hash,
  );
  if (command.plan) {
    await insertInstallmentVersion(client, ownerId, id, currency, {
      ...command.plan,
      version: 1,
      activeCount: command.plan.count,
      change: "created",
    });
  }
  return { status: "created", id } as const;
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

  const {
    rows: [current],
  } = await client.query<
    InstallmentVersion & { currency: Currency; status: string }
  >(
    `SELECT p.version, p.currency, f.status, p.installment_amount::text AS "installmentAmount",
            p.installment_count AS count, p.active_count AS "activeCount", to_char(p.first_period, 'YYYY-MM') AS "firstPeriod"
       FROM finance.current_installment_plans p
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (p.owner_id, p.event_id)
      WHERE p.owner_id = $1 AND p.event_id = $2 AND f.kind = 'card_purchase'`,
    [ownerId, eventId],
  );
  if (!current) return { status: "not-found" } as const;
  if (current.status !== "confirmed")
    return conflict("La compra ya fue anulada.");
  if (current.version !== expectedVersion)
    return conflict("El plan cambió. Actualizá la página antes de corregirlo.");

  const editing = command.action === "edit-installments";
  const terms = editing ? command.plan : current;
  const hasCancellations = current.activeCount !== current.count;
  let activeCount = current.activeCount;
  if (editing) {
    if (hasCancellations && terms.count !== current.count)
      return conflict(
        "La cantidad original queda fija después de confirmar una cancelación.",
      );
    try {
      installmentTotal(terms, current.currency);
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
