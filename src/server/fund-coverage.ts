import "server-only";
import type pg from "pg";
import {
  coverageDecimal,
  coverageSum,
  coverageUnits,
  type FundPortion,
  type FundSource,
  type FundUse,
} from "../domain/fund-coverage.ts";
import type { Currency } from "../domain/money.ts";

const zero = BigInt(0);
const maximum = BigInt("99999999999999999999");

export async function fundCoverageReady(client: pg.PoolClient) {
  const {
    rows: [state],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.fund_purchase_commitments') IS NOT NULL AS ready",
  );
  return state.ready;
}

export async function listFundSources(
  client: pg.PoolClient,
  ownerId: string,
  ids: string[] | null = null,
) {
  if (!(await fundCoverageReady(client))) return null;
  const { rows } = await client.query<
    FundSource & { status: string; reservedAmount: string }
  >(
    `SELECT f.id, f.name, f.currency, f.status, f.reserved_amount::text AS "reservedAmount",
            (f.reserved_amount - c.committed)::text AS "availableAmount", c.committed::text AS "committedAmount"
       FROM finance.savings_funds f
       CROSS JOIN LATERAL (
         SELECT coalesce(sum(remaining), 0)::numeric(20,4) AS committed
           FROM finance.fund_purchase_commitments
          WHERE owner_id = f.owner_id AND fund_id = f.id
       ) c
      WHERE f.owner_id = $1 AND ($2::uuid[] IS NULL OR f.id = ANY($2))
        AND ($2 IS NOT NULL OR f.status <> 'closed')
      ORDER BY lower(f.name), f.id`,
    [ownerId, ids],
  );
  return rows;
}

export async function listEventFundUses(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  if (!(await fundCoverageReady(client))) return [];
  const { rows } = await client.query<FundUse>(
    `SELECT a.fund_id AS "fundId", f.name, a.currency, a.purpose, a.amount::text,
            NULL::uuid AS "purchaseId", NULL::text AS "purchaseConcept"
       FROM finance.fund_event_allocations a JOIN finance.savings_funds f
         ON (f.owner_id, f.id) = (a.owner_id, a.fund_id)
      WHERE a.owner_id = $1 AND a.event_id = $2
      UNION ALL
     SELECT a.fund_id AS "fundId", f.name, a.currency, 'payment', a.amount::text, p.id, p.concept
       FROM finance.fund_payment_allocations a JOIN finance.savings_funds f
         ON (f.owner_id, f.id) = (a.owner_id, a.fund_id)
       JOIN finance.financial_events p ON (p.owner_id, p.id) = (a.owner_id, a.purchase_id)
      WHERE a.owner_id = $1 AND a.payment_id = $2
      ORDER BY name, "fundId"`,
    [ownerId, eventId],
  );
  return rows;
}

export type FundDelta = { fundId: string; delta: bigint };

// All financial callers hold the bank lock. A replacement restores the old
// portions and applies the newly authorized ones as a single net change.
export async function planFundExpense(
  client: pg.PoolClient,
  ownerId: string,
  currency: Currency,
  total: string,
  after: readonly FundPortion[],
  before: readonly FundPortion[] = [],
): Promise<{ error: string } | { deltas: FundDelta[] }> {
  if (!after.length && !before.length) return { deltas: [] };
  if (coverageSum(after) > coverageUnits(total))
    return { error: "Los fondos elegidos superan el importe a cubrir." };
  const deltas = new Map<string, bigint>();
  for (const { fundId, amount } of before)
    deltas.set(fundId, (deltas.get(fundId) ?? zero) + coverageUnits(amount));
  for (const { fundId, amount } of after)
    deltas.set(fundId, (deltas.get(fundId) ?? zero) - coverageUnits(amount));
  const funds = await listFundSources(client, ownerId, [...deltas.keys()]);
  if (!funds)
    return { error: "La cobertura con fondos todavía no está disponible." };
  if (
    funds.length !== deltas.size ||
    after.some(
      ({ fundId }) =>
        funds.find(({ id }) => id === fundId)?.currency !== currency,
    )
  )
    return { error: "Elegí fondos propios de la misma moneda." };
  for (const fund of funds) {
    const delta = deltas.get(fund.id)!;
    if (fund.status === "closed" && delta !== zero)
      return {
        error:
          "Un fondo vinculado está cerrado. No se puede modificar su reserva.",
      };
    if (delta < zero && coverageUnits(fund.availableAmount) + delta < zero)
      return {
        error: `La reserva sin comprometer de «${fund.name}» es insuficiente.`,
      };
    if (coverageUnits(fund.reservedAmount) + delta > maximum)
      return {
        error: `El saldo resultante de «${fund.name}» está fuera de rango.`,
      };
  }
  return { deltas: [...deltas].map(([fundId, delta]) => ({ fundId, delta })) };
}

export async function applyFundDeltas(
  client: pg.PoolClient,
  ownerId: string,
  deltas: FundDelta[],
) {
  const changes = deltas.filter(({ delta }) => delta !== zero);
  if (!changes.length) return;
  const result = await client.query(
    `UPDATE finance.savings_funds f
        SET reserved_amount = f.reserved_amount + d.delta, version = f.version + 1,
            updated_at = clock_timestamp()
       FROM unnest($2::uuid[], $3::numeric[]) d(id, delta)
      WHERE f.owner_id = $1 AND f.id = d.id`,
    [
      ownerId,
      changes.map(({ fundId }) => fundId),
      changes.map(({ delta }) => coverageDecimal(delta)),
    ],
  );
  if (result.rowCount !== changes.length)
    throw new Error("No se actualizaron todos los fondos vinculados.");
}

export async function recordEventFundUses(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  currency: Currency,
  portions: readonly FundPortion[],
  purpose: "expense" | "commitment" | "payment",
) {
  if (!portions.length) return;
  await client.query(
    `INSERT INTO finance.fund_event_allocations (owner_id, event_id, fund_id, currency, purpose, amount)
     SELECT $1, $2, fund_id, $3, $4, amount FROM unnest($5::uuid[], $6::numeric[]) p(fund_id, amount)`,
    [
      ownerId,
      eventId,
      currency,
      purpose,
      portions.map(({ fundId }) => fundId),
      portions.map(({ amount }) => amount),
    ],
  );
}

export async function commitmentTotals(
  client: pg.PoolClient,
  ownerId: string,
  cardId: string,
) {
  if (!(await fundCoverageReady(client))) return new Map<Currency, bigint>();
  const { rows } = await client.query<{ currency: Currency; total: string }>(
    `SELECT currency, sum(remaining)::text AS total FROM finance.fund_purchase_commitments
      WHERE owner_id = $1 AND card_id = $2 GROUP BY currency`,
    [ownerId, cardId],
  );
  return new Map(
    rows.map(({ currency, total }) => [currency, coverageUnits(total)]),
  );
}

// A reversal may reactivate a commitment retired with free money or by a
// refund. Keep the reversal atomic if that part of the reserve is now in use.
export async function commitmentsFit(client: pg.PoolClient, ownerId: string) {
  if (!(await fundCoverageReady(client))) return true;
  const { rowCount } = await client.query(
    `SELECT 1 FROM finance.fund_purchase_commitments c JOIN finance.savings_funds f
        ON (f.owner_id, f.id) = (c.owner_id, c.fund_id)
      WHERE c.owner_id = $1
      GROUP BY f.owner_id, f.id
     HAVING sum(c.remaining) > CASE WHEN f.status = 'closed' THEN 0 ELSE f.reserved_amount END
      LIMIT 1`,
    [ownerId],
  );
  return !rowCount;
}
