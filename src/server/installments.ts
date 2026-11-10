import "server-only";
import type pg from "pg";
import type {
  InstallmentSummary,
  InstallmentTerms,
  InstallmentVersion,
  MonthlyInstallment,
} from "../domain/installments.ts";
import type { Currency } from "../domain/money.ts";
import { mixedPurchasesReady } from "./mixed-purchases.ts";

export async function installmentsReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.current_installment_plans') IS NOT NULL AS ready",
  );
  return row.ready;
}

const versionFields = `p.version, p.installment_amount::text AS "installmentAmount",
  p.installment_count AS count, p.active_count AS "activeCount",
  to_char(p.first_period, 'YYYY-MM') AS "firstPeriod", p.change_type AS change,
  to_char(p.recorded_at AT TIME ZONE 'America/Montevideo', 'YYYY-MM-DD HH24:MI') AS "recordedOn"`;

export async function listInstallmentVersions(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
) {
  const { rows } = await client.query<InstallmentVersion>(
    `SELECT ${versionFields} FROM finance.installment_plans p
      WHERE p.owner_id = $1 AND p.event_id = $2 ORDER BY p.version DESC`,
    [ownerId, eventId],
  );
  return rows;
}

export async function listCardInstallments(
  client: pg.PoolClient,
  ownerId: string,
) {
  const { rows } = await client.query<InstallmentSummary>(
    `SELECT ${versionFields}, f.id, f.concept, p.currency, o.card_id AS "cardId"
       FROM finance.current_installment_plans p
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (p.owner_id, p.event_id)
       JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (p.owner_id, p.event_id)
      WHERE p.owner_id = $1 AND f.kind = 'card_purchase' AND f.status = 'confirmed'
      ORDER BY f.effective_on DESC, f.created_at DESC, f.id DESC`,
    [ownerId],
  );
  return rows;
}

export async function listMonthlyInstallments(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
) {
  const mixed = await mixedPurchasesReady(client);
  const { rows } = await client.query<MonthlyInstallment>(
    `SELECT x.id, x.concept, x.installment_ordinal AS ordinal, x.currency, x.amount::text,
            ${
              mixed
                ? `CASE WHEN EXISTS (SELECT 1 FROM finance.mixed_purchase_categories s
              WHERE (s.owner_id, s.event_id, s.method) = (x.owner_id, x.id, 'credit'))
                THEN 'Categorías repartidas' ELSE c.name END`
                : "c.name"
            } AS category
       FROM finance.credit_expenses x
       LEFT JOIN finance.categories c ON (c.owner_id, c.id) = (x.owner_id, x.category_id)
      WHERE x.owner_id = $1 AND x.effective_on = $2::date AND x.installment_ordinal IS NOT NULL
      ORDER BY c.name NULLS LAST, x.concept, x.id`,
    [ownerId, monthStart],
  );
  return rows;
}

export async function insertInstallmentVersion(
  client: pg.PoolClient,
  ownerId: string,
  eventId: string,
  currency: Currency,
  plan: InstallmentTerms &
    Pick<InstallmentVersion, "version" | "activeCount" | "change">,
) {
  await client.query(
    `INSERT INTO finance.installment_plans
     (owner_id, event_id, currency, version, installment_amount, installment_count, active_count, first_period, change_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      ownerId,
      eventId,
      currency,
      plan.version,
      plan.installmentAmount,
      plan.count,
      plan.activeCount,
      `${plan.firstPeriod}-01`,
      plan.change,
    ],
  );
}
