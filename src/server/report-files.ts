import "server-only";
import { Readable } from "node:stream";
import PDFDocument from "pdfkit";
import writeXlsxFile from "write-excel-file/node";
import {
  REPORT_SECTIONS,
  type ExportFormatId,
  type ReportPeriod,
} from "../lib/export/report-format.ts";
import { reportMidpoint, type ReportRows } from "./period-report.ts";

function csvCell(value: string, isText = false) {
  // Quoting prevents delimiter injection. The apostrophe neutralizes formula
  // prefixes even when a spreadsheet ignores leading whitespace or controls.
  const cell =
    isText && /^[\s\p{Cc}\p{Cf}]*[=+\-−@\t\r\n]/u.test(value.normalize("NFKC"))
      ? `'${value}`
      : value;
  return `"${cell.replaceAll('"', '""')}"`;
}

function reportTitle(period: ReportPeriod) {
  return `Informe del ${period.from} al ${period.to}`;
}

function comparisonTitle(period: ReportPeriod) {
  return `El primer tramo termina el ${reportMidpoint(period)}. Importes en moneda original salvo conversiones indicadas.`;
}

function csvReport(period: ReportPeriod, report: ReportRows) {
  const rows = [csvCell(reportTitle(period)), csvCell(comparisonTitle(period))];
  for (const { id, title, columns } of REPORT_SECTIONS) {
    rows.push(
      "",
      csvCell(title),
      columns.map(({ label }) => csvCell(label)).join(";"),
    );
    for (const row of report[id]) {
      rows.push(
        row
          .map((value, index) => csvCell(value, columns[index].kind === "text"))
          .join(";"),
      );
    }
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

async function excelReport(period: ReportPeriod, report: ReportRows) {
  const data = await writeXlsxFile(
    REPORT_SECTIONS.map(({ id, title, columns }) => ({
      sheet: title,
      data: [
        [reportTitle(period)],
        ...(id === "resumen" ? [[comparisonTitle(period)]] : []),
        columns.map(({ label }) => ({
          value: label,
          fontWeight: "bold" as const,
        })),
        ...report[id],
      ],
      columns: columns.map(({ label }) => ({
        width: Math.max(18, label.length + 4),
      })),
    })),
  ).toBuffer();
  return new Uint8Array(data);
}

function summaryChart(doc: PDFKit.PDFDocument, rows: string[][]) {
  const data = rows.filter(([concept]) =>
    ["Ingreso", "Gasto"].includes(concept),
  );
  if (!data.length) return;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Ingresos y gastos por moneda")
    .moveDown(0.4);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#344c5a")
    .text("Verde: primer tramo  ·  Gris: segundo tramo")
    .moveDown(0.6);
  for (const currency of new Set(data.map((row) => row[1]))) {
    const group = data.filter((row) => row[1] === currency);
    // Floating point is used only for drawing the bar widths.
    const scale = Math.max(
      1,
      ...group.flatMap((row) => row.slice(3).map(Number)),
    );
    for (const [concept, , , first, second] of group) {
      doc.fillColor("#192e38").text(`${currency} · ${concept}`);
      const y = doc.y + 2;
      const x = doc.x;
      doc.rect(x, y, (265 * Number(first)) / scale, 5).fill("#167560");
      doc.rect(x, y + 7, (265 * Number(second)) / scale, 5).fill("#a7b2bb");
      doc.y = y + 19;
    }
  }
  doc.moveDown(0.6);
}

function pdfReport(period: ReportPeriod, report: ReportRows) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 44,
    lang: "es-UY",
    info: { Title: reportTitle(period) },
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(23)
    .fillColor("#173c3d")
    .text("Finanzas personales");
  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor("#253a48")
    .text(reportTitle(period));
  doc.fontSize(9).text(comparisonTitle(period)).moveDown();
  summaryChart(doc, report.resumen);
  for (const [
    index,
    { id, title, description, columns },
  ] of REPORT_SECTIONS.entries()) {
    if (index > 0 && report[id].length) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#173c3d").text(title);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#344c5a")
      .text(description)
      .moveDown(0.5);
    if (report[id].length === 0)
      doc.text("Sin registros para el período.").moveDown();
    for (const row of report[id]) {
      const text = row
        .flatMap((value, index) =>
          value === ""
            ? []
            : [`${columns[index].label}: ${value.replace(/[\p{Cc}]+/gu, " ")}`],
        )
        .join("  ·  ");
      if (
        doc.y + Math.min(doc.heightOfString(text), 75) + 14 >
        doc.page.height - 44
      ) {
        doc.addPage();
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(`${title} (continuación)`)
          .moveDown();
        doc.font("Helvetica").fontSize(9);
      }
      doc.fillColor("#192e38").text(text).moveDown(0.55);
    }
  }
  doc.end();
  return Readable.toWeb(doc) as ReadableStream<Uint8Array>;
}

export async function generateReport(
  format: ExportFormatId,
  period: ReportPeriod,
  report: ReportRows,
) {
  if (format === "csv") return csvReport(period, report);
  if (format === "excel") return excelReport(period, report);
  return pdfReport(period, report);
}
