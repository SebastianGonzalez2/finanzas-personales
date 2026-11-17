import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { formatBankAmount } from "../../src/domain/bank-balances.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import {
  formatStatisticsAmount,
  parseStatisticsParams,
  statisticsAnnualRange,
  statisticsHistoryRange,
} from "../../src/domain/statistics.ts";
import { saveOpeningBalance } from "../../src/server/bank-balances.ts";
import { listBudgets, saveBudget } from "../../src/server/budgets.ts";
import { saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  loadStatistics,
  loadStatisticsAnnual,
  prepareStatisticsFx,
  statisticsReady,
} from "../../src/server/statistics.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";

// QA-FINAL: Presupuestos y Estadísticas deben coincidir para la misma métrica,
// categoría, moneda y período. El oráculo de este archivo es independiente del
// código de producción: multiplica en enteros (BigInt), suma sin redondear cada
// conversión y redondea una sola vez a cuatro decimales (regla de QA-FIX-01).

const units = (value) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(4, "0").slice(0, 4));
};
const decimal = (scaled) => {
  const padded = scaled.toString().padStart(5, "0");
  return `${padded.slice(0, -4)}.${padded.slice(-4)}`;
};
// Estadísticas se compara normalizada; el consumo de Presupuestos se compara tal cual (QA-FIX-02 M-03).
const normalized = (value) => decimal(units(value));
const oracle = (pairs) => {
  const total = pairs.reduce(
    (sum, [amount, rate]) => sum + units(amount) * units(rate),
    BigInt(0),
  );
  return decimal((total + BigInt(5000)) / BigInt(10000));
};

test("QA-FINAL: Presupuestos y Estadísticas coinciden con UYU, USD y EUR, cuotas y más de 12 meses", async () => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 6 });
  const owner = randomUUID();
  const other = randomUUID();
  const categories = {
    super: randomUUID(),
    trips: randomUUID(),
    installments: randomUUID(),
  };
  const phase1 = "2025-03-15";
  const phase2 = "2026-02-15";
  const run = (work, ownerId = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const budget = async (month, category, today, ownerId = owner) => {
    const found = (
      await run((c, id) => listBudgets(c, id, month, today), ownerId)
    ).find(({ categoryId }) => categoryId === category);
    return found;
  };
  const rate = (base, date, value) =>
    pool.query(
      "INSERT INTO finance.fx_reference_rates(base_currency,quote_currency,observed_on,source,rate) VALUES ($1,'UYU',$2,'datosuruguay',$3)",
      [base, date, value],
    );
  const valuations = () =>
    run(async (c) =>
      (
        await c.query(
          "SELECT effective_on::text AS d, base_currency AS b FROM finance.fx_valuations ORDER BY 1,2",
        )
      ).rows.map(({ d, b }) => `${d}/${b}`),
    );
  const stats = async (category, from, to, today = to) => {
    const parsed = parseStatisticsParams(
      { from, to, display: "UYU", category },
      today,
    );
    assert.ok(!("error" in parsed), JSON.stringify(parsed));
    const { range, previous, filters } = parsed;
    const history = statisticsHistoryRange(range, today);
    const schema = await run(statisticsReady);
    await run((c, id) =>
      prepareStatisticsFx(
        c,
        id,
        range,
        previous,
        history,
        filters,
        schema,
        "UYU",
        today,
      ),
    );
    const snapshot = await run((c, id) =>
      loadStatistics(c, id, range, previous, history, filters, schema, "UYU"),
    );
    assert.deepEqual(snapshot.fx.missingFlows, []);
    return normalized(
      snapshot.totals.find(({ currency }) => currency === "UYU")?.expense ??
        "0",
    );
  };
  const expense = (categoryId, currency, amount, effectiveOn, concept) =>
    run((c, id) =>
      saveMovement(c, id, {
        kind: "expense",
        currency,
        amount,
        effectiveOn,
        method: "debit",
        concept,
        note: null,
        categoryId,
        idempotencyKey: randomUUID(),
      }),
    );
  try {
    const admin = await pool.connect();
    try {
      await admin.query("BEGIN");
      await migrateInTransaction(admin);
      await admin.query("COMMIT");
    } finally {
      await admin.query("ROLLBACK");
      admin.release();
    }
    // La caché de referencia queda vigente: nunca se consulta un proveedor real.
    await pool.query(
      "INSERT INTO finance.fx_reference_refreshes(year,retry_at,primary_pairs,backup_pairs) SELECT y,now()+interval '1 hour',ARRAY['USD/UYU','EUR/UYU'],ARRAY['USD/UYU','EUR/UYU'] FROM unnest(ARRAY[2024,2025,2026]) y",
    );
    for (const [base, date, value] of [
      ["USD", "2024-12-31", "40.1234"],
      ["USD", "2025-02-28", "41.5"],
      ["USD", "2025-03-31", "42.25"],
      ["EUR", "2024-12-31", "43.7777"],
      ["EUR", "2025-02-28", "45.5"],
      ["EUR", "2025-03-31", "46.35"],
    ])
      await rate(base, date, value);

    const card = await run(async (c, id) => {
      for (const [categoryId, name, limit] of [
        [categories.super, "Supermercado QA", "10000"],
        [categories.trips, "Viajes QA", "20000"],
        [categories.installments, "Cuotas QA", "30000"],
      ]) {
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,'expense')",
          [id, categoryId, name],
        );
        assert.equal(
          (
            await saveBudget(
              c,
              id,
              {
                action: "save",
                categoryId,
                currency: "UYU",
                amount: limit,
                idempotencyKey: randomUUID(),
              },
              "2024-12-15",
            )
          ).status,
          "created",
        );
      }
      for (const currency of ["UYU", "USD", "EUR"])
        await saveOpeningBalance(c, id, {
          currency,
          amount: "100000.0000",
          asOfDate: "2024-12-01",
        });
      return saveCard(c, id, {
        action: "create",
        kind: "credit",
        name: "Tarjeta QA",
        issuer: null,
        currencies: [
          { currency: "USD", limit: null },
          { currency: "EUR", limit: null },
        ],
        idempotencyKey: randomUUID(),
      });
    });

    // Gastos en tres monedas; Diciembre de 2024 queda a más de 12 meses de la fase 2.
    for (const [category, currency, amount, date, concept] of [
      [categories.super, "USD", "33.3300", "2024-12-31", "USD histórico"],
      [categories.super, "EUR", "12.3400", "2025-02-28", "EUR febrero"],
      [categories.super, "UYU", "250.5000", "2025-02-28", "UYU febrero"],
      [categories.super, "USD", "10.0100", "2025-03-10", "USD marzo"],
      [categories.super, "EUR", "0.0100", "2025-03-10", "EUR centavo uno"],
      [categories.super, "EUR", "0.0100", "2025-03-10", "EUR centavo dos"],
      [categories.trips, "EUR", "99.9900", "2025-03-12", "EUR viaje"],
      [categories.trips, "USD", "7.7700", "2025-03-12", "USD viaje"],
    ])
      assert.equal(
        (await expense(category, currency, amount, date, concept)).status,
        "created",
      );
    // Dos planes en cuotas, uno por moneda, con meses pasado, actual y futuro.
    for (const [currency, total, installment, count, period, date] of [
      ["USD", "300", "100", 3, "2025-02", "2025-02-10"],
      ["EUR", "80", "40", 2, "2025-03", "2025-03-05"],
    ]) {
      const purchase = parseCreditCommand(
        {
          action: "purchase",
          cardId: card.id,
          currency,
          amount: total,
          concept: `Cuotas ${currency} QA`,
          categoryId: categories.installments,
          effectiveOn: date,
          covered: false,
          plan: { installmentAmount: installment, count, firstPeriod: period },
          idempotencyKey: randomUUID(),
        },
        phase1,
      );
      assert.ok(!("error" in purchase), JSON.stringify(purchase));
      assert.equal(
        (await run((c, id) => saveCreditOperation(c, id, purchase))).status,
        "created",
      );
    }

    // Esperado por mes: [categoría, mes, hasta, importes y cotizaciones].
    const march = oracle([
      ["10.0100", "41.5"],
      ["0.0100", "45.5"],
      ["0.0100", "45.5"],
    ]);
    assert.equal(march, "416.3250");
    const expected = [
      ["super", "2024-12", [["33.3300", "40.1234"]]],
      ["super", "2025-01", []],
      [
        "super",
        "2025-02",
        [
          ["12.3400", "45.5"],
          ["250.5000", "1"],
        ],
      ],
      ["super", "2025-03", null, march],
      [
        "trips",
        "2025-03",
        [
          ["99.9900", "45.5"],
          ["7.7700", "41.5"],
        ],
      ],
      ["installments", "2025-02", [["100", "40.1234"]]],
      [
        "installments",
        "2025-03",
        [
          ["100", "41.5"],
          ["40", "45.5"],
        ],
      ],
    ];
    const monthEnd = (month) =>
      new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
        .toISOString()
        .slice(0, 10);
    // Fase 1: hoy es 15/03/2025. Presupuestos fija las cotizaciones primero.
    for (const [key, month, pairs, direct] of expected) {
      const category = categories[key];
      const want = direct ?? oracle(pairs);
      const to = month === "2025-03" ? phase1 : monthEnd(month);
      const consumed = (await budget(month, category, phase1)).progress
        .consumed;
      const total = await stats(category, `${month}-01`, to, phase1);
      assert.equal(consumed, want, `Presupuestos ${key} ${month}`);
      assert.equal(total, want, `Estadísticas ${key} ${month}`);
      const shown = formatBankAmount({ amount: consumed, currency: "UYU" });
      assert.equal(
        shown,
        formatStatisticsAmount(total, "UYU"),
        `Mismo texto ${key} ${month}`,
      );
      assert.match(shown, /^[\d.]+,\d{2} UYU$/, "dos decimales");
    }
    // El redondeo se hace sobre el agregado: 0,455 + 0,455 + 415,415 = 416,325.
    assert.equal(
      formatBankAmount({ amount: march, currency: "UYU" }),
      "416,33 UYU",
    );
    // Cero consumo en meses sin movimientos.
    assert.equal(
      (await budget("2025-01", categories.trips, phase1)).progress.consumed,
      "0.0000",
    );

    // Futuro: abril de 2025 se estima con la última cotización conocida, sin fijarla.
    const estimate = await budget("2025-04", categories.installments, phase1);
    assert.equal(
      estimate.progress.consumed,
      oracle([
        ["100", "41.5"],
        ["40", "45.5"],
      ]),
    );
    assert.ok(estimate.references.every(({ provisional }) => provisional));
    assert.ok(!(await valuations()).some((v) => v.startsWith("2025-04-01")));

    // Una cotización publicada después no reescribe lo ya fijado.
    await rate("USD", "2025-02-01", "99");
    await rate("EUR", "2025-03-01", "99");
    assert.equal(
      (await budget("2025-02", categories.installments, phase2)).progress
        .consumed,
      oracle([["100", "40.1234"]]),
    );
    assert.equal(
      (await budget("2025-03", categories.installments, phase2)).progress
        .consumed,
      oracle([
        ["100", "41.5"],
        ["40", "45.5"],
      ]),
    );

    // Fase 2: abril llega y se fija. Esta vez Estadísticas lee primero.
    const april = oracle([
      ["100", "42.25"],
      ["40", "46.35"],
    ]);
    assert.equal(april, "6079.0000");
    assert.equal(
      await stats(categories.installments, "2025-04-01", "2025-04-30", phase2),
      april,
    );
    const pinned = await budget("2025-04", categories.installments, phase2);
    assert.equal(pinned.progress.consumed, april);
    assert.ok(pinned.references.every(({ provisional }) => !provisional));
    assert.ok((await valuations()).includes("2025-04-01/USD"));

    // Más de 12 meses: 01/12/2024 → 15/02/2026 (14,5 meses) por categoría.
    const long = {
      super: [
        ["33.3300", "40.1234"],
        ["12.3400", "45.5"],
        ["250.5000", "1"],
        ["10.0100", "41.5"],
        ["0.0100", "45.5"],
        ["0.0100", "45.5"],
      ],
      trips: [
        ["99.9900", "45.5"],
        ["7.7700", "41.5"],
      ],
      installments: [
        ["100", "40.1234"],
        ["100", "41.5"],
        ["40", "45.5"],
        ["100", "42.25"],
        ["40", "46.35"],
      ],
    };
    for (const [key, pairs] of Object.entries(long)) {
      const total = await stats(categories[key], "2024-12-01", phase2);
      assert.equal(total, oracle(pairs), `Rango largo ${key}`);
      let months = BigInt(0);
      for (const month of [
        "2024-12",
        "2025-01",
        "2025-02",
        "2025-03",
        "2025-04",
        "2025-05",
      ])
        months += units(
          (await budget(month, categories[key], phase2)).progress.consumed,
        );
      assert.equal(
        months,
        units(total),
        `La suma de los presupuestos mensuales coincide en ${key}`,
      );
    }
    assert.equal(
      await stats(categories.installments, "2024-12-01", phase2),
      "16061.3400",
    );

    // STAT-ANNUAL: comparar importes exactos con el informe del mismo año.
    const years = [2024, 2025];
    const yearTotals = await Promise.all(
      years.map((year) =>
        stats(categories.super, `${year}-01-01`, `${year}-12-31`, phase2),
      ),
    );
    const annual = await run(async (c, id) =>
      loadStatisticsAnnual(
        c,
        id,
        statisticsAnnualRange(phase2),
        { period: "mes-actual", category: categories.super },
        await statisticsReady(c),
        "UYU",
      ),
    );
    assert.deepEqual(
      annual.series[0].points
        .filter(({ year }) => years.includes(year))
        .map(({ value }) => value),
      yearTotals.map((amount) => ({ status: "total", amount })),
    );

    // Aislamiento: otro titular no ve consumo ni presupuestos.
    assert.deepEqual(
      await run((c, id) => listBudgets(c, id, "2025-03", phase2), other),
      [],
    );
  } finally {
    try {
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    } finally {
      await pool.end();
    }
  }
});
