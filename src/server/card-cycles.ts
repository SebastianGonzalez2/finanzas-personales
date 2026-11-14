import "server-only";
import type pg from "pg";
import {
  cycleAmount,
  cycleClosingOn,
  defaultCycleDates,
  defaultCycleSchedule,
  defaultStatement,
  purchaseCycle,
  statementStatus,
  type CycleAssignment,
  type CycleCommand,
  type CycleDates,
  type CycleSchedule,
  type OfficialStatement,
} from "../domain/card-cycles.ts";
import type { CatalogCard } from "../domain/cards.ts";
import type { Currency } from "../domain/money.ts";
import { lockCardWrites } from "./credit-operations.ts";
import { commandHash } from "./movements.ts";

import { refundsReady } from "./refund-schema.ts";

type CycleChange = CycleDates &
  CycleSchedule &
  OfficialStatement &
  CycleAssignment & {
    cardId: string;
    scope: CycleCommand["scope"];
    period: string | null;
    currency: Currency | null;
    purchaseId: string | null;
    ordinal: number | null;
  };
type Expense = {
  cardId: string;
  id: string;
  concept: string;
  effectiveOn: string;
  currency: Currency;
  amount: string;
  ordinal: number;
  installmentPeriod: string | null;
};
type Payment = {
  cardId: string;
  period: string;
  currency: Currency;
  amount: string;
};
type CycleData = {
  changes: CycleChange[];
  expenses: Expense[];
  payments: Payment[];
  credits: {
    cardId: string;
    currency: Currency;
    effectiveOn: string;
    amount: string;
  }[];
};

export async function cardCyclesReady(client: pg.PoolClient) {
  const {
    rows: [row],
  } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.current_card_cycles') IS NOT NULL AS ready",
  );
  return row.ready;
}

async function readCycles(
  client: pg.PoolClient,
  ownerId: string,
  cardId?: string,
  asOf?: string,
) {
  const refunds = await refundsReady(client);
  const {
    rows: [row],
  } = await client.query<CycleData>(
    `SELECT
      ARRAY(SELECT jsonb_build_object('cardId', c.card_id, 'scope', c.scope, 'version', c.version,
        'period', to_char(c.cycle_period, 'YYYY-MM'), 'currency', c.currency,
        'purchaseId', c.purchase_id, 'ordinal', c.purchase_ordinal,
        'closingDay', c.closing_day, 'dueDay', c.due_day, 'leadDays', c.lead_days,
        'closingOn', to_char(c.closing_on, 'YYYY-MM-DD'), 'dueOn', to_char(c.due_on, 'YYYY-MM-DD'),
        'officialAmount', c.official_amount::text, 'minimumAmount', c.minimum_amount::text,
        'assignedPeriod', to_char(c.assigned_period, 'YYYY-MM'))
        FROM finance.current_card_cycles c
        WHERE c.owner_id = $1 AND ($2::uuid IS NULL OR c.card_id = $2)) AS changes,
      ARRAY(SELECT jsonb_build_object('cardId', o.card_id, 'id', x.id, 'concept', x.concept,
        'effectiveOn', to_char(f.effective_on, 'YYYY-MM-DD'), 'currency', x.currency, 'amount', x.amount::text,
        'ordinal', coalesce(x.installment_ordinal, 0),
        'installmentPeriod', CASE WHEN x.installment_ordinal IS NOT NULL THEN to_char(x.effective_on, 'YYYY-MM') END)
        FROM finance.credit_operations o
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
        JOIN finance.credit_expenses x ON (x.owner_id, x.id) = (o.owner_id, o.event_id)
        WHERE o.owner_id = $1 AND ($2::uuid IS NULL OR o.card_id = $2)
          AND f.kind = 'card_purchase'
          AND ($3::date IS NULL OR (f.effective_on <= $3 AND x.effective_on <= $3))
        ORDER BY f.effective_on, x.id, x.installment_ordinal) AS expenses,
      ARRAY(SELECT jsonb_build_object('cardId', l.card_id, 'period', to_char(l.statement_period, 'YYYY-MM'),
        'currency', l.currency, 'amount', sum(l.amount)::text)
        FROM finance.credit_lines l
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
        WHERE l.owner_id = $1 AND ($2::uuid IS NULL OR l.card_id = $2)
          AND ($3::date IS NULL OR f.effective_on <= $3)
          AND l.statement_period IS NOT NULL AND f.status = 'confirmed' AND f.kind = 'card_payment'
        GROUP BY l.card_id, l.statement_period, l.currency) AS payments,
      ${
        refunds
          ? `ARRAY(SELECT jsonb_build_object('cardId', l.card_id, 'currency', l.currency,
        'effectiveOn', to_char(f.effective_on, 'YYYY-MM-DD'),
        'amount', (CASE WHEN f.kind = 'card_purchase' THEN -x.delta ELSE -l.debt_delta END)::text)
        FROM finance.card_credit_changes x
        JOIN finance.credit_lines l ON (l.owner_id, l.event_id, l.currency) = (x.owner_id, x.event_id, x.currency)
        JOIN finance.financial_events f ON (f.owner_id, f.id) = (x.owner_id, x.event_id)
        WHERE x.owner_id = $1 AND ($2::uuid IS NULL OR x.card_id = $2) AND f.status = 'confirmed'
          AND ($3::date IS NULL OR f.effective_on <= $3)
          AND ((f.kind IN ('purchase_refund', 'bank_benefit') AND l.debt_delta < 0)
            OR (f.kind = 'card_purchase' AND x.delta < 0)))`
          : "ARRAY[]::jsonb[]"
      } AS credits`,
    [ownerId, cardId ?? null, asOf ?? null],
  );
  return row;
}

function cardCycleData(data: CycleData, cardId: string) {
  const changes = data.changes.filter((change) => change.cardId === cardId);
  const schedule =
    changes.find(({ scope }) => scope === "schedule") ?? defaultCycleSchedule;
  const dates = new Map(
    changes.flatMap((change) =>
      change.scope === "dates" && change.period
        ? [[change.period, change]]
        : [],
    ),
  );
  const statements = new Map(
    changes
      .filter(({ scope }) => scope === "statement")
      .map((change) => [`${change.period}:${change.currency}`, change]),
  );
  const assignments = new Map(
    changes
      .filter(({ scope }) => scope === "assignment")
      .map((change) => [
        `${change.purchaseId}:${change.ordinal}:${change.currency}`,
        change,
      ]),
  );
  const purchases = data.expenses
    .filter((expense) => expense.cardId === cardId)
    .map((expense) => {
      const assignment: CycleAssignment = assignments.get(
        `${expense.id}:${expense.ordinal}:${expense.currency}`,
      ) ?? { version: 0, assignedPeriod: null };
      const estimatedPeriod =
        expense.installmentPeriod ??
        purchaseCycle(expense.effectiveOn, schedule, dates);
      return {
        ...expense,
        assignment,
        estimatedPeriod,
        period: assignment.assignedPeriod ?? estimatedPeriod,
      };
    });
  const payments = new Map(
    data.payments
      .filter((payment) => payment.cardId === cardId)
      .map(({ period, currency, amount }) => [`${period}:${currency}`, amount]),
  );
  const credits = new Map<string, string[]>();
  for (const line of data.credits) {
    if (line.cardId !== cardId) continue;
    const period = purchaseCycle(line.effectiveOn, schedule, dates);
    if (!period) continue;
    const key = `${period}:${line.currency}`;
    credits.set(key, [...(credits.get(key) ?? []), line.amount]);
  }
  return { schedule, dates, statements, purchases, payments, credits };
}

type CardCycleData = ReturnType<typeof cardCycleData>;

function summarizeCycle(
  data: CardCycleData,
  period: string,
  currency: Currency,
  today: string,
  amounts: string[],
) {
  const { schedule, dates, statements, payments, credits } = data;
  const cycleDates = dates.get(period) ?? defaultCycleDates;
  const statement = statements.get(`${period}:${currency}`) ?? defaultStatement;
  const paid = payments.get(`${period}:${currency}`) ?? "0.0000";
  const abonos = credits.get(`${period}:${currency}`) ?? [];
  const net = cycleAmount([
    ...amounts,
    ...abonos.map((amount) => `-${amount}`),
  ]);
  const estimate =
    amounts.length > 0 ||
    abonos.length > 0 ||
    cycleClosingOn(period, schedule, cycleDates)
      ? net.startsWith("-")
        ? "0.0000"
        : net
      : null;
  return {
    currency,
    statement,
    paid,
    estimate,
    credited: cycleAmount(abonos),
    ...statementStatus({
      period,
      schedule,
      dates: cycleDates,
      statement,
      estimate,
      paid,
      today,
    }),
  };
}

export async function loadCardCycle(
  client: pg.PoolClient,
  ownerId: string,
  card: CatalogCard,
  period: string,
  today: string,
) {
  const data = cardCycleData(
    await readCycles(client, ownerId, card.id),
    card.id,
  );
  return cycleForPeriod(data, card, period, today);
}

function cycleForPeriod(
  data: CardCycleData,
  card: CatalogCard,
  period: string,
  today: string,
) {
  const assigned = data.purchases.filter(
    (purchase) => purchase.period === period,
  );
  const unassigned = data.purchases.filter(
    (purchase) => !purchase.period && purchase.effectiveOn.startsWith(period),
  );
  return {
    schedule: data.schedule,
    dates: data.dates.get(period) ?? defaultCycleDates,
    summaries: card.currencies.map(({ currency }) =>
      summarizeCycle(
        data,
        period,
        currency,
        today,
        assigned
          .filter((purchase) => purchase.currency === currency)
          .map(({ amount }) => amount),
      ),
    ),
    purchases: [...assigned, ...unassigned],
  };
}

export async function reportCardCycles(
  client: pg.PoolClient,
  ownerId: string,
  cards: CatalogCard[],
  months: string[],
  to: string,
) {
  if (!cards.length) return [];
  const data = await readCycles(client, ownerId, undefined, to);
  return cards.flatMap((card) => {
    const cardData = cardCycleData(data, card.id);
    return months.map((month) => ({
      card,
      month,
      ...cycleForPeriod(cardData, card, month, to),
    }));
  });
}

export async function listCardCycleAlerts(
  client: pg.PoolClient,
  ownerId: string,
  cards: CatalogCard[],
  today: string,
  upcomingThrough?: string,
) {
  const data = await readCycles(client, ownerId);
  const alerts = cards
    .filter(({ kind }) => kind === "credit")
    .flatMap((card) => {
      const cardData = cardCycleData(data, card.id);
      const amountsByCycle = new Map<string, string[]>();
      for (const { period, currency, amount } of cardData.purchases) {
        if (!period) continue;
        const key = `${period}:${currency}`;
        const amounts = amountsByCycle.get(key) ?? [];
        amounts.push(amount);
        amountsByCycle.set(key, amounts);
      }
      const keys = new Set([
        ...amountsByCycle.keys(),
        ...cardData.statements.keys(),
        ...cardData.credits.keys(),
      ]);
      return [...keys].flatMap((key) => {
        const [period, code] = key.split(":");
        const currency = card.currencies.find(
          ({ currency }) => currency === code,
        )?.currency;
        if (!currency) return [];
        const summary = summarizeCycle(
          cardData,
          period,
          currency,
          today,
          amountsByCycle.get(key) ?? [],
        );
        const pending =
          summary.alert ||
          (upcomingThrough &&
            summary.dueOn &&
            summary.dueOn >= today &&
            summary.dueOn <= upcomingThrough &&
            summary.remaining !== null &&
            summary.remaining !== "0.0000");
        return pending && summary.dueOn && summary.remaining
          ? [
              {
                cardId: card.id,
                cardName: card.name,
                period,
                currency,
                alert: summary.alert,
                dueOn: summary.dueOn,
                dueSource: summary.dueSource,
                amount: summary.remaining,
                official: summary.statement.officialAmount !== null,
              },
            ]
          : [];
      });
    });
  return alerts.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;
const notFound = { status: "not-found" } as const;

export async function saveCardCycle(
  client: pg.PoolClient,
  ownerId: string,
  command: CycleCommand,
) {
  const { cardId, scope, idempotencyKey, version } = command;
  await lockCardWrites(client, ownerId);
  const hash = commandHash(["card-cycle-v1", JSON.stringify(command)]);
  const {
    rows: [replay],
  } = await client.query<{ id: string; hash: string }>(
    `SELECT card_id AS id, command_hash AS hash FROM finance.card_cycle_changes WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, idempotencyKey],
  );
  if (replay)
    return replay.hash === hash
      ? ({ status: "replayed", id: replay.id } as const)
      : conflict("Este envío ya se usó con otros datos.");

  const currency = "currency" in command ? command.currency : null;
  const period = "period" in command ? `${command.period}-01` : null;
  const purchaseId = scope === "assignment" ? command.purchaseId : null;
  const ordinal = scope === "assignment" ? command.ordinal : null;
  const {
    rows: [target],
  } = await client.query<{ version: number }>(
    `SELECT coalesce(change.version, 0) AS version FROM finance.cards c
      LEFT JOIN finance.current_card_cycles change ON (change.owner_id, change.card_id) = (c.owner_id, c.id)
        AND change.scope = $3 AND change.cycle_period IS NOT DISTINCT FROM $4::date
        AND change.currency IS NOT DISTINCT FROM $5::finance.currency
        AND change.purchase_id IS NOT DISTINCT FROM $6::uuid AND change.purchase_ordinal IS NOT DISTINCT FROM $7::smallint
      WHERE c.owner_id = $1 AND c.id = $2 AND c.kind = 'credit'
        AND ($5::finance.currency IS NULL OR EXISTS (SELECT 1 FROM finance.card_currencies p
          WHERE (p.owner_id, p.card_id, p.currency) = (c.owner_id, c.id, $5)))`,
    [ownerId, cardId, scope, period, currency, purchaseId, ordinal],
  );
  if (!target) return notFound;
  if (target.version !== version)
    return conflict(
      "El ciclo cambió. Actualizá la página antes de volver a guardar.",
    );

  if (
    scope === "assignment" ||
    scope === "statement" ||
    (scope === "dates" && command.closingOn)
  ) {
    const data = cardCycleData(
      await readCycles(client, ownerId, cardId),
      cardId,
    );
    if (scope === "statement") {
      const close = data.dates.get(command.period)?.closingOn;
      if (command.dueOn && close && command.dueOn < close)
        return conflict(
          "El vencimiento oficial es anterior al cierre informado para el ciclo.",
        );
    } else if (scope === "dates") {
      const close = command.closingOn;
      if (
        close &&
        [...data.statements.values()].some(
          ({ period, dueOn }) =>
            period === command.period && dueOn && dueOn < close,
        )
      )
        return conflict(
          "El cierre es posterior a un vencimiento oficial del ciclo. Revisá las fechas del emisor.",
        );
    } else {
      const purchase = data.purchases.find(
        (row) =>
          row.id === purchaseId &&
          row.currency === currency &&
          row.ordinal === ordinal,
      );
      if (!purchase) return notFound;
      const destination = command.assignedPeriod ?? purchase.estimatedPeriod;
      const impactsExisting = [purchase.period, destination].some(
        (period) =>
          period &&
          (data.statements.get(`${period}:${currency}`)?.officialAmount !=
            null ||
            data.payments.has(`${period}:${currency}`)),
      );
      if (
        purchase.period !== destination &&
        impactsExisting &&
        !command.reviewed
      )
        return conflict(
          "El ciclo de origen o destino tiene un resumen oficial o pagos registrados. Revisalos y confirmá que querés cambiar solo la estimación.",
        );
    }
  }

  await client.query(
    `INSERT INTO finance.card_cycle_changes (owner_id, idempotency_key, command_hash, card_id,
      scope, cycle_period, currency, purchase_id, purchase_ordinal, version, closing_day, due_day, lead_days,
      closing_on, due_on, official_amount, minimum_amount, assigned_period)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      ownerId,
      idempotencyKey,
      hash,
      cardId,
      scope,
      period,
      currency,
      purchaseId,
      ordinal,
      version + 1,
      scope === "schedule" ? command.closingDay : null,
      scope === "schedule" ? command.dueDay : null,
      scope === "schedule" ? command.leadDays : null,
      scope === "dates" ? command.closingOn : null,
      "dueOn" in command ? command.dueOn : null,
      scope === "statement" ? command.officialAmount : null,
      scope === "statement" ? command.minimumAmount : null,
      scope === "assignment" && command.assignedPeriod
        ? `${command.assignedPeriod}-01`
        : null,
    ],
  );
  return { status: "created", id: cardId } as const;
}
