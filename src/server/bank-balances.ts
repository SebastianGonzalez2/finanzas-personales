import "server-only";
import type pg from "pg";
import { bankCurrencies, type BankBalance } from "../domain/bank-balances.ts";
import type { Currency } from "../domain/money.ts";

// Stable opening IDs scoped by the existing (owner_id, id) primary key.
// Later manual checkpoints use their own IDs. No DDL or new grants required.
const openingIds = {
  UYU: "e95ef63b-4218-4be6-b1a3-c4b5ac50d12a",
  USD: "11a38c87-30ec-4a72-80c7-8ca6c9f803c5",
  EUR: "23fd4829-321d-4f84-8f5b-d290c9bd51d2",
} as const;

export async function listBankBalances(
  client: pg.PoolClient,
  ownerId: string,
  currencies: readonly Currency[] = bankCurrencies,
): Promise<BankBalance[]> {
  const { rows } = await client.query<BankBalance>(
    `SELECT b.currency, b.confirmed_amount::text AS amount,
            to_char(b.as_of_date, 'YYYY-MM-DD') AS "asOfDate",
            (b.confirmed_amount + effects.delta)::text AS "calculatedAmount"
       FROM unnest($2::finance.currency[]) WITH ORDINALITY AS c(currency, position)
       CROSS JOIN LATERAL (
         SELECT currency, confirmed_amount, as_of_date, created_at
           FROM finance.balance_checkpoints
          WHERE owner_id = $1 AND currency = c.currency
          ORDER BY as_of_date DESC, created_at DESC, id DESC
          LIMIT 1
       ) b
       CROSS JOIN LATERAL (
         SELECT sum(e.amount_signed) AS delta
           FROM finance.bank_effects e
           JOIN finance.financial_events f
             ON (f.owner_id, f.id) = (e.owner_id, e.event_id)
          WHERE e.owner_id = $1 AND e.currency = b.currency
            AND f.status = 'confirmed' AND e.effective_on >= b.as_of_date
            AND (e.effective_on > b.as_of_date OR f.created_at > b.created_at)
       ) effects
      ORDER BY c.position`,
    [ownerId, currencies],
  );
  return rows.map(({ calculatedAmount, ...balance }) =>
    calculatedAmount == null ? balance : { ...balance, calculatedAmount },
  );
}

// Call within the authorized owner's transaction. The checkpoint and audit
// share an ID across tables and are committed together; neither is an event.
export async function saveOpeningBalance(
  client: pg.PoolClient,
  ownerId: string,
  balance: BankBalance,
): Promise<"created" | "replayed" | "conflict"> {
  const { currency, amount, asOfDate } = balance;
  const id = openingIds[currency];
  const inserted = await client.query(
    `WITH opening AS (
       INSERT INTO finance.balance_checkpoints
         (owner_id, id, currency, confirmed_amount, as_of_date)
       SELECT $1, $2::uuid, $3::finance.currency, $4::finance.exact_amount, $5::date
        WHERE NOT EXISTS (
          SELECT 1 FROM finance.balance_checkpoints
           WHERE owner_id = $1 AND currency = $3
        )
       ON CONFLICT (owner_id, id) DO NOTHING
       RETURNING owner_id, id
     )
     INSERT INTO finance.audit_changes (owner_id, id, change_type)
       SELECT owner_id, id, 'checkpoint_confirmed' FROM opening`,
    [ownerId, id, currency, amount, asOfDate],
  );
  if (inserted.rowCount === 1) return "created";

  // A separate statement sees a competing insert committed while we waited
  // on the unique key. Only an exact replay of this opening counts as success.
  const replay = await client.query(
    `SELECT 1 FROM finance.balance_checkpoints
      WHERE owner_id = $1 AND id = $2 AND currency = $3
        AND confirmed_amount = $4 AND as_of_date = $5`,
    [ownerId, id, currency, amount, asOfDate],
  );
  return replay.rowCount === 1 ? "replayed" : "conflict";
}
