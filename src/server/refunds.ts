import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import { installmentPeriodAt } from "../domain/installments.ts";
import type { Currency } from "../domain/money.ts";
import {
  amountUnits,
  refundDecimal,
  refundPartKey,
  type RefundCommand,
  type RefundEntry,
  type RefundPart,
  type RefundPartStatus,
  unmatchedRefund,
} from "../domain/refunds.ts";
import { listBankBalances, lockBankWrites } from "./bank-balances.ts";
import {
  insertCreditEvent,
  listPositions,
  lockCardWrites,
  minimumDebtFrom,
} from "./credit-operations.ts";
import { commandHash, findReplay, recordRevision } from "./movements.ts";
import { hasLaterCreditChange, refundsReady } from "./refund-schema.ts";

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;
const missing = { status: "not-found" } as const;
const zero = "0.0000";
const maxUnits = amountUnits("9999999999999999.9999");

type Purchase = {
  id: string;
  concept: string;
  effectiveOn: string;
  currency: Currency;
  cardId: string | null;
  card: string | null;
  debitCard: string | null;
  mixed: boolean;
  parts: RefundPartStatus[];
  installments: { ordinal: number; period: string; amount: string }[];
};

async function findPurchase(
  client: pg.PoolClient,
  ownerId: string,
  purchaseId: string,
) {
  const {
    rows: [purchase],
  } = await client.query<
    Omit<Purchase, "parts" | "installments"> & {
      debit: string | null;
      credit: string | null;
      categoryId: string | null;
      activeCount: number | null;
      firstPeriod: string | null;
      installmentAmount: string | null;
      cancelled: number[];
    }
  >(
    `SELECT f.id, f.concept, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
       coalesce(l.currency, e.currency) AS currency, o.card_id AS "cardId", cc.name AS card,
       dc.name AS "debitCard", d.id IS NOT NULL AS mixed,
       coalesce(d.amount, -e.amount_signed)::text AS debit,
       coalesce(p.installment_count * p.installment_amount, l.amount)::text AS credit,
       coalesce(o.category_id, m.category_id) AS "categoryId",
       p.active_count AS "activeCount", to_char(p.first_period, 'YYYY-MM') AS "firstPeriod",
       p.installment_amount::text AS "installmentAmount",
       ARRAY(SELECT i.ordinal FROM finance.active_refund_installments i
          WHERE (i.owner_id, i.purchase_id) = (f.owner_id, f.id)) AS cancelled
     FROM finance.financial_events f
     LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
     LEFT JOIN finance.bank_effects e ON (e.owner_id, e.event_id, e.id) = (m.owner_id, m.event_id, m.event_id)
     LEFT JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
     LEFT JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (o.owner_id, o.event_id)
     LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (f.owner_id, f.id)
     LEFT JOIN finance.mixed_purchase_debits d ON (d.owner_id, d.id) = (f.owner_id, f.id)
     LEFT JOIN finance.mixed_purchases mix ON (mix.owner_id, mix.event_id) = (f.owner_id, f.id)
     LEFT JOIN finance.cards dc ON (dc.owner_id, dc.id) = (mix.owner_id, mix.debit_card_id)
     LEFT JOIN finance.cards cc ON (cc.owner_id, cc.id) = (o.owner_id, o.card_id)
     WHERE f.owner_id = $1 AND f.id = $2 AND f.status = 'confirmed'
       AND ((f.kind = 'expense' AND m.method = 'debit' AND e.amount_signed < 0)
         OR (f.kind = 'card_purchase' AND l.event_id IS NOT NULL))
       AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
         WHERE (s.owner_id, s.event_id) = (f.owner_id, f.id))`,
    [ownerId, purchaseId],
  );
  if (!purchase) return;
  const {
    debit,
    credit,
    categoryId,
    firstPeriod,
    activeCount,
    installmentAmount,
    cancelled,
    ...details
  } = purchase;
  const { rows: parts } = await client.query<RefundPartStatus>(
    `WITH original AS (
      SELECT method, category_id, amount FROM finance.mixed_purchase_categories
       WHERE owner_id = $1 AND event_id = $2
    ), purchased AS (
      SELECT * FROM original
      UNION ALL
      SELECT method, $3::uuid, amount FROM (VALUES ('debit', $4::numeric), ('credit', $5::numeric)) p(method, amount)
       WHERE p.amount > 0 AND NOT EXISTS (SELECT 1 FROM original s WHERE s.method = p.method)
    ), used AS (
      SELECT x.method, x.category_id,
        coalesce(sum(x.amount) FILTER (WHERE r.action = 'credit'), 0) AS credited,
        coalesce(sum(x.amount) FILTER (WHERE r.action = 'cancel_installments'), 0) AS cancelled,
        sum(x.overlap) AS overlap
        FROM finance.purchase_refunds r
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
        JOIN finance.refund_parts x ON (x.owner_id, x.event_id) = (r.owner_id, r.event_id)
       WHERE r.owner_id = $1 AND r.purchase_id = $2 AND f.status = 'confirmed'
       GROUP BY x.method, x.category_id
    ), legacy AS (
      SELECT (p.installment_count - p.active_count) * p.installment_amount AS amount
        FROM finance.current_installment_plans p WHERE p.owner_id = $1 AND p.event_id = $2
    )
    SELECT p.method, p.category_id AS "categoryId", c.name AS category, p.amount::text,
       coalesce(u.credited, 0)::text AS credited, coalesce(u.cancelled, 0)::text AS cancelled,
       coalesce(u.overlap, 0)::text AS overlap,
       (p.amount - coalesce(u.credited + u.cancelled - u.overlap, 0) -
         CASE WHEN p.method = 'credit' AND NOT EXISTS (SELECT 1 FROM original)
           THEN coalesce((SELECT amount FROM legacy), 0) ELSE 0 END)::text AS remaining
      FROM purchased p
      LEFT JOIN used u ON u.method = p.method AND u.category_id IS NOT DISTINCT FROM p.category_id
      LEFT JOIN finance.categories c ON c.owner_id = $1 AND c.id = p.category_id
     ORDER BY p.method DESC, c.name NULLS LAST, p.category_id`,
    [ownerId, purchaseId, categoryId, debit, credit],
  );
  // Old tail cancellations may exist on mixed purchases. Use their exact
  // surviving category allocations from the existing projection.
  if (details.mixed && firstPeriod && activeCount !== null) {
    const { rows } = await client.query<{
      categoryId: string | null;
      amount: string;
    }>(
      `SELECT category_id AS "categoryId", sum(amount)::text AS amount FROM finance.mixed_purchase_expenses
        WHERE owner_id = $1 AND id = $2 AND method = 'credit' GROUP BY category_id`,
      [ownerId, purchaseId],
    );
    for (const part of parts.filter(({ method }) => method === "credit")) {
      const amount =
        rows.find((row) => row.categoryId === part.categoryId)?.amount ?? zero;

      part.remaining = refundDecimal(
        amountUnits(amount) -
          amountUnits(part.credited) +
          amountUnits(part.overlap),
      );
    }
  }
  const installments =
    firstPeriod && installmentAmount
      ? Array.from({ length: activeCount ?? 0 }, (_, index) => ({
          ordinal: index + 1,
          period: installmentPeriodAt(firstPeriod, index),
          amount: installmentAmount,
        })).filter(({ ordinal }) => !cancelled.includes(ordinal))
      : [];
  return { ...details, parts, installments } satisfies Purchase;
}

export const refundHistorySource = `FROM finance.financial_events f
  LEFT JOIN finance.purchase_refunds r ON (r.owner_id, r.event_id) = (f.owner_id, f.id)
  LEFT JOIN finance.financial_events purchase ON (purchase.owner_id, purchase.id) = (r.owner_id, r.purchase_id)
  LEFT JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
  LEFT JOIN finance.cards card ON (card.owner_id, card.id) = (l.owner_id, l.card_id)
  LEFT JOIN finance.card_credit_changes x ON (x.owner_id, x.event_id, x.currency) = (l.owner_id, l.event_id, l.currency)
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(child.applied_amount), 0) AS amount FROM finance.purchase_refunds child
    JOIN finance.financial_events confirmed ON (confirmed.owner_id, confirmed.id) = (child.owner_id, child.event_id)
    WHERE child.owner_id = f.owner_id AND child.pending_id = f.id AND confirmed.status = 'confirmed'
  ) applied ON r.action = 'pending'`;

export const refundHistoryStatus = `CASE WHEN f.status = 'confirmed' AND r.action = 'pending'
  AND r.amount > applied.amount THEN 'pending' ELSE f.status END`;
export const refundHistoryAmount = "coalesce(r.amount, l.amount)";
export const refundHistoryCurrency = "coalesce(r.currency, l.currency)";

const detailFields = `f.id, r.purchase_id AS "purchaseId", purchase.concept AS "purchaseConcept",
  r.pending_id AS "pendingId", coalesce(r.action, 'return_balance') AS action,
  ${refundHistoryStatus} AS status, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
  ${refundHistoryCurrency} AS currency, ${refundHistoryAmount}::text AS amount,
  (r.amount - coalesce(applied.amount, 0))::text AS remaining, l.card_id AS "cardId", card.name AS card,
  coalesce(-l.debt_delta, 0)::text AS "debtReduced", coalesce(x.delta, 0)::text AS "creditDelta",
  ARRAY(SELECT ordinal FROM finance.refund_installments i WHERE (i.owner_id, i.event_id) = (f.owner_id, f.id)
        ORDER BY ordinal) AS ordinals,
  ARRAY(SELECT jsonb_build_object('method', p.method, 'categoryId', p.category_id, 'amount', p.amount::text, 'category', c.name, 'overlap', p.overlap::text)
    FROM finance.refund_parts p LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (p.owner_id, p.category_id)
    WHERE (p.owner_id, p.event_id) = (f.owner_id, f.id) ORDER BY p.method DESC, c.name, p.category_id) AS parts`;

export async function getRefundEntry(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const {
    rows: [entry],
  } = await client.query<RefundEntry>(
    `SELECT ${detailFields} ${refundHistorySource}
     WHERE f.owner_id = $1 AND f.id = $2 AND f.kind IN ('purchase_refund', 'card_credit_return')`,
    [ownerId, eventId],
  );
  return entry;
}

export async function getPurchaseRefunds(
  client: pg.PoolClient,
  ownerId: string,
  purchaseId: string,
) {
  if (!(await refundsReady(client))) return;
  const purchase = await findPurchase(client, ownerId, purchaseId);
  if (!purchase) return;
  const { rows: entries } = await client.query<RefundEntry>(
    `SELECT ${detailFields} ${refundHistorySource} WHERE r.owner_id = $1 AND r.purchase_id = $2
     ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC`,
    [ownerId, purchaseId],
  );
  return { ...purchase, entries };
}
export type PurchaseRefunds = NonNullable<
  Awaited<ReturnType<typeof getPurchaseRefunds>>
>;

async function cancelledParts(
  client: pg.PoolClient,
  ownerId: string,
  purchase: Purchase,
  ordinals: number[],
) {
  const { rows } = await client.query<RefundPart>(
    `SELECT 'credit' AS method, category_id AS "categoryId", sum(amount)::text AS amount
     FROM finance.${purchase.mixed ? "mixed_purchase_expenses" : "credit_expenses"}
     WHERE owner_id = $1 AND id = $2 AND installment_ordinal = ANY($3::int[]) GROUP BY category_id`,
    [ownerId, purchase.id, ordinals],
  );
  return rows;
}

async function ensureBank(
  client: pg.PoolClient,
  ownerId: string,
  currency: Currency,
) {
  return (await listBankBalances(client, ownerId, [currency])).length > 0;
}

async function recordBankCredit(
  client: pg.PoolClient,
  ownerId: string,
  id: string,
  currency: Currency,
  amount: string,
  effectiveOn: string,
) {
  await client.query(
    `INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
     VALUES ($1, $2, $2, $3, $4, $5)`,
    [ownerId, id, currency, amount, effectiveOn],
  );
}

export async function saveRefund(
  client: pg.PoolClient,
  ownerId: string,
  command: RefundCommand,
  today = bankReferenceToday(),
) {
  if (!(await refundsReady(client)))
    return conflict("Actualizá la base de datos para registrar devoluciones.");
  await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const hash = commandHash(["refund-v1", JSON.stringify(command)]);
  const replay = await findReplay(
    client,
    ownerId,
    command.idempotencyKey,
    hash,
  );
  if (replay)
    return replay.status === "replayed"
      ? replay
      : conflict("Este envío ya se usó con otros datos.");

  if (command.action === "void")
    return voidRefund(client, ownerId, command, hash);
  if (command.action === "return_balance")
    return returnBalance(client, ownerId, command, hash);
  const purchase = await findPurchase(client, ownerId, command.purchaseId);
  if (!purchase) return missing;
  if (command.effectiveOn < purchase.effectiveOn)
    return conflict("La devolución no puede ser anterior a la compra.");

  let parts: RefundPart[] = [];

  const purchased = new Map(
    purchase.parts.map((part) => [refundPartKey(part), part]),
  );
  const overlaps = command.action !== "pending" && command.overlaps;
  if (command.action === "credit") parts = command.parts;
  if (command.action === "cancel_installments") {
    if (
      command.ordinals.some(
        (ordinal) =>
          !purchase.installments.some(
            (slot) =>
              slot.ordinal === ordinal && slot.period > today.slice(0, 7),
          ),
      )
    )
      return conflict("Elegí cuotas futuras vigentes que canceló el emisor.");
    parts = await cancelledParts(client, ownerId, purchase, command.ordinals);
  }
  const total =
    command.action === "pending"
      ? amountUnits(command.amount)
      : parts.reduce((sum, part) => sum + amountUnits(part.amount), BigInt(0));

  let alreadyApplied = BigInt(0);
  const accepted: (RefundPart & { overlap: string })[] = [];
  const exceeds = conflict(
    "El importe supera lo que queda por devolver en la compra, el medio o la categoría.",
  );
  if (total <= BigInt(0) || total > maxUnits) return exceeds;
  if (
    command.action === "pending" &&
    total >
      purchase.parts.reduce(
        (sum, part) => sum + amountUnits(part.remaining),
        BigInt(0),
      )
  )
    return exceeds;
  for (const part of parts) {
    const original = purchased.get(refundPartKey(part));
    if (!original) return exceeds;
    const amount = amountUnits(part.amount);
    const opposite = unmatchedRefund(original, command.action);
    const overlap =
      overlaps && opposite > BigInt(0)
        ? amount < opposite
          ? amount
          : opposite
        : BigInt(0);
    if (amount - overlap > amountUnits(original.remaining)) return exceeds;
    alreadyApplied += overlap;
    accepted.push({ ...part, overlap: refundDecimal(overlap) });
  }
  if (overlaps && !alreadyApplied)
    return conflict(
      "No hay un abono o cuotas canceladas de esta categoría que coincidan con la devolución.",
    );
  const applied = total - alreadyApplied;
  const pendingId = command.action === "pending" ? null : command.pendingId;
  if (pendingId) {
    const pending = await getRefundEntry(client, ownerId, pendingId);
    if (
      !pending ||
      pending.purchaseId !== purchase.id ||
      pending.status !== "pending"
    )
      return missing;
    if (
      command.effectiveOn < pending.effectiveOn ||
      applied > amountUnits(pending.remaining)
    )
      return conflict(
        "Revisá la fecha y el importe que quedan pendientes en esta solicitud.",
      );
  }

  const bank =
    command.action === "credit"
      ? parts
          .filter(({ method }) => method === "debit")
          .reduce((sum, part) => sum + amountUnits(part.amount), BigInt(0))
      : BigInt(0);
  const card = command.action === "credit" ? total - bank : BigInt(0);
  const { currency, cardId } = purchase;
  if (bank && !(await ensureBank(client, ownerId, currency)))
    return conflict(`Configurá un saldo bancario en ${currency}.`);
  const id = randomUUID();
  const concept = purchase.concept;
  if (card && cardId) {
    const position = (await listPositions(client, ownerId, cardId)).get(
      currency,
    );
    if (!position) return missing;
    const { effectiveOn } = command;
    const historical =
      position.latestActivity && effectiveOn < position.latestActivity;
    if (
      historical &&
      ((position.reference && effectiveOn < position.reference) ||
        (await hasLaterCreditChange(
          client,
          ownerId,
          cardId,
          currency,
          effectiveOn,
        )))
    )
      return conflict(
        "La acreditación precede una referencia o un abono registrado. Revisá la conciliación de la tarjeta.",
      );
    const debt = amountUnits(position.debt);
    const creditBalance = amountUnits(position.creditBalance);
    let debtOnDate = debt;
    if (historical) {
      const {
        rows: [later],
      } = await client.query<{ delta: string }>(
        `SELECT coalesce(sum(l.debt_delta), 0)::text AS delta
           FROM finance.credit_lines l
           JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
          WHERE l.owner_id = $1 AND l.card_id = $2 AND l.currency = $3
            AND f.status = 'confirmed' AND f.effective_on > $4::date`,
        [ownerId, cardId, currency, effectiveOn],
      );
      debtOnDate -= amountUnits(later.delta);
    }
    const reduced = debtOnDate < card ? debtOnDate : card;
    if (
      reduced < BigInt(0) ||
      (historical &&
        reduced >
          amountUnits(
            await minimumDebtFrom(
              client,
              ownerId,
              cardId,
              currency,
              effectiveOn,
              position.debt,
            ),
          ))
    )
      return conflict(
        "El abono cambia la cobertura de pagos posteriores. Revisá la conciliación de la tarjeta.",
      );
    if (creditBalance + card - reduced > maxUnits)
      return conflict("El saldo a favor resultante está fuera de rango.");
    await insertCreditEvent(
      client,
      ownerId,
      {
        ...command,
        cardId,
        concept,
        kind: "purchase_refund",
        lines: [
          {
            currency,
            amount: refundDecimal(card),
            debtDelta: refundDecimal(-reduced),
            debtAfter: refundDecimal(debt - reduced),
            creditDelta: refundDecimal(card - reduced),
          },
        ],
      },
      hash,
      undefined,
      id,
    );
  } else {
    await client.query(
      `INSERT INTO finance.financial_events (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
       VALUES ($1, $2, 'purchase_refund', $3, $4, $5, $6, clock_timestamp())`,
      [ownerId, id, concept, command.effectiveOn, command.idempotencyKey, hash],
    );
    await client.query(
      "INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type) VALUES ($1, $2, $2, 'created')",
      [ownerId, id],
    );
  }
  await client.query(
    `INSERT INTO finance.purchase_refunds (owner_id, event_id, purchase_id, pending_id, action, currency, amount, applied_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ownerId,
      id,
      purchase.id,
      pendingId,
      command.action,
      currency,
      refundDecimal(total),
      refundDecimal(applied),
    ],
  );
  for (const { method, categoryId, amount, overlap } of accepted) {
    await client.query(
      "INSERT INTO finance.refund_parts (owner_id, event_id, method, category_id, amount, overlap) VALUES ($1, $2, $3, $4, $5, $6)",
      [ownerId, id, method, categoryId, amount, overlap],
    );
  }
  if (command.action === "cancel_installments") {
    await client.query(
      `INSERT INTO finance.refund_installments (owner_id, event_id, purchase_id, ordinal)
       SELECT $1, $2, $3, unnest($4::int[])`,
      [ownerId, id, purchase.id, command.ordinals],
    );
  }
  if (bank)
    await recordBankCredit(
      client,
      ownerId,
      id,
      currency,
      refundDecimal(bank),
      command.effectiveOn,
    );
  return { status: "created", id } as const;
}

async function returnBalance(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<RefundCommand, { action: "return_balance" }>,
  hash: string,
) {
  const { cardId, currency, effectiveOn, amount } = command;
  const position = (await listPositions(client, ownerId, cardId)).get(currency);
  if (!position) return missing;
  const remaining = amountUnits(position.creditBalance) - amountUnits(amount);
  if (remaining < BigInt(0))
    return conflict("El importe supera el saldo a favor en esa moneda.");
  if (position.latestActivity && effectiveOn < position.latestActivity)
    return conflict(
      "Usá la fecha real. El reintegro es anterior al último movimiento de la tarjeta y requiere conciliación.",
    );
  if (!(await ensureBank(client, ownerId, currency)))
    return conflict(`Configurá un saldo bancario en ${currency}.`);
  const id = await insertCreditEvent(
    client,
    ownerId,
    {
      ...command,
      kind: "card_credit_return",
      concept: "Reintegro de saldo a favor a Bancos",
      lines: [
        {
          currency,
          amount,
          debtDelta: zero,
          debtAfter: position.debt,
          creditDelta: refundDecimal(-amountUnits(amount)),
        },
      ],
    },
    hash,
  );
  await recordBankCredit(client, ownerId, id, currency, amount, effectiveOn);
  return { status: "created", id } as const;
}

async function voidRefund(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<RefundCommand, { action: "void" }>,
  hash: string,
) {
  const entry = await getRefundEntry(client, ownerId, command.eventId);
  if (!entry) return missing;
  if (entry.status === "voided") return conflict("El registro ya fue anulado.");
  if (entry.purchaseId && entry.action !== "pending") {
    const { rowCount } = await client.query(
      `SELECT 1 FROM finance.purchase_refunds r
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
        JOIN finance.refund_parts p ON (p.owner_id, p.event_id) = (r.owner_id, r.event_id)
       WHERE r.owner_id = $1 AND r.purchase_id = $2 AND r.event_id <> $3
         AND f.status = 'confirmed' AND p.method = 'credit'
       GROUP BY p.category_id
       HAVING sum(p.overlap) > least(
         coalesce(sum(p.amount) FILTER (WHERE r.action = 'credit'), 0),
         coalesce(sum(p.amount) FILTER (WHERE r.action = 'cancel_installments'), 0))
       LIMIT 1`,
      [ownerId, entry.purchaseId, entry.id],
    );
    if (rowCount)
      return conflict(
        "La devolución respalda una cancelación o acreditación vinculada. Anulá primero el registro que usa ese importe.",
      );
  }
  const { currency, cardId } = entry;
  const {
    rows: [bank],
  } = await client.query<{ amount: string; covered: boolean }>(
    `SELECT e.amount_signed::text AS amount, EXISTS (
      SELECT 1 FROM finance.balance_checkpoints b WHERE b.owner_id = e.owner_id AND b.currency = e.currency
       AND (b.as_of_date, b.created_at) >= (e.effective_on, f.created_at)
      ) AS covered FROM finance.bank_effects e JOIN finance.financial_events f
       ON (f.owner_id, f.id) = (e.owner_id, e.event_id) WHERE e.owner_id = $1 AND e.event_id = $2`,
    [ownerId, entry.id],
  );
  if (bank && !bank.covered) {
    const [balance] = await listBankBalances(client, ownerId, [currency]);
    if (
      !balance ||
      amountUnits(balance.calculatedAmount ?? balance.amount) <
        amountUnits(bank.amount)
    )
      return conflict(
        "La anulación dejaría Bancos sin saldo suficiente. Revisá la conciliación.",
      );
  }
  if (cardId) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM finance.credit_lines l JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
       JOIN finance.financial_events original ON original.owner_id = $1 AND original.id = $4
       WHERE l.owner_id = $1 AND l.card_id = $2 AND l.currency = $3 AND f.status = 'confirmed'
         AND (f.effective_on, f.created_at, f.id) > (original.effective_on, original.created_at, original.id) LIMIT 1`,
      [ownerId, cardId, currency, entry.id],
    );
    if (rowCount)
      return conflict(
        "Hay movimientos posteriores de la tarjeta. Revisalos antes de anular el registro.",
      );
    const position = (await listPositions(client, ownerId, cardId)).get(
      currency,
    );
    if (!position) return missing;
    const debt = amountUnits(position.debt) + amountUnits(entry.debtReduced);
    const credit =
      amountUnits(position.creditBalance) - amountUnits(entry.creditDelta);
    if (debt > maxUnits || credit < BigInt(0) || credit > maxUnits)
      return conflict(
        "Revisá el saldo de la tarjeta antes de anular el registro.",
      );
    await client.query(
      "UPDATE finance.card_currencies SET debt = $4 WHERE owner_id = $1 AND card_id = $2 AND currency = $3",
      [ownerId, cardId, currency, refundDecimal(debt)],
    );
  }
  return recordRevision(client, ownerId, command, hash, null);
}
