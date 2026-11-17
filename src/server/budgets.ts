import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { bankReferenceToday } from "../domain/bank-balances.ts";
import {
  parseBudgetMonth,
  type Budget,
  type BudgetCommand,
} from "../domain/budgets.ts";
import { type FxQuote } from "../domain/exchange-rates.ts";
import { budgetAlerts } from "../domain/notices.ts";
import {
  exchangeRatesReady,
  type HistoricalFxKey,
  liveQuotes,
  pendingHistoricalDates,
  prepareHistoricalQuotes,
} from "./exchange-rates.ts";
import { monthlyInstallmentFxReady } from "./installments.ts";
import { resolveMovementCategory } from "./movements.ts";

export async function budgetsReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.budget_expenses') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

// Budget commands never acquire bank/card/fund locks. The same transaction
// protects receipts, versions and snapshots before any read-dependent write.
async function lockBudgets(client: pg.PoolClient, ownerId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('finanzas:budgets:' || $1::text, 0))",
    [ownerId],
  );
}

export async function saveBudget(
  client: pg.PoolClient,
  ownerId: string,
  command: BudgetCommand,
  today = bankReferenceToday(),
) {
  await lockBudgets(client, ownerId);
  if (command.action === "quote") {
    const {
      rows: [previous],
    } = await client.query(
      `SELECT from_currency, to_currency, rate::text, effective_on::text FROM finance.budget_quotes WHERE owner_id=$1 AND id=$2`,
      [ownerId, command.idempotencyKey],
    );
    if (previous)
      return previous.from_currency === command.fromCurrency &&
        previous.to_currency === command.toCurrency &&
        previous.rate === command.rate &&
        previous.effective_on === command.effectiveOn
        ? ({ status: "replayed", id: command.idempotencyKey } as const)
        : conflict("Ese envío ya se usó con otros datos.");
    await client.query(
      `INSERT INTO finance.budget_quotes (owner_id,id,from_currency,to_currency,rate,effective_on,source)
      VALUES ($1,$2,$3,$4,$5,$6,'manual')`,
      [
        ownerId,
        command.idempotencyKey,
        command.fromCurrency,
        command.toCurrency,
        command.rate,
        command.effectiveOn,
      ],
    );
    return { status: "created", id: command.idempotencyKey } as const;
  }
  const hash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const {
    rows: [receipt],
  } = await client.query<{ id: string; hash: string }>(
    `SELECT budget_id AS id, command_hash AS hash FROM finance.budget_changes WHERE owner_id=$1 AND idempotency_key=$2`,
    [ownerId, command.idempotencyKey],
  );
  if (receipt)
    return receipt.hash === hash
      ? ({ status: "replayed", id: receipt.id } as const)
      : conflict("Ese envío ya se usó con otros datos.");
  // A response lost on the last day of the month remains replayable after the
  // month changes. Only new mutations must satisfy the current window.
  if (command.action === "exception" && !parseBudgetMonth(command.month, today))
    return conflict(
      "La excepción aplica solo al mes actual o a un mes futuro próximo.",
    );
  let id: string;
  if (command.action === "save") {
    const category = await resolveMovementCategory(
      client,
      ownerId,
      "expense",
      command.categoryId,
    );
    if (!category) return { status: "not-found" } as const;
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM finance.budget_limits WHERE owner_id=$1 AND category_id=$2",
      [ownerId, category],
    );
    id = rows[0]?.id ?? randomUUID();
    if (!rows.length)
      await client.query(
        "INSERT INTO finance.budget_limits(owner_id,id,category_id) VALUES ($1,$2,$3)",
        [ownerId, id, category],
      );
  } else id = command.budgetId;
  const {
    rows: [previous],
  } = await client.query<{ version: number }>(
    `SELECT version FROM finance.budget_changes WHERE owner_id=$1 AND budget_id=$2 ORDER BY version DESC LIMIT 1`,
    [ownerId, id],
  );
  const {
    rows: [habitual],
  } = await client.query<{
    action: string;
    currency: Budget["currency"];
    amount: string;
  }>(
    `SELECT action,currency,amount::text FROM finance.budget_changes WHERE owner_id=$1 AND budget_id=$2 AND action<>'exception' ORDER BY version DESC LIMIT 1`,
    [ownerId, id],
  );
  if (command.action === "save" && habitual && habitual.action !== "remove")
    return conflict("La categoría ya tiene un presupuesto.");
  if (
    command.action !== "save" &&
    (!previous || !habitual || habitual.action === "remove")
  )
    return { status: "not-found" } as const;
  if (command.action !== "save" && previous?.version !== command.version)
    return conflict("El presupuesto cambió. Actualizá la página.");
  const month = `${command.action === "exception" ? command.month : today.slice(0, 7)}-01`;
  const currency =
    command.action === "save" || command.action === "edit"
      ? command.currency
      : habitual!.currency;
  const amount =
    command.action === "remove" ? habitual!.amount : command.amount;
  await client.query(
    `INSERT INTO finance.budget_changes(owner_id,budget_id,version,idempotency_key,command_hash,action,month,currency,amount)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      ownerId,
      id,
      (previous?.version ?? 0) + 1,
      command.idempotencyKey,
      hash,
      command.action,
      month,
      currency,
      amount,
    ],
  );
  return {
    status: command.action === "save" ? "created" : "saved",
    id,
  } as const;
}

// Select history by effective month. Currency changes supersede exceptions in
// the old currency without deleting them or changing previous months.
const limitFor = (period: string) => `
  SELECT h.currency, h.amount, h.action, e.amount AS exception,
    coalesce(e.amount,h.amount) AS effective,
    (SELECT max(version) FROM finance.budget_changes v WHERE (v.owner_id,v.budget_id)=(b.owner_id,b.id)) AS version
    FROM LATERAL (SELECT * FROM finance.budget_changes h
      WHERE (h.owner_id,h.budget_id)=(b.owner_id,b.id) AND h.month<=${period} AND h.action<>'exception'
      ORDER BY h.month DESC,h.version DESC LIMIT 1) h
    LEFT JOIN LATERAL (SELECT e.amount FROM finance.budget_changes e
      WHERE (e.owner_id,e.budget_id)=(b.owner_id,b.id) AND e.action='exception' AND e.month=${period}
        AND e.currency=h.currency AND NOT EXISTS (
          SELECT 1 FROM finance.budget_changes changed WHERE (changed.owner_id,changed.budget_id)=(b.owner_id,b.id)
            AND changed.action IN ('save','edit','remove') AND changed.month<=${period} AND changed.version>e.version
            AND (changed.currency<>e.currency OR changed.action='remove'))
      ORDER BY e.version DESC LIMIT 1) e ON true`;

const budgetTree = `WITH RECURSIVE tree AS (
  SELECT id AS ancestor,id FROM finance.categories WHERE owner_id=$1
  UNION SELECT t.ancestor,c.id FROM tree t JOIN finance.categories c ON c.parent_id=t.id AND c.owner_id=$1
)`;

async function budgetFxKeys(
  client: pg.PoolClient,
  ownerId: string,
  month: string,
  monthlyFx: boolean,
) {
  const { rows } = await client.query<
    HistoricalFxKey & { target: Budget["currency"] }
  >(
    `${budgetTree}
    SELECT DISTINCT x.reference_on::text AS date, x.currency AS base, l.currency AS target,
      ${monthlyFx ? "x.monthly_fx" : "false"} AS monthly
      FROM finance.budget_limits b
      CROSS JOIN LATERAL (${limitFor("$2::date")}) l
      JOIN tree t ON t.ancestor = b.category_id
      JOIN finance.budget_expenses x ON x.owner_id = b.owner_id AND x.category_id = t.id
      LEFT JOIN finance.budget_rates saved ON
        (saved.owner_id,saved.event_id,saved.from_currency,saved.to_currency) = (x.owner_id,x.event_id,x.currency,l.currency)
     WHERE b.owner_id = $1 AND l.action <> 'remove' AND x.currency <> l.currency AND (${monthlyFx ? "x.monthly_fx OR " : ""}saved.quote_id IS NULL)
       AND x.effective_on >= $2::date AND x.effective_on < $2::date + interval '1 month'
     ORDER BY target, date, base`,
    [ownerId, `${month}-01`],
  );
  return Map.groupBy(rows, ({ target }) => target);
}

export async function budgetReferenceDates(
  client: pg.PoolClient,
  ownerId: string,
  month: string,
  today: string,
) {
  if (!(await budgetsReady(client)) || !(await exchangeRatesReady(client)))
    return [];
  const dates = new Set<string>();
  const monthlyFx = await monthlyInstallmentFxReady(client);
  for (const [target, keys] of await budgetFxKeys(
    client,
    ownerId,
    month,
    monthlyFx,
  )) {
    if (keys.some(({ monthly, date }) => monthly && date > today))
      dates.add(today);
    for (const date of await pendingHistoricalDates(
      client,
      ownerId,
      keys.filter(({ date }) => date <= today),
      target,
    ))
      dates.add(date);
  }
  return [...dates];
}

export async function listBudgets(
  client: pg.PoolClient,
  ownerId: string,
  month = bankReferenceToday().slice(0, 7),
  today = bankReferenceToday(),
): Promise<Budget[]> {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Mes inválido");
  await lockBudgets(client, ownerId);
  const fx = await exchangeRatesReady(client);
  const monthlyFx = fx && (await monthlyInstallmentFxReady(client));
  const estimates: FxQuote[] = [];
  if (fx) {
    for (const [target, keys] of await budgetFxKeys(
      client,
      ownerId,
      month,
      monthlyFx,
    )) {
      await prepareHistoricalQuotes(client, ownerId, keys, target, today);
      const future = keys.filter(
        ({ date, monthly }) => monthly && date > today,
      );
      const quotes = await liveQuotes(
        client,
        future.map(({ base }) => ({ base, date: today })),
        target,
      );
      estimates.push(...quotes.values());
    }
  }
  // Fill missing snapshots only. A manually supplied historical quote may
  // resolve a missing conversion, but cannot replace a previously used quote.
  await client.query(
    `INSERT INTO finance.budget_rates(owner_id,event_id,from_currency,to_currency,quote_id,reference_on)
    SELECT DISTINCT ON (x.event_id,x.currency,q.to_currency) x.owner_id,x.event_id,x.currency,q.to_currency,q.id,x.reference_on
      FROM finance.budget_expenses x JOIN finance.budget_quotes q ON q.owner_id=x.owner_id AND q.from_currency=x.currency AND q.effective_on<=x.reference_on
     WHERE x.owner_id=$1 AND x.effective_on>=$2::date AND x.effective_on<$2::date+interval '1 month'
       ${monthlyFx ? "AND NOT x.monthly_fx" : ""}
       ${
         fx
           ? `AND EXISTS (
         SELECT 1 FROM finance.fx_reference_refreshes s
          WHERE s.year = extract(year FROM x.reference_on)::int AND s.retry_at > now()
       ) AND NOT EXISTS (
         SELECT 1 FROM finance.fx_valuations v
          WHERE (v.owner_id,v.effective_on,v.base_currency,v.quote_currency) =
            (x.owner_id,x.reference_on,x.currency,q.to_currency)
       ) AND NOT EXISTS (
         SELECT 1 FROM finance.fx_reference_rates market
          WHERE (market.base_currency,market.quote_currency) = (x.currency,q.to_currency)
            AND market.observed_on <= x.reference_on
       )`
           : ""
       }
     ORDER BY x.event_id,x.currency,q.to_currency,q.effective_on DESC,q.recorded_at DESC,q.id DESC
    ON CONFLICT DO NOTHING`,
    [ownerId, `${month}-01`],
  );
  return readBudgets(client, ownerId, month, undefined, undefined, {
    today,
    estimates,
  });
}

// Export reads only previously captured rates. Listing budgets can also
// capture missing rates, so that path is deliberately kept above.
export async function readBudgets(
  client: pg.PoolClient,
  ownerId: string,
  month: string,
  from?: string,
  to?: string,
  provisional?: { today: string; estimates: FxQuote[] },
): Promise<Budget[]> {
  const fx = await exchangeRatesReady(client);
  const monthlyFx = fx && (await monthlyInstallmentFxReady(client));
  const future = monthlyFx
    ? "x.monthly_fx AND x.reference_on > $6::date"
    : "false";
  const sourced = (pinned: string, legacy: string, estimate: string) => {
    if (!fx) return legacy;
    if (!monthlyFx) return `coalesce(${legacy},${pinned})`;
    return `CASE WHEN ${future} THEN ${estimate}
      WHEN x.monthly_fx THEN ${pinned} ELSE coalesce(${legacy},${pinned}) END`;
  };
  const rate = sourced(
    "coalesce(v.manual_rate,market.rate)",
    "q.rate",
    "estimate.rate",
  );
  const date = sourced("v.observed_on", "q.effective_on", "estimate.observed");
  const source = sourced("v.source", "q.source", "estimate.source");
  const { rows } = await client.query<Budget>(
    `${budgetTree}
    SELECT b.id,b.category_id AS "categoryId",c.name AS "categoryName",l.currency,
      l.amount::numeric(20,4)::text AS "monthlyLimit",l.effective::numeric(20,4)::text AS "effectiveLimit",l.version,
      CASE WHEN l.exception IS NOT NULL THEN jsonb_build_object('month',$3::text,'limit',l.exception::numeric(20,4)::text) ELSE NULL END AS exception,
      CASE WHEN n.action='remove' THEN NULL ELSE jsonb_build_object('currency',n.currency,'amount',n.effective::numeric(20,4)::text,'exception',n.exception IS NOT NULL) END AS "nextLimit",
      CASE WHEN coalesce(cons.missing,0)>0 THEN NULL ELSE jsonb_build_object('month',$3::text,'consumed',coalesce(cons.total,0)::numeric(20,4)::text) END AS progress,
      coalesce(cons.refs,'[]'::jsonb) AS references
      FROM finance.budget_limits b JOIN finance.categories c ON (c.owner_id,c.id)=(b.owner_id,b.category_id)
      CROSS JOIN LATERAL (${limitFor("$2::date")}) l
      CROSS JOIN LATERAL (${limitFor("($2::date+interval '1 month')::date")}) n
      LEFT JOIN LATERAL (
        SELECT round(sum(x.amount * CASE WHEN x.currency=l.currency THEN 1 ELSE ${rate} END),4) AS total,
          count(*) FILTER (WHERE x.currency<>l.currency AND ${rate} IS NULL) AS missing,
          jsonb_agg(DISTINCT jsonb_build_object(
            'fromCurrency',x.currency,'rate',(${rate})::text,
            'date',(${date})::text,
            'source',${source},'provisional',${future}
          )) FILTER (WHERE ${rate} IS NOT NULL) AS refs
          FROM finance.budget_expenses x JOIN tree t ON t.id=x.category_id AND t.ancestor=b.category_id
          LEFT JOIN finance.budget_rates r ON (r.owner_id,r.event_id,r.from_currency,r.to_currency)=(x.owner_id,x.event_id,x.currency,l.currency)
          LEFT JOIN finance.budget_quotes q ON (q.owner_id,q.id)=(r.owner_id,r.quote_id)
          ${
            fx
              ? `LEFT JOIN finance.fx_valuations v
            ON (v.owner_id,v.effective_on,v.base_currency,v.quote_currency) = (x.owner_id,x.reference_on,x.currency,l.currency)
          LEFT JOIN finance.fx_reference_rates market
            ON (market.base_currency,market.quote_currency,market.observed_on,market.source) =
              (v.base_currency,v.quote_currency,v.observed_on,v.reference_source)`
              : ""
          }
          ${
            monthlyFx
              ? `LEFT JOIN jsonb_to_recordset($7::jsonb)
            AS estimate(base finance.currency, target finance.currency, rate numeric, observed date, source text)
            ON (estimate.base,estimate.target) = (x.currency,l.currency) AND ${future}`
              : ""
          }
         WHERE x.owner_id=$1 AND x.effective_on>=$2::date AND x.effective_on<$2::date+interval '1 month'
           AND ($4::date IS NULL OR x.effective_on >= $4) AND ($5::date IS NULL OR x.effective_on <= $5)
      ) cons ON true
     WHERE b.owner_id=$1 AND l.action<>'remove' ORDER BY c.name,b.id`,
    [
      ownerId,
      `${month}-01`,
      month,
      from ?? null,
      to ?? null,
      ...(monthlyFx
        ? [
            provisional?.today ?? bankReferenceToday(),
            JSON.stringify(provisional?.estimates ?? []),
          ]
        : []),
    ],
  );
  return rows;
}

type BudgetNotice = {
  budgetId: string;
  categoryName: string;
  currency: Budget["currency"];
  threshold: 80 | 100;
  percent: number;
};

// Call after the command's monetary locks. listBudgets serializes evaluation
// with other observations and configuration changes for this owner.
export async function refreshBudgetNotices(
  client: pg.PoolClient,
  ownerId: string,
  month = bankReferenceToday().slice(0, 7),
) {
  const {
    rows: [schema],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.budget_notices') IS NOT NULL AS ready",
  );
  if (!schema.ready) return false;

  const alerts = budgetAlerts(await listBudgets(client, ownerId, month), month);
  if (alerts.length) {
    const candidates = alerts.map(({ budget, state, percent }) => ({
      budget_id: budget.id,
      currency: budget.currency,
      threshold: state === "danger" ? 100 : 80,
      percent,
    }));
    await client.query(
      `INSERT INTO finance.budget_notices(owner_id,budget_id,month,threshold,percent,currency)
       SELECT $1, candidate.budget_id, $2, candidate.threshold, candidate.percent, candidate.currency
         FROM jsonb_to_recordset($3::jsonb) AS candidate(
           budget_id uuid, threshold smallint, percent numeric, currency finance.currency)
        WHERE NOT EXISTS (
          SELECT 1 FROM finance.budget_notices previous
           WHERE previous.owner_id=$1 AND previous.budget_id=candidate.budget_id
             AND previous.month=$2 AND previous.threshold>=candidate.threshold
        )
       ON CONFLICT (owner_id,budget_id,month,threshold) DO NOTHING`,
      [ownerId, `${month}-01`, JSON.stringify(candidates)],
    );
  }
  return true;
}

export async function listBudgetNotices(
  client: pg.PoolClient,
  ownerId: string,
  month: string,
): Promise<BudgetNotice[] | null> {
  if (!(await refreshBudgetNotices(client, ownerId, month))) return null;
  const { rows } = await client.query<BudgetNotice>(
    `SELECT n.budget_id AS "budgetId", c.name AS "categoryName", n.currency,
            n.threshold, n.percent::float8 AS percent
       FROM finance.budget_notices n
       JOIN finance.budget_limits b ON (b.owner_id,b.id)=(n.owner_id,n.budget_id)
       JOIN finance.categories c ON (c.owner_id,c.id)=(b.owner_id,b.category_id)
      WHERE n.owner_id=$1 AND n.month=$2
      ORDER BY n.threshold DESC,n.percent DESC,c.name,n.budget_id`,
    [ownerId, `${month}-01`],
  );
  return rows;
}
