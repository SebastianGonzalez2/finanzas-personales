import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { REPORT_SECTIONS } from "../../src/lib/export/report-format.ts";
import { generateReport } from "../../src/server/report-files.ts";
import {
  parseCsvReport,
  parseXlsxReport,
  pdfText,
  readAll,
} from "../support/report-readers.mjs";

// EXPORT-FIX: los tres generadores, con filas sintéticas, deben producir los
// mismos datos y neutralizar fórmulas. Se abren los archivos generados.

const period = { from: "2026-03-01", to: "2026-03-31" };
const blank = (id) =>
  Array.from(REPORT_SECTIONS.find((s) => s.id === id).columns, () => "");
const rowOf = (id, values) => Object.assign(blank(id), values);

const report = Object.fromEntries(REPORT_SECTIONS.map(({ id }) => [id, []]));
report.resumen = [
  ["Gasto", "USD", "1234.5678", "0.0001", "1234.5677"],
  ["Resultado", "UYU", "-322.0000", "0.0000", "-322.0000"],
];
report.movimientos = [
  rowOf("movimientos", {
    0: "2026-03-31",
    1: "Gasto",
    2: '=1+1; "fórmula"',
    3: "Hogar, Supermercado",
    7: "UYU",
    8: "9999999999999.9999",
    9: "Confirmado",
    10: "00000000-0000-4000-8000-000000000001",
  }),
  rowOf("movimientos", { 1: "Gasto", 2: "+54", 7: "UYU", 8: "1.0000" }),
  rowOf("movimientos", { 1: "Gasto", 2: "−1", 7: "UYU", 8: "2.0000" }),
  rowOf("movimientos", { 1: "Gasto", 2: "  @SUM(A1)", 7: "UYU", 8: "3.0000" }),
  rowOf("movimientos", { 1: "Gasto", 2: "\t-cmd", 7: "UYU", 8: "4.0000" }),
  rowOf("movimientos", {
    1: "Gasto",
    2: "línea\ncon salto",
    7: "UYU",
    8: "5.0000",
  }),
  rowOf("movimientos", {
    1: "Gasto",
    2: 'Ñandú, año; "comillas"',
    7: "EUR",
    8: "6.0000",
  }),
];
report.saldos = [
  ["Saldo bancario", "UYU", "100.0000", "2026-01-01", "100.0000"],
];
report.tarjetas = [
  [
    "Tarjeta A",
    "2026-03",
    "UYU",
    "2000.0000",
    "1000.0000",
    "1500.0000",
    "0.0000",
    "0.0000",
    "2500.0000",
  ],
];
report.presupuestos = [
  [
    "2026-03",
    "Supermercado",
    "UYU",
    "10000.0000",
    "",
    "",
    "Faltan cotizaciones históricas",
  ],
];

// Texto esperado en el PDF: la fuente estándar solo dibuja Latin-1, así que el
// signo menos tipográfico del caso de prueba se muestra como guion.
const text = (value) =>
  value
    .replace(/[\p{Cc}]+/gu, " ")
    .replaceAll("−", "-")
    .replace(/\s+/g, " ");

test("EXPORT-FIX: CSV, Excel y PDF tienen las mismas filas", async () => {
  const csv = parseCsvReport(await generateReport("csv", period, report));
  const xlsx = parseXlsxReport(
    Buffer.from(await generateReport("excel", period, report)),
  );
  const pdf = pdfText(
    Buffer.from(await readAll(await generateReport("pdf", period, report))),
  );

  for (const [index, { id, title, columns }] of REPORT_SECTIONS.entries()) {
    assert.equal(csv.sections[index].title, title);
    assert.equal(xlsx[index].name, title);
    const labels = columns.map(({ label }) => label);
    assert.deepEqual(csv.sections[index].header, labels);
    // El CSV antepone un apóstrofo a los textos que parecen una fórmula.
    const fromCsv = csv.sections[index].rows.map((row) =>
      row.map((value, i) =>
        columns[i].kind === "text" && /^'(?=[\s\p{Cc}]*[=+\-−@\t])/u.test(value)
          ? value.slice(1)
          : value,
      ),
    );
    assert.deepEqual(fromCsv, report[id], `CSV ${id}`);

    const at = xlsx[index].rows.findIndex(
      (row) => row[0] === labels[0] && row.length >= labels.length,
    );
    assert.deepEqual(xlsx[index].rows[at].slice(0, labels.length), labels);
    const fromXlsx = xlsx[index].rows
      .slice(at + 1)
      .map((row) =>
        Array.from({ length: labels.length }, (_, i) => row[i] ?? ""),
      );
    assert.deepEqual(fromXlsx, report[id], `Excel ${id}`);
    assert.equal(xlsx[index].formulas, 0, `Excel ${id} no contiene fórmulas`);

    for (const row of report[id])
      for (const value of row)
        if (value !== "")
          assert.ok(pdf.includes(text(value)), `PDF ${id}: ${value}`);
  }
});

test("EXPORT-FIX: CSV y Excel neutralizan prefijos de fórmula sin alterar importes", async () => {
  const csv = await generateReport("csv", period, report);
  for (const formula of ["=1+1", "+54", "−1", "  @SUM(A1)", "\t-cmd"])
    assert.ok(csv.includes(`"'${formula}`), formula);
  assert.ok(csv.includes('"9999999999999.9999"'));
  assert.ok(
    csv.includes('"-322.0000"'),
    "los importes negativos no llevan apóstrofo",
  );
  assert.ok(csv.startsWith("﻿"));
  const xlsx = parseXlsxReport(
    Buffer.from(await generateReport("excel", period, report)),
  );
  assert.ok(xlsx.every(({ formulas }) => formulas === 0));
  assert.ok(
    xlsx.every(({ cellTypes }) =>
      [...cellTypes].every((kind) => ["s", "inlineStr", "str"].includes(kind)),
    ),
  );
});

test("EXPORT-FIX: un informe sin registros genera los tres archivos legibles", async () => {
  const empty = Object.fromEntries(REPORT_SECTIONS.map(({ id }) => [id, []]));
  const csv = parseCsvReport(await generateReport("csv", period, empty));
  assert.equal(csv.sections.length, REPORT_SECTIONS.length);
  assert.ok(csv.sections.every(({ rows }) => rows.length === 0));
  const xlsx = parseXlsxReport(
    Buffer.from(await generateReport("excel", period, empty)),
  );
  assert.equal(xlsx.length, REPORT_SECTIONS.length);
  const pdf = pdfText(
    Buffer.from(await readAll(await generateReport("pdf", period, empty))),
  );
  assert.ok(pdf.includes("Informe del 2026-03-01 al 2026-03-31"));
  assert.ok(pdf.includes("Sin registros para el período."));
});

test("EXPORT-FIX: el PDF no corrompe ni oculta caracteres fuera de Latin-1", async () => {
  // Regresión: PDFKit emitía glifos erróneos o descartaba estos caracteres sin
  // aviso, de modo que el PDF no coincidía con el CSV y el Excel.
  const samples = {
    "Café ☕ 😀": "Café ? ?",
    "Ñandú año “x” – ‘y’": "Ñandú año \"x\" - 'y'",
    "Precio €5…": "Precio EUR5...",
    "→ flecha": "? flecha",
    中文: "??",
    Zażółć: "Za?ó??",
  };
  const rows = Object.keys(samples).map((concept) =>
    rowOf("movimientos", { 1: "Gasto", 2: concept, 7: "UYU", 8: "1.0000" }),
  );
  const data = { ...report, movimientos: rows };
  const pdf = pdfText(
    Buffer.from(await readAll(await generateReport("pdf", period, data))),
  );
  for (const [concept, shown] of Object.entries(samples))
    assert.ok(
      pdf.includes(`Descripción: ${shown} · Moneda: UYU`),
      `${concept} => ${shown}`,
    );
  // Ningún carácter de control ni glifo suelto en el texto del PDF.
  assert.doesNotMatch(pdf, /\p{Cc}/u);
  // CSV y Excel conservan el texto original.
  const csv = parseCsvReport(await generateReport("csv", period, data));
  assert.deepEqual(
    csv.sections[1].rows.map((row) => row[2]),
    Object.keys(samples),
  );
});
