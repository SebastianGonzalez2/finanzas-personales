import { withGoogleOwner } from "@/server/google-auth";
import { limitedJson } from "@/server/google-policy";
import { loadPeriodReport } from "@/server/period-report";
import { generateReport } from "@/server/report-files";
import {
  exportFailure,
  exportOperationError,
  exportOriginError,
  privateDownload,
} from "@/server/private-download";
import {
  exportFormat,
  parseReportPeriod,
  reportFileName,
} from "@/lib/export/report-format";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = exportOriginError(request);
  if (originError) return originError;
  const input: unknown = await limitedJson(request).catch(() => null);
  const period = parseReportPeriod(input);
  if ("error" in period) return exportFailure(period.error, 400);
  const format =
    input &&
    typeof input === "object" &&
    "format" in input &&
    typeof input.format === "string"
      ? exportFormat(input.format)
      : undefined;
  if (!format) return exportFailure("Formato de informe inválido.", 400);

  try {
    const report = await withGoogleOwner(
      request,
      (client, ownerId) => loadPeriodReport(client, ownerId, period),
      true,
    );
    if (!report)
      return exportFailure(
        "El informe supera el tamaño admitido. Elegí un período más corto.",
        413,
      );
    const file = await generateReport(format.id, period, report);
    return privateDownload(
      file,
      reportFileName(period, format.id),
      format.mimeType,
    );
  } catch (error) {
    return exportOperationError(error);
  }
}
