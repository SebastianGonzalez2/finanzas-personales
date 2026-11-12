"use client";

import { useState, type FormEvent } from "react";
import { HistoryField, historyControl, historyPrimary } from "./history-fields";
import { Card } from "./ui/card";
import {
  EXPORT_FORMATS,
  REPORT_SECTIONS,
  exportFormat,
  parseReportPeriod,
  reportFileName,
  type ExportFormatId,
  type ReportPeriod,
} from "@/lib/export/report-format";

function monthBounds(month: string): { first: string; last: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    first: `${month}-${pad(1)}`,
    last: `${month}-${pad(lastDay)}`,
  };
}

function periodBounds(from: string, to: string): ReportPeriod {
  return { from: monthBounds(from).first, to: monthBounds(to).last };
}

type ExportState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string }
  | { kind: "done"; message: string };

export function InformesPanel({ initialPeriod }: { initialPeriod: ReportPeriod }) {
  const [from, setFrom] = useState(initialPeriod.from.slice(0, 7));
  const [to, setTo] = useState(initialPeriod.to.slice(0, 7));
  const [format, setFormat] = useState<ExportFormatId>("csv");
  const [state, setState] = useState<ExportState>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const period = periodBounds(from, to);
    const parsed = parseReportPeriod(period);
    if ("error" in parsed) {
      setState({ kind: "error", message: parsed.error });
      return;
    }
    setState({ kind: "pending" });
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...parsed, format }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setState({
          kind: response.status === 501 ? "info" : "error",
          message:
            body?.error ?? "No se pudo generar el informe. Volvé a intentarlo.",
        });
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const name = match?.[1] ?? reportFileName(parsed, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      setState({ kind: "done", message: `Informe ${name} descargado.` });
    } catch {
      setState({
        kind: "error",
        message: "No se pudo generar el informe. Volvé a intentarlo.",
      });
    }
  }

  const pending = state.kind === "pending";
  return (
    <div className="grid gap-4">
      <Card className="items-start gap-4 p-4 sm:p-5">
        <h2 className="font-semibold">Exportar informe del período</h2>
        <p className="text-sm text-muted-foreground">
          Elegí el período en meses y el formato. El informe incluye solo los
          datos del titular de la sesión, sin credenciales ni datos de otras
          cuentas.
        </p>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <HistoryField label="Desde el mes">
              <input
                type="month"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={historyControl}
                required
              />
            </HistoryField>
            <HistoryField label="Hasta el mes">
              <input
                type="month"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className={historyControl}
                required
              />
            </HistoryField>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Formato</legend>
            {EXPORT_FORMATS.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="formato"
                  value={option.id}
                  checked={format === option.id}
                  onChange={() => setFormat(option.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">
                    {option.label} (.{option.extension})
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            className={historyPrimary}
            disabled={pending || !from || !to}
          >
            {pending ? "Generando informe…" : `Exportar ${exportFormat(format)?.label}`}
          </button>
        </form>
        {state.kind === "info" ||
        state.kind === "error" ||
        state.kind === "done" ? (
          <p
            role={state.kind === "error" ? "alert" : "status"}
            className={
              state.kind === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {state.message}
          </p>
        ) : null}
      </Card>

      <Card className="items-start gap-3 p-4 sm:p-5">
        <h2 className="font-semibold">Contenido del informe</h2>
        <p className="text-sm text-muted-foreground">
          Secciones y columnas incluidas en todos los formatos. Los importes se
          exportan como texto decimal exacto, sin redondeos.
        </p>
        <ul className="grid w-full gap-3">
          {REPORT_SECTIONS.map((section) => (
            <li key={section.id} className="border-t pt-3 first:border-0 first:pt-0">
              <p className="font-medium">{section.title}</p>
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
              <p className="mt-1 text-sm">
                {section.columns.map((column) => column.label).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
