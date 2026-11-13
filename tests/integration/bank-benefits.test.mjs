import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { setOwnerContext } from "../../src/db/owner-context.ts";
import { parseBankBenefitCommand } from "../../src/domain/bank-benefits.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseHistoryParams } from "../../src/domain/history.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import {
  getBankBenefit,
  listBankBenefits,
  saveBankBenefit,
} from "../../src/server/bank-benefits.ts";
import { loadCardCycle, saveCardCycle } from "../../src/server/card-cycles.ts";
import { listCards, saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { findHistoryEntry, listHistory } from "../../src/server/history.ts";
import {
  listMovementTotals,
  reviseMovement,
  saveMovement,
} from "../../src/server/movements.ts";
import { loadPeriodReport } from "../../src/server/period-report.ts";
import { listRefundTotals } from "../../src/server/refund-totals.ts";
import {
  loadStatistics,
  statisticsReady,
} from "../../src/server/statistics.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

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

test("F5-09: el abono a tarjeta convive con ciclos y el aislamiento A/B protege el beneficio", () =>
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
      await buy("500");
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
      assert.ok(cycle.summaries.length > 0);
      assert.equal((await findCard()).debt, "300.0000");

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
