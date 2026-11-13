import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  benefitMaxUnits,
  type BankBenefitCommand,
  type BankBenefitEntry,
} from "../domain/bank-benefits.ts";
import type { Currency } from "../domain/money.ts";
import { amountUnits, refundDecimal } from "../domain/refunds.ts";
import {
  listBankAvailability,
  listBankBalances,
  lockBankWrites,
} from "./bank-balances.ts";
import {
  insertCreditEvent,
  listPositions,
  lockCardWrites,
} from "./credit-operations.ts";
import { bankBenefitsReady } from "./bank-benefit-schema.ts";
import { commandHash, findReplay, recordRevision } from "./movements.ts";

// F5-09 etapa A · RF-053 / CA-067. El beneficio bancario no asociado a una
// compra se registra una sola vez, cuando el banco ya lo acreditó. Nunca toca
// compras, devoluciones ni consumo presupuestario: es un ingreso propio.
const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;
const missing = { status: "not-found" } as const;

const entryFields = `f.id, f.concept, b.note, to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn",
  b.currency, b.amount::text AS amount, b.destination, f.status,
  b.card_id AS "cardId", card.name AS card,
  coalesce(-l.debt_delta, 0)::text AS "debtReduced", coalesce(x.delta, 0)::text AS "creditDelta"`;
const entrySource = `FROM finance.bank_benefits b
  JOIN finance.financial_events f ON (f.owner_id, f.id) = (b.owner_id, b.event_id)
  LEFT JOIN finance.cards card ON (card.owner_id, card.id) = (b.owner_id, b.card_id)
  LEFT JOIN finance.credit_lines l ON (l.owner_id, l.event_id, l.currency) = (b.owner_id, b.event_id, b.currency)
  LEFT JOIN finance.card_credit_changes x ON (x.owner_id, x.event_id, x.currency) = (l.owner_id, l.event_id, l.currency)`;

export async function getBankBenefit(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (!(await bankBenefitsReady(client))) return;
  const {
    rows: [entry],
  } = await client.query<BankBenefitEntry>(
    `SELECT ${entryFields} ${entrySource} WHERE b.owner_id = $1 AND b.event_id = $2`,
    [ownerId, eventId],
  );
  return entry;
}

export async function listBankBenefits(
  client: pg.PoolClient,
  ownerId: string,
  limit = 20,
) {
  if (!(await bankBenefitsReady(client))) return [];
  const { rows } = await client.query<BankBenefitEntry>(
    `SELECT ${entryFields} ${entrySource} WHERE b.owner_id = $1
      ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC LIMIT $2`,
    [ownerId, limit],
  );
  return rows;
}

export async function saveBankBenefit(
  client: pg.PoolClient,
  ownerId: string,
  command: BankBenefitCommand,
) {
  if (!(await bankBenefitsReady(client)))
    return conflict(
      "Actualizá la base de datos para registrar beneficios bancarios.",
    );
  // Mismo orden de bloqueos que las devoluciones: Bancos y luego tarjetas.
  await lockBankWrites(client, ownerId);
  await lockCardWrites(client, ownerId);
  const hash = commandHash(["bank-benefit-v1", JSON.stringify(command)]);
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
  return command.action === "void"
    ? voidBenefit(client, ownerId, command, hash)
    : registerBenefit(client, ownerId, command, hash);
}

async function registerBenefit(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<BankBenefitCommand, { action: "register" }>,
  hash: string,
) {
  const { destination, cardId, currency, amount, effectiveOn, concept, note } =
    command;
  const id = randomUUID();
  if (destination === "bank") {
    if (!(await listBankBalances(client, ownerId, [currency])).length)
      return conflict(`Configurá un saldo bancario en ${currency}.`);
    await client.query(
      `INSERT INTO finance.financial_events
         (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
       VALUES ($1, $2, 'bank_benefit', $3, $4, $5, $6, clock_timestamp())`,
      [ownerId, id, concept, effectiveOn, command.idempotencyKey, hash],
    );
    await client.query(
      `INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
       VALUES ($1, $2, $2, $3, $4, $5)`,
      [ownerId, id, currency, amount, effectiveOn],
    );
    await client.query(
      "INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type) VALUES ($1, $2, $2, 'created')",
      [ownerId, id],
    );
    await client.query(
      `INSERT INTO finance.bank_benefits (owner_id, event_id, destination, currency, amount, card_id, note)
       VALUES ($1, $2, 'bank', $3, $4, NULL, $5)`,
      [ownerId, id, currency, amount, note],
    );
    return { status: "created", id } as const;
  }

  // Abono real en una tarjeta de crédito: sin depósito en Bancos. Reduce la
  // deuda y el excedente queda como saldo a favor del emisor.
  const {
    rows: [card],
  } = await client.query<{ name: string }>(
    `SELECT c.name FROM finance.cards c
      WHERE c.owner_id = $1 AND c.id = $2 AND c.kind = 'credit' AND c.archived_at IS NULL`,
    [ownerId, cardId],
  );
  if (!card) return missing;
  const position = (await listPositions(client, ownerId, cardId!)).get(
    currency,
  );
  if (!position) return missing;
  // Una fecha anterior a otros movimientos cambiaría la deuda ya conciliada.
  if (position.latestActivity && effectiveOn < position.latestActivity)
    return conflict(
      "Usá la fecha real. El abono es anterior al último movimiento de la tarjeta y requiere conciliación.",
    );
  const credited = amountUnits(amount);
  const debt = amountUnits(position.debt);
  const reduced = debt < credited ? debt : credited;
  const surplus = credited - reduced;
  if (amountUnits(position.creditBalance) + surplus > benefitMaxUnits)
    return conflict("El saldo a favor resultante está fuera de rango.");
  await insertCreditEvent(
    client,
    ownerId,
    {
      cardId: cardId!,
      effectiveOn,
      idempotencyKey: command.idempotencyKey,
      kind: "bank_benefit",
      concept,
      note,
      lines: [
        {
          currency,
          amount,
          debtDelta: refundDecimal(-reduced),
          debtAfter: refundDecimal(debt - reduced),
          creditDelta: refundDecimal(surplus),
        },
      ],
    },
    hash,
    undefined,
    id,
  );
  await client.query(
    `INSERT INTO finance.bank_benefits (owner_id, event_id, destination, currency, amount, card_id, note)
     VALUES ($1, $2, 'card', $3, $4, $5, $6)`,
    [ownerId, id, currency, amount, cardId, note],
  );
  return { status: "created", id } as const;
}

async function voidBenefit(
  client: pg.PoolClient,
  ownerId: string,
  command: Extract<BankBenefitCommand, { action: "void" }>,
  hash: string,
) {
  const entry = await getBankBenefit(client, ownerId, command.eventId);
  if (!entry) return missing;
  if (entry.status !== "confirmed")
    return conflict("El registro ya fue anulado.");
  const { currency, cardId } = entry;
  if (entry.destination === "bank") {
    const {
      rows: [bank],
    } = await client.query<{ covered: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM finance.balance_checkpoints b
          WHERE b.owner_id = e.owner_id AND b.currency = e.currency
            AND (b.as_of_date, b.created_at) >= (e.effective_on, f.created_at)
       ) AS covered
       FROM finance.bank_effects e
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (e.owner_id, e.event_id)
      WHERE e.owner_id = $1 AND e.event_id = $2`,
      [ownerId, entry.id],
    );
    // Revertir el ingreso no puede dejar disponible negativo, salvo que un
    // saldo confirmado posterior ya lo haya absorbido.
    if (bank && !bank.covered) {
      const [balance] = await listBankAvailability(client, ownerId, [
        currency as Currency,
      ]);
      if (
        !balance ||
        amountUnits(balance.availableAmount) < amountUnits(entry.amount)
      )
        return conflict(
          "El disponible libre es insuficiente para anular la acreditación.",
        );
    }
  } else {
    const { rowCount } = await client.query(
      `SELECT 1 FROM finance.credit_lines l
         JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
         JOIN finance.financial_events original ON original.owner_id = $1 AND original.id = $4
        WHERE l.owner_id = $1 AND l.card_id = $2 AND l.currency = $3 AND f.status = 'confirmed'
          AND (f.effective_on, f.created_at, f.id) > (original.effective_on, original.created_at, original.id) LIMIT 1`,
      [ownerId, cardId, currency, entry.id],
    );
    if (rowCount)
      return conflict(
        "Hay movimientos posteriores de la tarjeta. Revisalos antes de anular el registro.",
      );
    const position = (await listPositions(client, ownerId, cardId!)).get(
      currency,
    );
    if (!position) return missing;
    const debt = amountUnits(position.debt) + amountUnits(entry.debtReduced);
    const credit =
      amountUnits(position.creditBalance) - amountUnits(entry.creditDelta);
    if (debt > benefitMaxUnits || credit < BigInt(0))
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
