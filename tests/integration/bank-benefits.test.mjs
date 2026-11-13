import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import {
  setOwnerContext,
  withOwnerTransaction,
} from "../../src/db/owner-context.ts";
import { parseBankBenefitCommand } from "../../src/domain/bank-benefits.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  getBankBenefit,
  listBankBenefits,
  saveBankBenefit,
} from "../../src/server/bank-benefits.ts";
import { listBudgets, saveBudget } from "../../src/server/budgets.ts";
import { loadCardCycle, saveCardCycle } from "../../src/server/card-cycles.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import {
  saveClassification,
  saveTag,
} from "../../src/server/classification.ts";
import {
  listCreditPurchaseOptions,
  saveCreditOperation,
} from "../../src/server/credit-operations.ts";
import { findHistoryEntry, listHistory } from "../../src/server/history.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { loadPeriodReport } from "../../src/server/period-report.ts";
import { listRefundTotals } from "../../src/server/refund-totals.ts";
import { getRefundEntry, saveRefund } from "../../src/server/refunds.ts";
import {
  loadStatistics,
  statisticsReady,
} from "../../src/server/statistics.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import prepareFinanceBrowserDatabase from "../support/finance-browser.mjs";

const owner = "benefit-owner";
const other = "another-owner";
const today = "2026-02-27";
const january = "2026-01-20";
const february = "2026-02-20";
const currency = "UYU";

async function setup(run) {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await setOwnerContext(client, owner);
    const { id: cardId } = await saveCard(client, owner, {
      action: "create",
      kind: "credit",
      name: "Tarjeta",
      issuer: null,
      currencies: [{ currency, limit: null }],
      idempotencyKey: randomUUID(),
    });
    await saveOpeningBalance(client, owner, {
      currency,
      amount: "10000",
      asOfDate: "2026-01-01",
    });
    const bank = async () => {
      const [row] = await listBankBalances(client, owner);
      return Number(row.calculatedAmount ?? row.amount).toFixed(4);
    };
    const findCard = async () =>
      (await listCards(client, owner)).find(({ id }) => id === cardId)
        .currencies[0];
    const benefit = (fields = {}, as = owner, key = randomUUID()) => {
      const command = parseBankBenefitCommand(
        {
          action: "register",
          idempotencyKey: key,
          destination: "bank",
          currency,
          amount: "300",
          effectiveOn: february,
          concept: "Cashback del banco",
          credited: true,
          ...fields,
        },
        today,
      );
      assert.ok(!("error" in command), command.error);
      return saveBankBenefit(client, as, command);
    };
    const voidBenefit = (eventId, as = owner, key = randomUUID()) =>
      saveBankBenefit(client, as, {
        action: "void",
        eventId,
        idempotencyKey: key,
      });
    const created = async (result) => {
      const saved = await result;
      assert.equal(saved.status, "created", JSON.stringify(saved));
      return saved.id;
    };
    const expense = async (fields = {}) => {
      const movement = parseMovement(
        {
          kind: "expense",
          amount: "2000",
          currency,
          method: "debit",
          concept: "Ropa",
          effectiveOn: january,
          idempotencyKey: randomUUID(),
          ...fields,
        },
        today,
      );
      assert.ok(!("error" in movement), movement.error);
      return created(saveMovement(client, owner, movement));
    };
    const buy = async (amount, effectiveOn = january) => {
      const command = parseCreditCommand(
        {
          action: "purchase",
          cardId,
          effectiveOn,
          idempotencyKey: randomUUID(),
          concept: "Compra con tarjeta",
          currency,
          amount,
          covered: false,
        },
        today,
      );
      assert.ok(!("error" in command), command.error);
      return created(saveCreditOperation(client, owner, command));
    };
    const count = async (sql, ...params) =>
      Number((await client.query(sql, params)).rows[0].count);
    await run({
      client,
      cardId,
      bank,
      findCard,
      benefit,
      voidBenefit,
      created,
      expense,
      buy,
      count,
    });
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

test("F5-09 CA-067: cashback acreditado en Bancos es un ingreso único que no toca compras", () =>
  setup(
    async ({ client, bank, benefit, voidBenefit, created, expense, count }) => {
      const purchaseId = await expense();
      assert.equal(await bank(), "8000.0000");
      const purchaseBefore = (
        await client.query(
          `SELECT f.status, f.effective_on::text, e.amount_signed::text
             FROM finance.financial_events f JOIN finance.bank_effects e
               ON (e.owner_id, e.event_id) = (f.owner_id, f.id)
            WHERE f.id = $1`,
          [purchaseId],
        )
      ).rows;
      const consumption = () =>
        client
          .query(
            "SELECT currency, sum(amount)::text AS amount FROM finance.budget_expenses WHERE owner_id = $1 GROUP BY currency",
            [owner],
          )
          .then(({ rows }) => rows);
      const consumptionBefore = await consumption();
      assert.equal(consumptionBefore.length, 1);
      const januaryBefore = await listMovementTotals(
        client,
        owner,
        "2026-01-01",
      );

      const key = randomUUID();
      const id = await created(benefit({}, owner, key));
      assert.equal(await bank(), "8300.0000");
      // Reintento con la misma clave: no vuelve a acreditar ni a contar.
      assert.deepEqual(await benefit({}, owner, key), {
        status: "replayed",
        id,
      });
      assert.equal(
        (await benefit({ amount: "301" }, owner, key)).status,
        "conflict",
      );
      assert.equal(await bank(), "8300.0000");
      assert.equal(
        await count("SELECT count(*) FROM finance.bank_benefits"),
        1,
      );
      assert.equal(
        await count(
          "SELECT count(*) FROM finance.bank_effects WHERE event_id = $1",
          id,
        ),
        1,
      );

      // Ingreso por beneficio bancario en el mes de acreditación, una vez.
      assert.deepEqual(await listMovementTotals(client, owner, "2026-02-01"), [
        { kind: "income", currency, amount: "300.0000" },
      ]);
      assert.deepEqual(
        await listMovementTotals(client, owner, "2026-01-01"),
        januaryBefore,
      );
      // La compra original y el flujo de devoluciones quedan intactos.
      assert.deepEqual(
        (
          await client.query(
            `SELECT f.status, f.effective_on::text, e.amount_signed::text
               FROM finance.financial_events f JOIN finance.bank_effects e
                 ON (e.owner_id, e.event_id) = (f.owner_id, f.id)
              WHERE f.id = $1`,
            [purchaseId],
          )
        ).rows,
        purchaseBefore,
      );
      assert.equal(
        await count("SELECT count(*) FROM finance.purchase_refunds"),
        0,
      );
      // El consumo presupuestario no se altera: el cashback no es un gasto negativo.
      assert.deepEqual(await consumption(), consumptionBefore);
      assert.deepEqual(await listRefundTotals(client, owner, "2026-02-01"), []);

      const { entries } = await listHistory(
        client,
        owner,
        parseHistoryParams({ kind: "bank_benefit", status: "confirmed" }),
      );
      assert.deepEqual(
        entries.map(({ id: entry, kind, amount, method, concept }) => [
          entry,
          kind,
          amount,
          method,
          concept,
        ]),
        [[id, "bank_benefit", "300.0000", "deposit", "Cashback del banco"]],
      );
      assert.equal(
        (await findHistoryEntry(client, owner, id, false)).amount,
        "300.0000",
      );
      assert.equal(
        (
          await listHistory(
            client,
            owner,
            parseHistoryParams({ kind: "income" }),
          )
        ).entries.length,
        0,
      );

      const tagId = randomUUID();
      assert.deepEqual(
        await saveTag(client, owner, {
          action: "create",
          id: tagId,
          name: "Banco",
        }),
        { id: tagId },
      );
      assert.deepEqual(
        await saveClassification(client, owner, {
          eventId: id,
          version: 0,
          idempotencyKey: randomUUID(),
          tagIds: [tagId],
        }),
        { id },
      );
      assert.equal(
        (
          await saveClassification(client, owner, {
            eventId: id,
            version: 1,
            idempotencyKey: randomUUID(),
            allocations: [{ categoryId: null, amount: "300.0000" }],
          })
        ).status,
        409,
      );
      const tagged = await listHistory(
        client,
        owner,
        parseHistoryParams({ tags: tagId, category: "none" }),
      );
      assert.deepEqual(
        tagged.entries.map((entry) => entry.id),
        [id],
      );

      // Informe y estadísticas cuentan el beneficio como ingreso, una sola vez.
      const report = await loadPeriodReport(client, owner, {
        from: "2026-02-01",
        to: "2026-02-28",
      });
      assert.deepEqual(
        report.resumen.filter(([concept]) => concept === "Ingreso"),
        [["Ingreso", currency, "300.0000", "0", "300.0000"]],
      );
      assert.deepEqual(
        report.resumen.filter(([concept]) => concept === "Gasto"),
        [],
      );
      const schema = await statisticsReady(client);
      assert.equal(schema.benefits, true);
      const snapshot = await loadStatistics(
        client,
        owner,
        { from: "2026-02-01", to: "2026-02-28", label: "feb", complete: true },
        null,
        { from: "2026-02-01", to: "2026-02-28", label: "feb", complete: true },
        { period: "personalizado", from: "2026-02-01", to: "2026-02-28" },
        schema,
      );
      assert.deepEqual(
        snapshot.totals.map(({ currency: code, income, expense, refunds }) => ({
          code,
          income,
          expense,
          refunds,
        })),
        [
          {
            code: currency,
            income: "300.0000",
            expense: "0.0000",
            refunds: "0.0000",
          },
        ],
      );

      // Sin saldo bancario en esa moneda no hay ingreso ficticio.
      assert.equal((await benefit({ currency: "USD" })).status, "conflict");
      assert.equal(
        await count("SELECT count(*) FROM finance.bank_benefits"),
        1,
      );

      // La compra de enero no se puede anular y el beneficio sí, con auditoría.
      assert.equal((await voidBenefit(id)).status, "revised");
      assert.equal(await bank(), "8000.0000");
      assert.deepEqual(
        await listMovementTotals(client, owner, "2026-02-01"),
        [],
      );
      assert.equal((await voidBenefit(id)).status, "conflict");
      assert.equal((await getBankBenefit(client, owner, id)).status, "voided");
      assert.equal(
        (
          await reviseMovement(client, owner, {
            action: "void",
            eventId: id,
            idempotencyKey: randomUUID(),
          })
        ).status !== "revised",
        true,
      );
      assert.deepEqual(
        await listBankBenefits(client, owner).then((rows) =>
          rows.map(({ status }) => status),
        ),
        ["voided"],
      );
    },
  ));

test("F5-09: cashback acreditado solo en tarjeta reduce deuda y no crea depósito en Bancos", () =>
  setup(
    async ({
      client,
      cardId,
      bank,
      findCard,
      benefit,
      voidBenefit,
      created,
      buy,
      count,
    }) => {
      await buy("1000");
      assert.equal((await findCard()).debt, "1000.0000");
      const first = await created(
        benefit({ destination: "card", cardId, amount: "300" }),
      );
      assert.equal((await findCard()).debt, "700.0000");
      assert.equal((await findCard()).creditBalance, "0.0000");
      assert.equal(await bank(), "10000.0000");
      assert.equal(
        await count(
          "SELECT count(*) FROM finance.bank_effects WHERE event_id = $1",
          first,
        ),
        0,
      );
      assert.deepEqual(await listMovementTotals(client, owner, "2026-02-01"), [
        { kind: "income", currency, amount: "300.0000" },
      ]);
      const [entry] = await listBankBenefits(client, owner);
      assert.deepEqual(
        [entry.destination, entry.debtReduced, entry.creditDelta, entry.card],
        ["card", "300.0000", "0.0000", "Tarjeta"],
      );
      const history = await listHistory(
        client,
        owner,
        parseHistoryParams({ kind: "bank_benefit", method: "credit" }),
      );
      assert.deepEqual(
        history.entries.map(({ id, method }) => [id, method]),
        [[first, "credit"]],
      );
      assert.equal(
        (
          await listHistory(
            client,
            owner,
            parseHistoryParams({ kind: "bank_benefit", method: "deposit" }),
          )
        ).entries.length,
        0,
      );

      // El excedente sobre la deuda queda como saldo a favor real.
      const second = await created(
        benefit({
          destination: "card",
          cardId,
          amount: "800",
          effectiveOn: "2026-02-21",
        }),
      );
      assert.equal((await findCard()).debt, "0.0000");
      assert.equal((await findCard()).creditBalance, "100.0000");
      const third = await created(
        benefit({
          destination: "card",
          cardId,
          amount: "50",
          effectiveOn: "2026-02-22",
        }),
      );
      assert.equal((await findCard()).creditBalance, "150.0000");
      assert.equal(await bank(), "10000.0000");
      assert.deepEqual(await listMovementTotals(client, owner, "2026-02-01"), [
        { kind: "income", currency, amount: "1150.0000" },
      ]);

      // Fechas previas al último movimiento requieren conciliación.
      assert.equal(
        (
          await benefit({
            destination: "card",
            cardId,
            amount: "10",
            effectiveOn: "2026-02-10",
          })
        ).status,
        "conflict",
      );
      // Anular exige revertir en orden: hay un abono posterior.
      assert.equal((await voidBenefit(second)).status, "conflict");
      assert.equal((await voidBenefit(third)).status, "revised");
      assert.equal((await findCard()).creditBalance, "100.0000");
      assert.equal((await voidBenefit(second)).status, "revised");
      assert.equal((await findCard()).debt, "700.0000");
      assert.equal((await findCard()).creditBalance, "0.0000");
      assert.equal((await voidBenefit(first)).status, "revised");
      assert.equal((await findCard()).debt, "1000.0000");
      assert.deepEqual(
        await listMovementTotals(client, owner, "2026-02-01"),
        [],
      );
      assert.equal(await bank(), "10000.0000");

      // Moneda inexistente en la tarjeta, o tarjeta ajena: no se registra.
      assert.equal(
        (await benefit({ destination: "card", cardId, currency: "USD" }))
          .status,
        "not-found",
      );
      assert.equal(
        (
          await benefit({
            destination: "card",
            cardId: randomUUID(),
            amount: "10",
          })
        ).status,
        "not-found",
      );
    },
  ));

test("F5-09: el abono figura en la estimación del ciclo y el aislamiento A/B protege el beneficio", () =>
  setup(
    async ({
      client,
      cardId,
      findCard,
      benefit,
      voidBenefit,
      created,
      buy,
      count,
    }) => {
      const original = await buy("500", "2026-02-10");
      const id = await created(
        benefit({ destination: "card", cardId, amount: "200" }),
      );
      const schedule = await saveCardCycle(client, owner, {
        scope: "schedule",
        cardId,
        version: 0,
        closingDay: 25,
        dueDay: 5,
        leadDays: 3,
        idempotencyKey: randomUUID(),
      });
      assert.equal(schedule.status, "created");
      const card = (await listCards(client, owner)).find(
        ({ id: current }) => current === cardId,
      );
      const cycle = await loadCardCycle(client, owner, card, "2026-02", today);
      const [summary] = cycle.summaries;
      assert.equal(summary.credited, "200.0000");
      assert.equal(summary.remaining, "300.0000");
      assert.equal(summary.paid, "0.0000");
      assert.equal(cycle.purchases[0].amount, "500.0000");
      assert.equal((await findCard()).debt, "300.0000");
      const [purchase] = await listCreditPurchaseOptions(client, owner);
      assert.equal(purchase.id, original);
      assert.equal(purchase.amount, "500.0000");

      const report = await loadPeriodReport(client, owner, {
        from: "2026-02-01",
        to: "2026-02-28",
      });
      assert.deepEqual(report.tarjetas, [
        [
          card.name,
          "2026-02",
          currency,
          "500.0000",
          "0.0000",
          "300.0000",
          "200.0000",
        ],
      ]);
      assert.equal(
        report.movimientos.find((row) => row[10] === id)[5],
        card.name,
      );

      // Otro titular no ve, no anula ni usa la tarjeta ajena.
      await setOwnerContext(client, other);
      assert.equal(await getBankBenefit(client, other, id), undefined);
      assert.deepEqual(await listBankBenefits(client, other), []);
      assert.equal(await findHistoryEntry(client, other, id, false), undefined);
      assert.equal((await voidBenefit(id, other)).status, "not-found");
      assert.equal(
        (await benefit({ destination: "card", cardId, amount: "10" }, other))
          .status,
        "not-found",
      );
      assert.equal(
        await count("SELECT count(*) FROM finance.bank_benefits"),
        0,
      );
      assert.deepEqual(
        await listMovementTotals(client, other, "2026-02-01"),
        [],
      );
      await setOwnerContext(client, owner);
      assert.equal(
        (await getBankBenefit(client, owner, id)).amount,
        "200.0000",
      );
    },
  ));

test("F5-09 CA-028 y CA-067: reembolsos y cashback al cambiar de mes en Montevideo", () =>
  setup(
    async ({
      client,
      cardId,
      bank,
      findCard,
      benefit,
      created,
      expense,
      buy,
    }) => {
      const categoryId = randomUUID();
      const beforeMidnight = bankReferenceToday(
        new Date("2026-02-01T02:59:59Z"),
      );
      const afterMidnight = bankReferenceToday(
        new Date("2026-02-01T03:00:00Z"),
      );
      assert.equal(beforeMidnight, "2026-01-31");
      assert.equal(afterMidnight, "2026-02-01");
      await client.query(
        "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','Ropa')",
        [owner, categoryId],
      );
      const budget = parseBudgetCommand(
        {
          action: "save",
          idempotencyKey: randomUUID(),
          categoryId,
          currency,
          amount: "5000",
        },
        today,
      );
      assert.ok(!("error" in budget));
      assert.equal(
        (await saveBudget(client, owner, budget, today)).status,
        "created",
      );
      const debitPurchase = await expense({
        categoryId,
        effectiveOn: beforeMidnight,
      });
      const creditPurchase = await buy("1000", beforeMidnight);
      await expense({ categoryId, amount: "3000", effectiveOn: february });
      const budgetsBefore = await listBudgets(client, owner, "2026-02");
      assert.equal(budgetsBefore[0].progress.consumed, "3000.0000");
      assert.equal(await bank(), "5000.0000");
      const originals = await Promise.all(
        [debitPurchase, creditPurchase].map((id) =>
          findHistoryEntry(client, owner, id, false),
        ),
      );

      const request = parseRefundCommand(
        {
          action: "pending",
          purchaseId: debitPurchase,
          amount: "500",
          effectiveOn: afterMidnight,
          idempotencyKey: randomUUID(),
        },
        today,
      );
      assert.ok(!("error" in request), request.error);
      const pendingId = await created(saveRefund(client, owner, request));

      const refunds = [];
      for (const [purchaseId, method, category, amount] of [
        [debitPurchase, "debit", categoryId, "500"],
        [creditPurchase, "credit", null, "200"],
      ]) {
        const command = parseRefundCommand(
          {
            action: "credit",
            purchaseId,
            pendingId: method === "debit" ? pendingId : null,
            parts: [{ method, categoryId: category, amount }],
            effectiveOn: afterMidnight,
            idempotencyKey: randomUUID(),
          },
          today,
        );
        assert.ok(!("error" in command), command.error);
        const id = await created(saveRefund(client, owner, command));
        const entry = await getRefundEntry(client, owner, id);
        assert.equal(entry.purchaseId, purchaseId);
        assert.equal(entry.effectiveOn, afterMidnight);
        refunds.push(entry);
      }
      assert.equal(await bank(), "5500.0000");
      assert.equal((await findCard()).debt, "800.0000");
      const benefitId = await created(
        benefit({ destination: "card", cardId, effectiveOn: afterMidnight }),
      );
      assert.equal(await bank(), "5500.0000");
      assert.equal((await findCard()).debt, "500.0000");
      assert.deepEqual(
        await listBudgets(client, owner, "2026-02"),
        budgetsBefore,
      );
      assert.deepEqual(
        await Promise.all(
          [debitPurchase, creditPurchase].map((id) =>
            findHistoryEntry(client, owner, id, false),
          ),
        ),
        originals,
      );
      assert.deepEqual(await listMovementTotals(client, owner, "2026-01-01"), [
        { kind: "expense", currency, amount: "3000.0000" },
      ]);
      const movements = await listMovementTotals(client, owner, "2026-02-01");
      assert.deepEqual(
        movements.sort((a, b) => a.kind.localeCompare(b.kind)),
        [
          { kind: "expense", currency, amount: "3000.0000" },
          { kind: "income", currency, amount: "300.0000" },
        ],
      );
      assert.deepEqual(await listRefundTotals(client, owner, "2026-01-01"), []);
      assert.deepEqual(await listRefundTotals(client, owner, "2026-02-01"), [
        { currency, amount: "700.0000" },
      ]);

      const period = { from: "2026-02-01", to: "2026-02-28" };
      const range = { ...period, label: "Febrero", complete: true };
      const schema = await statisticsReady(client);
      const statistics = await loadStatistics(
        client,
        owner,
        range,
        null,
        range,
        { period: "personalizado", ...period },
        schema,
      );
      assert.deepEqual(
        statistics.totals.map(({ income, expense, refunds }) => [
          income,
          expense,
          refunds,
        ]),
        [["300.0000", "3000.0000", "700.0000"]],
      );
      assert.equal(
        statistics.categories.find((row) => row.categoryId === categoryId)
          ?.amount,
        "3000.0000",
      );
      const cardDetail = await loadStatistics(
        client,
        owner,
        range,
        null,
        range,
        { period: "personalizado", ...period, card: cardId },
        schema,
      );
      assert.deepEqual(
        new Map(cardDetail.entries.map(({ id, kind }) => [id, kind])),
        new Map([
          [benefitId, "income"],
          [refunds[1].id, "refund"],
        ]),
      );

      const report = await loadPeriodReport(client, owner, period);
      assert.equal(
        (await getRefundEntry(client, owner, pendingId)).status,
        "confirmed",
      );
      assert.ok(!report.movimientos.some((row) => row[10] === pendingId));
      const totals = Object.fromEntries(
        report.resumen.map(([concept, , amount]) => [concept, amount]),
      );
      assert.equal(totals.Ingreso, "300.0000");
      assert.equal(totals["Gasto por categoría · Ropa"], "3000.0000");
      assert.equal(totals["Reembolso acreditado"], "700.0000");
      assert.deepEqual(report.presupuestos[0].slice(0, 6), [
        "2026-02",
        "Ropa",
        currency,
        "5000.0000",
        "3000.0000",
        "2000.0000",
      ]);
      for (const { id, purchaseId, amount, card } of refunds) {
        const row = report.movimientos.find((entry) => entry[10] === id);
        assert.deepEqual(
          [row[0], row[1], row[5], row[8], row[11]],
          [
            afterMidnight,
            "Devolución recibida",
            card ?? "",
            amount,
            purchaseId,
          ],
        );
      }
      const cashback = report.movimientos.find(
        (entry) => entry[10] === benefitId,
      );
      assert.deepEqual([cashback[1], cashback[11]], ["Beneficio bancario", ""]);
    },
  ));

test("F5-09: dos conexiones concurrentes registran un solo abono", async () => {
  const cleanup = await prepareFinanceBrowserDatabase();
  const pool = new pg.Pool(testDatabaseConfig());
  const tx = (work) =>
    withOwnerTransaction(pool, async () => ({ ownerId: owner }), work);
  try {
    await tx((client, id) =>
      saveOpeningBalance(client, id, {
        currency,
        amount: "1000",
        asOfDate: january,
      }),
    );
    const command = parseBankBenefitCommand(
      {
        action: "register",
        destination: "bank",
        currency,
        amount: "300",
        effectiveOn: february,
        idempotencyKey: randomUUID(),
        credited: true,
      },
      today,
    );
    assert.ok(!("error" in command));

    const results = await Promise.all(
      [1, 2].map(() =>
        tx((client, id) => saveBankBenefit(client, id, command)),
      ),
    );
    assert.deepEqual(results.map(({ status }) => status).sort(), [
      "created",
      "replayed",
    ]);
    assert.equal(results[0].id, results[1].id);
    await tx(async (client, id) => {
      assert.equal((await listBankBenefits(client, id)).length, 1);
      assert.equal(
        (await listBankBalances(client, id))[0].calculatedAmount,
        "1300.0000",
      );
    });
  } finally {
    try {
      await pool.end();
    } finally {
      await cleanup();
    }
  }
});

test("F5-09: la migración deja copia de cuenta y diseño verificados con la tabla nueva", async () => {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    const { rows } = await client.query(
      `SELECT 'bank_benefits' = ANY(finance.account_backup_tables()) AS listed,
              finance.account_backup_layout() = (SELECT layout FROM finance_meta.account_backup_layout) AS fingerprint`,
    );
    assert.deepEqual(rows, [{ listed: true, fingerprint: true }]);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
