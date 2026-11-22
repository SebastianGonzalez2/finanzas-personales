// F5-07 (MIX): diseño del informe del período y formatos de exportación.
// Contrato compartido entre la pantalla y los generadores de archivos.

export type ExportFormatId = "csv" | "excel" | "pdf";

export type ExportFormat = {
  id: ExportFormatId;
  label: string;
  extension: string;
  mimeType: string;
  description: string;
};

// Decisiones de formato (doc 47-informes-export-f5-07.md):
// - CSV: UTF-8 con BOM, separador ";" (Excel es-UY), comillas RFC 4180,
//   fechas YYYY-MM-DD e importes como texto decimal exacto.
// - Excel: .xlsx con una hoja por sección; importes como texto con escala
//   exacta para no perder decimales en números IEEE-754.
// - PDF: documento paginado con una sección por capítulo, orientación
//   vertical y total del período por moneda al final de cada capítulo.
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  {
    id: "csv",
    label: "CSV",
    extension: "csv",
    mimeType: "text/csv",
    description:
      'Texto plano UTF-8 con BOM y separador ";", apto para Excel y hojas de cálculo.',
  },
  {
    id: "excel",
    label: "Excel",
    extension: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    description: "Libro .xlsx con una hoja por sección del informe.",
  },
  {
    id: "pdf",
    label: "PDF",
    extension: "pdf",
    mimeType: "application/pdf",
    description: "Documento paginado para archivo o impresión.",
  },
];

export function exportFormat(id: string): ExportFormat | undefined {
  return EXPORT_FORMATS.find((format) => format.id === id);
}

export type ReportColumnKind = "date" | "month" | "money" | "text";

export type ReportColumn = {
  id: string;
  label: string;
  kind: ReportColumnKind;
  note?: string;
};

export type ReportSection = {
  id: string;
  title: string;
  description: string;
  columns: readonly ReportColumn[];
};

const moneyColumn = (
  id: string,
  label: string,
  note?: string,
): ReportColumn => ({
  id,
  label,
  kind: "money",
  note:
    note ??
    "Texto decimal exacto con la escala de la base; sin redondeos implícitos.",
});

// Secciones del informe del período. Los datos provienen únicamente del
// titular de la sesión; no incluyen credenciales, cookies ni datos de
// terceros (CA-061).
export const REPORT_SECTIONS: readonly ReportSection[] = [
  {
    id: "resumen",
    title: "Resumen del período",
    description:
      "Gasto total por moneda y por categoría dentro del rango exportado, con la comparación entre sus dos tramos. Coincide con Estadísticas para el mismo período y moneda.",
    columns: [
      { id: "concepto", label: "Concepto", kind: "text" },
      { id: "moneda", label: "Moneda", kind: "text" },
      moneyColumn("total", "Total del período"),
      moneyColumn("inicio", "Primer tramo"),
      moneyColumn("fin", "Segundo tramo"),
    ],
  },
  {
    id: "evolucion",
    title: "Evolución mensual",
    description:
      "Gasto de cada mes del período por moneda y diferencia con el mes anterior del rango. Cada cuota cuenta una sola vez, en su mes.",
    columns: [
      { id: "mes", label: "Mes", kind: "month" },
      { id: "moneda", label: "Moneda", kind: "text" },
      moneyColumn("gasto", "Gasto del mes"),
      moneyColumn(
        "diferencia",
        "Diferencia con el mes anterior",
        "Vacío en el primer mes del rango de cada moneda.",
      ),
    ],
  },
  {
    id: "movimientos",
    title: "Gastos",
    description:
      "Gastos confirmados dentro del período, incluyendo revisiones históricas vigentes a la fecha de exportación. Una compra en cuotas figura por su total; el detalle mensual está en Cuotas.",
    columns: [
      { id: "fecha", label: "Fecha", kind: "date" },
      { id: "tipo", label: "Tipo", kind: "text" },
      { id: "descripcion", label: "Descripción", kind: "text" },
      { id: "categoria", label: "Categoría", kind: "text" },
      { id: "cuotas", label: "Cuotas", kind: "text" },
      { id: "moneda", label: "Moneda", kind: "text" },
      moneyColumn("importe", "Importe"),
      { id: "estado", label: "Confirmación", kind: "text" },
      { id: "movimiento_id", label: "Identificador", kind: "text" },
    ],
  },
  {
    id: "cuotas",
    title: "Cuotas",
    description:
      "Cuotas de compras financiadas que corresponden a los meses del período. La suma de las cuotas de una compra es su total, sin duplicaciones.",
    columns: [
      { id: "mes", label: "Mes", kind: "month" },
      { id: "descripcion", label: "Compra", kind: "text" },
      { id: "cuota", label: "Cuota", kind: "text" },
      { id: "categoria", label: "Categoría", kind: "text" },
      { id: "moneda", label: "Moneda", kind: "text" },
      moneyColumn("importe", "Importe de la cuota"),
      { id: "movimiento_id", label: "Identificador", kind: "text" },
    ],
  },
  {
    id: "presupuestos",
    title: "Presupuestos",
    description:
      "Límite mensual por categoría y consumo dentro de las fechas seleccionadas, con las cotizaciones usadas para convertir otras monedas. Coincide con Presupuestos.",
    columns: [
      { id: "mes", label: "Mes", kind: "month" },
      { id: "categoria", label: "Categoría", kind: "text" },
      { id: "moneda", label: "Moneda", kind: "text" },
      moneyColumn("asignado", "Asignado"),
      moneyColumn("gastado", "Gastado"),
      moneyColumn("restante", "Restante"),
      { id: "referencias", label: "Cotizaciones utilizadas", kind: "text" },
    ],
  },
];

export function reportSection(id: string): ReportSection | undefined {
  return REPORT_SECTIONS.find((section) => section.id === id);
}

export type ReportPeriod = { from: string; to: string };

const periodDatePattern = /^\d{4}-\d{2}-\d{2}$/;
export const REPORT_MAX_DAYS = 366;

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

// Valida el período solicitado por la UI. Acepta fechas inclusive en formato
// YYYY-MM-DD, con tope de 366 días para limitar el tamaño de la exportación.
export function parseReportPeriod(
  input: unknown,
): { error: string } | ReportPeriod {
  if (
    typeof input !== "object" ||
    input === null ||
    !("from" in input) ||
    !("to" in input)
  )
    return { error: "Período incompleto." };
  const { from, to } = input as { from: unknown; to: unknown };
  if (typeof from !== "string" || typeof to !== "string")
    return { error: "Período inválido." };
  if (!periodDatePattern.test(from) || !periodDatePattern.test(to))
    return { error: "Las fechas deben tener formato YYYY-MM-DD." };
  if (!isCalendarDate(from) || !isCalendarDate(to))
    return { error: "Las fechas deben ser días de calendario válidos." };
  if (from > to) return { error: "El inicio del período debe ser anterior." };
  if (daysBetween(from, to) + 1 > REPORT_MAX_DAYS)
    return { error: "El período no puede superar 366 días." };
  return { from, to };
}

// Período por defecto: mes en curso (America/Montevideo, misma referencia que
// el resto de la aplicación) hasta el día de hoy.
export function currentReportPeriod(now = new Date()): ReportPeriod {
  const today = montevideoIsoDate(now);
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function montevideoIsoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function reportFileName(
  period: ReportPeriod,
  format: ExportFormatId,
): string {
  const extension = exportFormat(format)?.extension ?? format;
  return `finanzas-${period.from}_${period.to}.${extension}`;
}
