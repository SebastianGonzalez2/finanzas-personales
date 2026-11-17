import { withGoogleOwner } from "@/server/google-auth";
import { limitedJson } from "@/server/google-policy";
import { bankReferenceToday } from "@/domain/bank-balances";
import { refreshOwnerReferences } from "@/server/exchange-rate-http";
import {
  loadPeriodReport,
  prepareReportBudgets,
  reportReferenceDates,
} from "@/server/period-report";
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
    // Same preparation as Presupuestos: fix the historical references for the
    // selected months (providers are queried outside transactions) and only
    // then read everything from one consistent snapshot. A failure here leaves
    // the affected budget rows flagged as missing quotes instead of blocking.
    const today = bankReferenceToday();
    const dates = await withGoogleOwner(request, (client, ownerId) =>
      reportReferenceDates(client, ownerId, period, today),
    ).catch(() => []);
    await refreshOwnerReferences(request, dates, today).catch(() => undefined);
    await withGoogleOwner(request, (client, ownerId) =>
      prepareReportBudgets(client, ownerId, period, today),
    ).catch(() => undefined);
    const report = await withGoogleOwner(
      request,
      (client, ownerId) => loadPeriodReport(client, ownerId, period, today),
      { repeatableRead: true },
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
