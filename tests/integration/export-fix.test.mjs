import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { bankReferenceToday } from "../../src/domain/bank-balances.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseCycleCommand } from "../../src/domain/card-cycles.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { REPORT_SECTIONS } from "../../src/lib/export/report-format.ts";
import {
  listBankBalances,
  saveOpeningBalance,
} from "../../src/server/bank-balances.ts";
import { saveBudget } from "../../src/server/budgets.ts";
import { saveCardCycle } from "../../src/server/card-cycles.ts";
import { saveCard } from "../../src/server/cards.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  loadPeriodReport,
  prepareReportBudgets,
  reportReferenceDates,
} from "../../src/server/period-report.ts";
import { saveRefund } from "../../src/server/refunds.ts";
import { generateReport } from "../../src/server/report-files.ts";
import { saveSavingsFund } from "../../src/server/savings-funds.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import {
  cardCommand,
  creditPayment,
  creditPurchase,
} from "../support/f2-10-fixtures.mjs";
import {
  parseCsvReport,
  parseXlsxReport,
  pdfText,
  readAll,
} from "../support/report-readers.mjs";

// EXPORT-FIX: el informe del período se compara con valores esperados que se
// calculan aquí, a mano y en enteros, a partir de los datos sintéticos de la
// prueba. Los tres formatos se abren y se leen: el contenido de CSV, XLSX y PDF
// debe coincidir con las filas del informe y no puede faltar ni duplicarse nada.

// Año alejado del resto de las pruebas: las cotizaciones de referencia son un
// caché global de la base desechable y no se deben mezclar con otras fixtures.
const Y = "2037";
const today = `${Y}-05-31`;
const period = { from: `${Y}-03-01`, to: `${Y}-04-30` };
const d = (monthDay) => `${Y}-${monthDay}`;

const units = (value) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(4, "0").slice(0, 4));
};
const decimal = (scaled) => {
  const negative = scaled < BigInt(0);
  const padded = (negative ? -scaled : scaled).toString().padStart(5, "0");
  return `${negative ? "-" : ""}${padded.slice(0, -4)}.${padded.slice(-4)}`;
};
const sum = (...values) =>
  decimal(values.reduce((total, value) => total + units(value), BigInt(0)));
// Multiplica en enteros, suma sin redondear cada conversión y redondea una vez.
const converted = (pairs) =>
  decimal(
    (pairs.reduce(
      (total, [amount, rate]) => total + units(amount) * units(rate),
      BigInt(0),
    ) +
      BigInt(5000)) /
      BigInt(10000),
  );

const ok = (result) => {
  if ("error" in result) throw new Error(result.error);
  return result;
};
const created = (result) => {
  assert.ok(
    result.status === "created" || result.status === "saved",
    `Alta sintética rechazada: ${JSON.stringify(result)}`,
  );
  return result;
};

test("EXPORT-FIX: informes CSV, Excel y PDF completos, exactos y consistentes", async (t) => {
  const pool = new pg.Pool({ ...testDatabaseConfig(), max: 6 });
  const owner = randomUUID();
  const other = randomUUID();
  const run = (work, ownerId = owner) =>
    withOwnerTransaction(pool, async () => ({ ownerId }), work);
  const cat = {
    super: randomUUID(),
    home: randomUUID(),
    installments: randomUUID(),
    salary: randomUUID(),
    extraA: randomUUID(),
    extraB: randomUUID(),
  };
  const names = {
    [cat.super]: "Supermercado QA",
    [cat.home]: "Hogar QA",
    [cat.installments]: "Cuotas QA",
    [cat.salary]: "Sueldo QA",
    [cat.extraA]: "Extra A QA",
    [cat.extraB]: "Extra B QA",
  };
  const movement = (ownerId, input) =>
    run(
      (c, id) =>
        saveMovement(
          c,
          id,
          ok(
            parseMovement(
              {
                note: null,
                categoryId: null,
                idempotencyKey: randomUUID(),
                ...input,
              },
              today,
            ),
          ),
        ),
      ownerId,
    );
  const expense = (concept, amount, date, extra = {}) =>
    movement(owner, {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount,
      effectiveOn: d(date),
      concept,
      ...extra,
    });
  const income = (concept, amount, date, extra = {}) =>
    movement(owner, {
      kind: "income",
      method: "deposit",
      currency: "UYU",
      amount,
      effectiveOn: d(date),
      concept,
      ...extra,
    });
  const operation = (command) =>
    run((c, id) =>
      saveCreditOperation(c, id, ok(parseCreditCommand(command, today))),
    );
  // Mismos pasos que POST /api/export: referencias pendientes, captura de las
  // cotizaciones históricas (las proveedoras ya están vigentes en la prueba) y
  // lectura del informe.
  const report = async (range = period, ownerId = owner) => {
    await run((c, id) => reportReferenceDates(c, id, range, today), ownerId);
    await run((c, id) => prepareReportBudgets(c, id, range, today), ownerId);
    return run((c, id) => loadPeriodReport(c, id, range, today), ownerId);
  };
  const rowsOf = (data, id) => data[id];
  const map = (rows, keyColumns) =>
    new Map(rows.map((row) => [keyColumns.map((i) => row[i]).join("|"), row]));

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
    // Referencias ya vigentes: nunca se consulta un proveedor real.
    await pool.query(
      "INSERT INTO finance.fx_reference_refreshes(year,retry_at,primary_pairs,backup_pairs) SELECT y,now()+interval '1 hour',ARRAY['USD/UYU','EUR/UYU'],ARRAY['USD/UYU','EUR/UYU'] FROM unnest(ARRAY[$1::int-1,$1::int,$1::int+1]) y ON CONFLICT (year) DO UPDATE SET retry_at=excluded.retry_at, primary_pairs=excluded.primary_pairs, backup_pairs=excluded.backup_pairs",
      [Number(Y)],
    );
    for (const [base, date, value] of [
      ["USD", `${Y}-02-28`, "41.5"],
      ["USD", `${Y}-03-31`, "42.25"],
      ["EUR", `${Y}-02-28`, "45.5"],
    ])
      await pool.query(
        "INSERT INTO finance.fx_reference_rates(base_currency,quote_currency,observed_on,source,rate) VALUES ($1,'UYU',$2,'datosuruguay',$3) ON CONFLICT DO NOTHING",
        [base, date, value],
      );

    const { cardA, cardB } = await run(async (c, id) => {
      for (const [categoryId, kind] of [
        [cat.super, "expense"],
        [cat.home, "expense"],
        [cat.installments, "expense"],
        [cat.salary, "income"],
        [cat.extraA, "income"],
        [cat.extraB, "income"],
      ])
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,$4)",
          [id, categoryId, names[categoryId], kind],
        );
      for (const [categoryId, limit] of [
        [cat.super, "10000"],
        [cat.installments, "20000"],
      ])
        created(
          await saveBudget(
            c,
            id,
            ok(
              parseBudgetCommand(
                {
                  idempotencyKey: randomUUID(),
                  action: "save",
                  categoryId,
                  currency: "UYU",
                  amount: limit,
                },
                `${Y}-01-15`,
              ),
            ),
            `${Y}-01-15`,
          ),
        );
      for (const [currency, amount] of [
        ["UYU", "100000.0000"],
        ["USD", "5000.0000"],
        ["EUR", "3000.0000"],
      ])
        await saveOpeningBalance(c, id, {
          currency,
          amount,
          asOfDate: `${Y}-01-01`,
        });
      const cardA = await saveCard(c, id, {
        ...cardCommand({ name: "Tarjeta A QA" }),
        currencies: [
          { currency: "UYU", limit: null },
          { currency: "USD", limit: null },
        ],
      });
      const cardB = await saveCard(
        c,
        id,
        cardCommand({ name: "Tarjeta B QA" }),
      );
      created(
        await saveCardCycle(
          c,
          id,
          ok(
            parseCycleCommand({
              cardId: cardA.id,
              version: 0,
              idempotencyKey: randomUUID(),
              scope: "schedule",
              closingDay: 25,
              dueDay: 10,
              leadDays: 3,
            }),
          ),
        ),
      );
      return { cardA, cardB };
    });

    // Titular B: nada de esto puede aparecer en el informe de A.
    await run(async (c, id) => {
      await saveOpeningBalance(c, id, {
        currency: "UYU",
        amount: "999.0000",
        asOfDate: `${Y}-01-01`,
      });
    }, other);
    await movement(other, {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount: "500.0000",
      effectiveOn: d("03-15"),
      concept: "Exclusiva del titular B",
    });

    // Ingresos: sueldo, un ingreso dividido entre dos categorías y uno anterior.
    created(
      await income("Sueldo marzo", "50000.0000", "03-05", {
        categoryId: cat.salary,
      }),
    );
    created(
      await income("Ingreso dividido", "1000.0000", "03-10", {
        allocations: [
          { categoryId: cat.extraA, amount: "600.0000" },
          { categoryId: cat.extraB, amount: "400.0000" },
        ],
      }),
    );
    created(
      await movement(owner, {
        kind: "income",
        method: "deposit",
        currency: "USD",
        amount: "200.5000",
        effectiveOn: d("02-20"),
        concept: "Ingreso USD anterior",
      }),
    );
    // Gastos: bordes del rango, fuera del rango, USD y una compra dividida.
    created(
      await expense("Fuera antes", "777.0000", "02-28", {
        categoryId: cat.super,
      }),
    );
    created(
      await expense("Fuera después", "888.0000", "05-01", {
        categoryId: cat.super,
      }),
    );
    created(
      await expense("Borde inicial", "111.0000", "03-01", {
        categoryId: cat.super,
      }),
    );
    created(
      await expense("@borde final", "222.0000", "04-30", {
        categoryId: cat.super,
      }),
    );
    created(
      await expense('=1+1; "fórmula"', "100.0000", "04-01", {
        categoryId: cat.super,
      }),
    );
    created(
      await expense("Compra dividida", "1234.5678", "03-31", {
        allocations: [
          { categoryId: cat.super, amount: "1000.0000" },
          { categoryId: cat.home, amount: "234.5678" },
        ],
      }),
    );
    created(
      await expense("Gasto en USD", "10.0100", "03-10", {
        currency: "USD",
        categoryId: cat.super,
      }),
    );

    // Tarjeta A: compra, cuotas en USD, pago del ciclo y pago con conversión.
    const purchaseA = created(
      await operation(
        creditPurchase({
          cardId: cardA.id,
          effectiveOn: d("03-12"),
          amount: "2000",
          concept: "Compra tarjeta A",
          categoryId: cat.super,
        }),
      ),
    );
    created(
      await operation({
        ...creditPurchase({
          cardId: cardA.id,
          currency: "USD",
          effectiveOn: d("03-05"),
          amount: "300",
          concept: "Compra en cuotas",
          categoryId: cat.installments,
        }),
        plan: { installmentAmount: "100", count: 3, firstPeriod: `${Y}-03` },
      }),
    );
    const cyclePayment = creditPayment({
      cardId: cardA.id,
      amount: "1000",
      effectiveOn: d("03-20"),
      allocations: [{ purchaseId: purchaseA.id, amount: "1000" }],
    });
    cyclePayment.lines[0].statementPeriod = `${Y}-03`;
    created(await operation(cyclePayment));
    created(
      await operation({
        action: "payment",
        cardId: cardA.id,
        effectiveOn: d("03-25"),
        idempotencyKey: randomUUID(),
        lines: [
          {
            currency: "USD",
            amount: "50",
            bankCurrency: "UYU",
            bankAmount: "2150",
            fee: "25",
            allocations: [],
          },
        ],
      }),
    );
    // Tarjeta B sin cierre configurado: la compra no pertenece a ningún ciclo.
    created(
      await operation(
        creditPurchase({
          cardId: cardB.id,
          effectiveOn: d("03-15"),
          amount: "777",
          concept: "Compra sin ciclo",
        }),
      ),
    );
    created(
      await run((c, id) =>
        saveCardCycle(
          c,
          id,
          ok(
            parseCycleCommand({
              cardId: cardA.id,
              version: 0,
              idempotencyKey: randomUUID(),
              scope: "statement",
              period: `${Y}-03`,
              currency: "UYU",
              officialAmount: "2500",
              minimumAmount: "",
              dueOn: "",
            }),
          ),
        ),
      ),
    );
    // Reembolso acreditado en abril por una compra de marzo: va aparte, en abril.
    created(
      await run((c, id) =>
        saveRefund(
          c,
          id,
          ok(
            parseRefundCommand(
              {
                action: "credit",
                effectiveOn: d("04-10"),
                purchaseId: purchaseA.id,
                idempotencyKey: randomUUID(),
                parts: [{ method: "credit", categoryId: null, amount: "100" }],
              },
              today,
            ),
          ),
          today,
        ),
      ),
    );

    const data = await report();
    process.stderr.write(`EXPORT-FIX informe: ${JSON.stringify(data)}\n`);
    const files = {
      csv: await generateReport("csv", period, data),
      excel: Buffer.from(await generateReport("excel", period, data)),
      pdf: Buffer.from(
        await readAll(await generateReport("pdf", period, data)),
      ),
    };

    await t.test(
      "Resumen: totales, tramos, categorías y reembolso separado",
      () => {
        const rows = map(rowsOf(data, "resumen"), [1, 0]);
        const want = (key, total, first, second) =>
          assert.deepEqual(
            rows.get(key)?.slice(2),
            [total, first, second],
            key,
          );
        want("UYU|Ingreso", "51000.0000", "51000.0000", "0.0000");
        want(
          "UYU|Ingreso por categoría · Sueldo QA",
          "50000.0000",
          "50000.0000",
          "0.0000",
        );
        want(
          "UYU|Ingreso por categoría · Extra A QA",
          "600.0000",
          "600.0000",
          "0.0000",
        );
        want(
          "UYU|Ingreso por categoría · Extra B QA",
          "400.0000",
          "400.0000",
          "0.0000",
        );
        want("UYU|Gasto", "4469.5678", "4147.5678", "322.0000");
        want(
          "UYU|Gasto por categoría · Supermercado QA",
          "3433.0000",
          "3111.0000",
          "322.0000",
        );
        want(
          "UYU|Gasto por categoría · Hogar QA",
          "234.5678",
          "234.5678",
          "0.0000",
        );
        want(
          "UYU|Gasto por categoría · Sin categoría",
          "802.0000",
          "802.0000",
          "0.0000",
        );
        want("UYU|Resultado", "46530.4322", "46852.4322", "-322.0000");
        want("UYU|Reembolso acreditado", "100.0000", "0.0000", "100.0000");
        want("USD|Gasto", "210.0100", "110.0100", "100.0000");
        want(
          "USD|Gasto por categoría · Supermercado QA",
          "10.0100",
          "10.0100",
          "0.0000",
        );
        want(
          "USD|Gasto por categoría · Cuotas QA",
          "200.0000",
          "100.0000",
          "100.0000",
        );
        want("USD|Resultado", "-210.0100", "-110.0100", "-100.0000");
        assert.equal(
          rows.has("USD|Ingreso"),
          false,
          "el ingreso de febrero queda fuera",
        );
      },
    );

    await t.test(
      "Movimientos: rango inclusivo, sin duplicados ni datos de otro titular",
      () => {
        const rows = rowsOf(data, "movimientos");
        const concepts = rows.map((row) => row[2]);
        for (const inside of [
          "Borde inicial",
          "@borde final",
          "Sueldo marzo",
          "Compra dividida",
          "Compra tarjeta A",
          "Compra sin ciclo",
        ])
          assert.ok(concepts.includes(inside), `falta ${inside}`);
        for (const outside of [
          "Fuera antes",
          "Fuera después",
          "Ingreso USD anterior",
          "Exclusiva del titular B",
        ])
          assert.ok(!concepts.includes(outside), `sobra ${outside}`);
        assert.ok(
          rows.every((row) => row[0] >= period.from && row[0] <= period.to),
        );
        const ids = rows.map((row) => `${row[10]}|${row[7]}|${row[1]}`);
        assert.equal(new Set(ids).size, ids.length, "filas duplicadas");
      },
    );

    await t.test(
      "Movimientos: la categoría refleja el desglose vigente",
      () => {
        const rows = rowsOf(data, "movimientos");
        assert.equal(
          rows.find((row) => row[2] === "Compra dividida")[3],
          "Hogar QA, Supermercado QA",
        );
        assert.equal(
          rows.find((row) => row[2] === "Ingreso dividido")[3],
          "Extra A QA, Extra B QA",
        );
      },
    );

    await t.test(
      "Movimientos: el pago con conversión muestra el débito bancario y la comisión",
      () => {
        const rows = rowsOf(data, "movimientos").filter(
          (row) => row[0] === d("03-25"),
        );
        const amounts = rows
          .map((row) => `${row[1]}|${row[7]}|${row[8]}`)
          .sort();
        assert.deepEqual(amounts, [
          "Comisión bancaria de pago|UYU|25.0000",
          "Pago de tarjeta (débito bancario)|UYU|2150.0000",
          "Pago de tarjeta|USD|50.0000",
        ]);
      },
    );

    await t.test("Saldos: confirmado y proyección al cierre", async () => {
      const rows = map(rowsOf(data, "saldos"), [1]);
      const balances = await run((c, id) =>
        listBankBalances(c, id, ["UYU", "USD", "EUR"], undefined, period.to),
      );
      const projection = (currency) =>
        balances.find((b) => b.currency === currency).calculatedAmount;
      assert.deepEqual(rows.get("USD").slice(2, 5), [
        "5000.0000",
        d("01-01"),
        "5190.4900",
      ]);
      assert.equal(projection("USD"), "5190.4900");
      assert.deepEqual(
        rows.get("EUR").slice(2, 5),
        ["3000.0000", d("01-01"), "3000.0000"],
        "sin movimientos la proyección es el saldo confirmado",
      );
      // 100000 + 51000 - 777 - 111 - 1234.5678 - 100 - 222 - 1000 - (2150 + 25)
      assert.equal(rows.get("UYU")[4], "145380.4322");
      assert.equal(rows.get("UYU")[4], projection("UYU"));
    });

    await t.test("Tarjetas: ciclos, compras sin ciclo y monto oficial", () => {
      const rows = map(rowsOf(data, "tarjetas"), [0, 1, 2]);
      const columns = REPORT_SECTIONS.find(
        ({ id }) => id === "tarjetas",
      ).columns.map(({ id }) => id);
      const row = (key) =>
        Object.fromEntries(columns.map((id, i) => [id, rows.get(key)?.[i]]));
      assert.deepEqual(
        { ...row(`Tarjeta A QA|${Y}-03|UYU`) },
        {
          tarjeta: "Tarjeta A QA",
          ciclo: `${Y}-03`,
          moneda: "UYU",
          compras: "2000.0000",
          pagos: "1000.0000",
          saldo_pendiente: "1500.0000",
          abonos: "0.0000",
          sin_ciclo: "0.0000",
          oficial: "2500.0000",
        },
      );
      assert.deepEqual(row(`Tarjeta A QA|${Y}-04|UYU`).abonos, "100.0000");
      assert.deepEqual(row(`Tarjeta A QA|${Y}-03|USD`).compras, "100.0000");
      assert.deepEqual(row(`Tarjeta A QA|${Y}-04|USD`).compras, "100.0000");
      assert.equal(
        rows.has(`Tarjeta A QA|${Y}-05|USD`),
        false,
        "la cuota de mayo queda fuera del rango",
      );
      assert.equal(row(`Tarjeta B QA|${Y}-03|UYU`).sin_ciclo, "777.0000");
    });

    await t.test(
      "Presupuestos: consumo convertido con las cotizaciones históricas",
      () => {
        const rows = map(rowsOf(data, "presupuestos"), [0, 1]);
        const budget = (month, name) => rows.get(`${Y}-${month}|${name}`);
        // Consumo de marzo: 111 + 1000 + 2000 en UYU y 10,01 USD a 41,5.
        const superMarch = sum("3111", converted([["10.0100", "41.5"]]));
        assert.equal(superMarch, "3526.4150");
        assert.deepEqual(budget("03", "Supermercado QA").slice(2, 6), [
          "UYU",
          "10000.0000",
          superMarch,
          sum("10000", `-${superMarch}`),
        ]);
        assert.deepEqual(budget("03", "Cuotas QA").slice(3, 6), [
          "20000.0000",
          converted([["100", "41.5"]]),
          sum("20000", `-${converted([["100", "41.5"]])}`),
        ]);
        assert.deepEqual(budget("04", "Cuotas QA").slice(3, 6), [
          "20000.0000",
          converted([["100", "42.25"]]),
          sum("20000", `-${converted([["100", "42.25"]])}`),
        ]);
        assert.deepEqual(budget("04", "Supermercado QA").slice(3, 6), [
          "10000.0000",
          "322.0000",
          "9678.0000",
        ]);
        assert.match(budget("03", "Cuotas QA")[6], /USD a UYU 41\.5/);
        assert.ok(
          rowsOf(data, "presupuestos").every(
            (row) => !row[6].includes("Faltan"),
          ),
        );
      },
    );

    await t.test(
      "CSV, Excel y PDF contienen las mismas filas y respetan los títulos",
      async () => {
        const csv = parseCsvReport(files.csv);
        const xlsx = parseXlsxReport(files.excel);
        const pdf = pdfText(files.pdf);
        assert.deepEqual(
          csv.sections.map(({ title }) => title),
          REPORT_SECTIONS.map(({ title }) => title),
        );
        assert.deepEqual(
          xlsx.map(({ name }) => name),
          REPORT_SECTIONS.map(({ title }) => title),
        );
        for (const [index, { id, columns }] of REPORT_SECTIONS.entries()) {
          const expected = data[id];
          const labels = columns.map(({ label }) => label);
          assert.deepEqual(csv.sections[index].header, labels, `CSV ${id}`);
          // Una celda de texto que empieza como fórmula se guarda con apóstrofo.
          const unquoted = csv.sections[index].rows.map((row) =>
            row.map((value, i) =>
              columns[i].kind === "text" && value.startsWith("'")
                ? value.slice(1)
                : value,
            ),
          );
          assert.deepEqual(unquoted, expected, `CSV ${id}`);
          const sheet = xlsx[index];
          assert.equal(sheet.formulas, 0, `Excel ${id} sin fórmulas`);
          const headerAt = sheet.rows.findIndex(
            (row) => row[0] === labels[0] && row.length >= labels.length,
          );
          assert.deepEqual(
            sheet.rows[headerAt].slice(0, labels.length),
            labels,
            `Excel ${id}`,
          );
          assert.deepEqual(
            sheet.rows
              .slice(headerAt + 1)
              .map((row) =>
                Array.from({ length: labels.length }, (_, i) => row[i] ?? ""),
              ),
            expected,
            `Excel ${id}`,
          );
          for (const row of expected)
            for (const value of row)
              if (value !== "")
                assert.ok(
                  pdf.includes(value.replace(/\s+/g, " ")),
                  `PDF ${id}: ${value}`,
                );
        }
      },
    );

    await t.test(
      "Neutraliza fórmulas y no filtra datos de otro titular",
      () => {
        const csv = files.csv;
        assert.ok(csv.includes(`"'=1+1; ""fórmula"""`));
        assert.ok(csv.includes(`"'@borde final"`));
        for (const text of [
          csv,
          pdfText(files.pdf),
          JSON.stringify(parseXlsxReport(files.excel)),
        ])
          assert.ok(!text.includes("Exclusiva del titular B"));
      },
    );

    await t.test("Fondos de ahorro al cierre del período", async () => {
      const closing = bankReferenceToday();
      const range = { from: closing.slice(0, 8) + "01", to: closing };
      const fund = created(
        await run((c, id) =>
          saveSavingsFund(c, id, {
            action: "create",
            name: "Fondo QA",
            currency: "UYU",
            idempotencyKey: randomUUID(),
          }),
        ),
      );
      created(
        await run((c, id) =>
          saveSavingsFund(c, id, {
            action: "reserve",
            fundId: fund.id,
            amount: "700.0001",
            version: 1,
            idempotencyKey: randomUUID(),
          }),
        ),
      );
      created(
        await run((c, id) =>
          saveSavingsFund(c, id, {
            action: "release",
            fundId: fund.id,
            amount: "200.0000",
            version: 2,
            idempotencyKey: randomUUID(),
          }),
        ),
      );
      const funds = rowsOf(await report(range), "fondos");
      assert.deepEqual(funds, [
        ["Fondo QA", "UYU", "700.0001", "", "500.0001"],
      ]);
      assert.deepEqual(
        rowsOf(
          await report({ from: "2020-01-01", to: "2020-01-31" }),
          "fondos",
        ),
        [],
        "el fondo no existía al cierre",
      );
    });

    await t.test(
      "Período sin movimientos: secciones vacías y archivos válidos",
      async () => {
        const empty = { from: "2020-06-01", to: "2020-06-30" };
        const data = await report(empty);
        for (const { id } of REPORT_SECTIONS)
          assert.deepEqual(data[id], [], id);
        const csv = parseCsvReport(await generateReport("csv", empty, data));
        assert.ok(csv.sections.every(({ rows }) => rows.length === 0));
        const xlsx = parseXlsxReport(
          Buffer.from(await generateReport("excel", empty, data)),
        );
        assert.equal(xlsx.length, REPORT_SECTIONS.length);
        const pdf = pdfText(
          Buffer.from(await readAll(await generateReport("pdf", empty, data))),
        );
        assert.ok(pdf.includes("Sin registros para el período."));
      },
    );
  } finally {
    await pool.end();
  }
});
