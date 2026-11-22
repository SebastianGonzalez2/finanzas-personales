import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import test from "node:test";
import pg from "pg";
import { migrateInTransaction } from "../../src/db/migrations.mts";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { REPORT_SECTIONS } from "../../src/lib/export/report-format.ts";
import { saveBudget } from "../../src/server/budgets.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  loadPeriodReport,
  prepareReportBudgets,
  reportReferenceDates,
} from "../../src/server/period-report.ts";
import { generateReport } from "../../src/server/report-files.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
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
  };
  const names = {
    [cat.super]: "Supermercado QA",
    [cat.home]: "Hogar QA",
    [cat.installments]: "Cuotas QA",
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

    await run(async (c, id) => {
      for (const categoryId of [cat.super, cat.home, cat.installments])
        await c.query(
          "INSERT INTO finance.categories(owner_id,id,name,kind) VALUES ($1,$2,$3,'expense')",
          [id, categoryId, names[categoryId]],
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
    });

    // Titular B: nada de esto puede aparecer en el informe de A.
    await movement(other, {
      kind: "expense",
      method: "debit",
      currency: "UYU",
      amount: "500.0000",
      effectiveOn: d("03-15"),
      concept: "Exclusiva del titular B",
    });

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

    // Gasto sin categoría y compras en cuotas (independientes de tarjetas):
    // 300 USD en 3 cuotas de 100 y 30.000 UYU en 6 cuotas de 5.000.
    created(await expense("Sin categoría QA", "802.0000", "03-15"));
    created(
      await expense("Compra en cuotas", "300", "03-05", {
        currency: "USD",
        method: "unspecified",
        categoryId: cat.installments,
        plan: { installmentAmount: "100", count: 3, firstPeriod: `${Y}-03` },
      }),
    );
    created(
      await expense("Heladera", "30000", "03-02", {
        method: "unspecified",
        categoryId: cat.home,
        plan: { installmentAmount: "5000", count: 6, firstPeriod: `${Y}-03` },
      }),
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
      "Resumen: totales por moneda y categoría, con cuotas en su mes",
      () => {
        const rows = map(rowsOf(data, "resumen"), [1, 0]);
        const want = (key, total, first, second) =>
          assert.deepEqual(
            rows.get(key)?.slice(2),
            [total, first, second],
            key,
          );
        want("UYU|Gasto", "12469.5678", "7147.5678", "5322.0000");
        want(
          "UYU|Gasto por categoría · Supermercado QA",
          "1433.0000",
          "1111.0000",
          "322.0000",
        );
        want(
          "UYU|Gasto por categoría · Hogar QA",
          "10234.5678",
          "5234.5678",
          "5000.0000",
        );
        want(
          "UYU|Gasto por categoría · Sin categoría",
          "802.0000",
          "802.0000",
          "0.0000",
        );
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
        assert.equal(
          [...rows.keys()].some((key) =>
            /Ingreso|Resultado|Reembolso/.test(key),
          ),
          false,
          "el informe solo contiene gastos",
        );
      },
    );

    await t.test(
      "Evolución mensual: cada cuota cuenta una vez, en su mes",
      () => {
        const rows = map(rowsOf(data, "evolucion"), [1, 0]);
        assert.deepEqual(rows.get(`UYU|${Y}-03`).slice(2), ["7147.5678", ""]);
        assert.deepEqual(rows.get(`UYU|${Y}-04`).slice(2), [
          "5322.0000",
          "-1825.5678",
        ]);
        assert.deepEqual(rows.get(`USD|${Y}-03`).slice(2), ["110.0100", ""]);
        assert.deepEqual(rows.get(`USD|${Y}-04`).slice(2), [
          "100.0000",
          "-10.0100",
        ]);
      },
    );

    await t.test(
      "Cuotas: 30.000 UYU en 6 cuotas son 5.000 por mes, sin duplicados",
      async () => {
        const rows = rowsOf(data, "cuotas");
        const fridge = rows.filter((row) => row[1] === "Heladera");
        assert.deepEqual(
          fridge.map((row) => [row[0], row[2], row[4], row[5]]),
          [
            [`${Y}-03`, "1 de 6", "UYU", "5000.0000"],
            [`${Y}-04`, "2 de 6", "UYU", "5000.0000"],
          ],
        );
        const dollars = rows.filter((row) => row[1] === "Compra en cuotas");
        assert.deepEqual(
          dollars.map((row) => [row[0], row[2], row[4], row[5]]),
          [
            [`${Y}-03`, "1 de 3", "USD", "100.0000"],
            [`${Y}-04`, "2 de 3", "USD", "100.0000"],
          ],
        );
        // Un período que abarca todo el plan suma exactamente el total.
        const whole = rowsOf(
          await report({ from: `${Y}-03-01`, to: `${Y}-08-31` }),
          "cuotas",
        ).filter((row) => row[1] === "Heladera");
        assert.equal(whole.length, 6);
        assert.equal(new Set(whole.map((row) => row[6])).size, 1);
        assert.ok(whole.every((row) => row[5] === "5000.0000"));
        assert.equal(sum(...whole.map((row) => row[5])), "30000.0000");
        assert.equal(
          rowsOf(data, "movimientos").filter((row) => row[2] === "Heladera")
            .length,
          1,
          "la compra figura una sola vez en Gastos",
        );
      },
    );

    await t.test(
      "Gastos: rango inclusivo, sin duplicados ni datos de otro titular",
      () => {
        const rows = rowsOf(data, "movimientos");
        const concepts = rows.map((row) => row[2]);
        for (const inside of [
          "Borde inicial",
          "@borde final",
          "Compra dividida",
          "Compra en cuotas",
          "Heladera",
        ])
          assert.ok(concepts.includes(inside), `falta ${inside}`);
        for (const outside of [
          "Fuera antes",
          "Fuera después",
          "Exclusiva del titular B",
        ])
          assert.ok(!concepts.includes(outside), `sobra ${outside}`);
        assert.ok(
          rows.every((row) => row[0] >= period.from && row[0] <= period.to),
        );
        assert.ok(rows.every((row) => row[1] === "Gasto"));
        const ids = rows.map((row) => `${row[8]}|${row[5]}`);
        assert.equal(new Set(ids).size, ids.length, "filas duplicadas");
        assert.equal(
          rows.find((row) => row[2] === "Compra dividida")[3],
          "Hogar QA, Supermercado QA",
        );
        assert.equal(rows.find((row) => row[2] === "Heladera")[4], "6");
      },
    );

    await t.test(
      "Presupuestos: consumo convertido con las cotizaciones históricas",
      () => {
        const rows = map(rowsOf(data, "presupuestos"), [0, 1]);
        const budget = (month, name) => rows.get(`${Y}-${month}|${name}`);
        // Consumo de marzo: 111 + 1000 en UYU y 10,01 USD a 41,5.
        const superMarch = sum("1111", converted([["10.0100", "41.5"]]));
        assert.equal(superMarch, "1526.4150");
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
        // PDFKit parte las líneas largas (por ejemplo, en los guiones de un
        // identificador): el contenido se compara sin espacios.
        const pdfCompact = pdfText(files.pdf).replace(/\s+/g, "");
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
                  pdfCompact.includes(value.replace(/\s+/g, "")),
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
    try {
      await pool.query(
        "DROP SCHEMA finance, finance_meta CASCADE; DROP ROLE finanzas_app",
      );
    } finally {
      await pool.end();
    }
  }
});
