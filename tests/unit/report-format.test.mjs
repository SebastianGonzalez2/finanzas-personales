import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPORT_FORMATS,
  REPORT_SECTIONS,
  currentReportPeriod,
  exportFormat,
  parseReportPeriod,
  reportFileName,
} from "../../src/lib/export/report-format.ts";

test("F5-07: acepta períodos válidos dentro del tope de días", () => {
  assert.deepEqual(
    parseReportPeriod({ from: "2026-01-01", to: "2026-01-31" }),
    {
      from: "2026-01-01",
      to: "2026-01-31",
    },
  );
  assert.equal(
    "from" in parseReportPeriod({ from: "2025-01-01", to: "2025-12-31" }),
    true,
  );
});

test("F5-07: rechaza períodos incompletos, inválidos o excedidos", () => {
  for (const input of [
    null,
    {},
    { from: "2026-01-01" },
    { from: 1, to: "2026-01-31" },
    { from: "2026-1-1", to: "2026-01-31" },
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-02-10", to: "2026-02-01" },
    { from: "2026-01-01", to: "2027-01-03" }, // 367 días > tope
  ]) {
    assert.ok("error" in parseReportPeriod(input), JSON.stringify(input));
  }
});

test("F5-07: el tope cuenta ambos días y admite un año bisiesto completo", () => {
  assert.equal(
    "error" in parseReportPeriod({ from: "2024-01-01", to: "2024-12-31" }),
    false,
  );
  assert.equal(
    "error" in parseReportPeriod({ from: "2024-01-01", to: "2025-01-01" }),
    true,
  );
});

test("F5-07: el período por defecto es el mes en curso de Montevideo", () => {
  const period = currentReportPeriod();
  assert.match(period.from, /^\d{4}-\d{2}-01$/);
  assert.match(period.to, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(period.from <= period.to);
  assert.equal(period.from.slice(0, 7), period.to.slice(0, 7));
});

test("F5-07: los tres formatos exportables son consistentes", () => {
  assert.deepEqual(
    EXPORT_FORMATS.map((format) => format.id),
    ["csv", "excel", "pdf"],
  );
  assert.deepEqual(
    EXPORT_FORMATS.map((format) => format.extension),
    ["csv", "xlsx", "pdf"],
  );
  for (const format of EXPORT_FORMATS) {
    assert.equal(format, exportFormat(format.id));
    assert.match(format.mimeType, /^(text\/csv|application\/)/);
    assert.ok(format.description.length > 0);
  }
});

test("F5-07: secciones y columnas del informe sin colisiones", () => {
  const ids = REPORT_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const section of REPORT_SECTIONS) {
    const columnIds = section.columns.map((column) => column.id);
    assert.equal(new Set(columnIds).size, columnIds.length);
    for (const column of section.columns) assert.ok(column.label.length > 0);
    assert.ok(section.description.length > 0);
  }
  const movimientos = REPORT_SECTIONS.find(
    (section) => section.id === "movimientos",
  );
  assert.ok(movimientos);
  assert.deepEqual(
    ["fecha", "tipo", "importe", "moneda", "movimiento_id"].every((id) =>
      movimientos.columns.some((column) => column.id === id),
    ),
    true,
  );
  const resumen = REPORT_SECTIONS.find((section) => section.id === "resumen");
  assert.match(resumen.description, /transferencias internas/i);
});

test("F5-07: nombres de archivo por período y formato", () => {
  const period = { from: "2026-02-01", to: "2026-02-28" };
  assert.equal(
    reportFileName(period, "csv"),
    "finanzas-2026-02-01_2026-02-28.csv",
  );
  assert.equal(
    reportFileName(period, "excel"),
    "finanzas-2026-02-01_2026-02-28.xlsx",
  );
  assert.equal(
    reportFileName(period, "pdf"),
    "finanzas-2026-02-01_2026-02-28.pdf",
  );
});
