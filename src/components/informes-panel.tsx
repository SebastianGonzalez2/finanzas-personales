"use client";

import { DateInput } from "./ui/date-fields";
import { useState, type FormEvent } from "react";
import { FormFoot, FormPanel, FormSection } from "./glaciar/screen";
import { buttonClass } from "./ui/button";
import { Field } from "./ui/field";
import { Icon } from "./ui/icon";
import { saveDownload } from "@/lib/export/download";
import {
  EXPORT_FORMATS,
  REPORT_SECTIONS,
  exportFormat,
  parseReportPeriod,
  reportFileName,
  type ExportFormatId,
  type ReportPeriod,
} from "@/lib/export/report-format";

type ExportState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "done"; message: string };

export function InformesPanel({
  initialPeriod,
}: {
  initialPeriod: ReportPeriod;
}) {
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [format, setFormat] = useState<ExportFormatId>("csv");
  const [state, setState] = useState<ExportState>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseReportPeriod({ from, to });
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
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setState({
          kind: "error",
          message:
            body?.error ?? "No se pudo generar el informe. Volvé a intentarlo.",
        });
        return;
      }
      const name = await saveDownload(response, reportFileName(parsed, format));
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
    <div className="gs-grid">
      <div className="gs-span-7">
        <FormPanel
          labelId="exportar"
          title="Exportar informe del período"
          description="Elegí las fechas y el formato. El resumen compara dos tramos dentro del período seleccionado."
        >
          <form onSubmit={submit} className="grid gap-4">
            <div className="gs-form__grid">
              <Field label="Desde">
                <DateInput value={from} onValueChange={setFrom} required />
              </Field>
              <Field label="Hasta">
                <DateInput value={to} onValueChange={setTo} required />
              </Field>
            </div>
            <FormSection legend="Formato">
              <div className="gs-choice">
                {EXPORT_FORMATS.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="formato"
                      value={option.id}
                      checked={format === option.id}
                      onChange={() => setFormat(option.id)}
                    />
                    <span>
                      <span className="font-medium">
                        {option.label} (.{option.extension})
                      </span>{" "}
                      <span className="gs-hint">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FormSection>
            <FormFoot>
              <button
                type="submit"
                className={buttonClass("primary")}
                disabled={pending || !from || !to}
              >
                <Icon name="reports" className="size-4" />
                {pending
                  ? "Generando informe…"
                  : `Exportar ${exportFormat(format)?.label}`}
              </button>
            </FormFoot>
          </form>
          {state.kind === "error" && (
            <div className="b-notice b-notice--critical" role="alert">
              <Icon name="alert" className="size-4.5 shrink-0" />
              <p className="min-w-0 font-medium">{state.message}</p>
            </div>
          )}
          {state.kind === "done" && (
            <div className="b-notice b-notice--info" role="status">
              <Icon name="info" className="size-4.5 shrink-0" />
              <p className="min-w-0 font-medium">{state.message}</p>
            </div>
          )}
        </FormPanel>
      </div>

      <section
        className="lab-panel gs-span-5"
        aria-labelledby="contenido-informe"
      >
        <header className="lab-panel__head">
          <h2 id="contenido-informe" className="lab-panel__title">
            Contenido del informe
          </h2>
        </header>
        <p className="lab-muted text-sm">
          Secciones y columnas incluidas en todos los formatos. Los importes se
          exportan como texto decimal exacto, sin redondeos.
        </p>
        <div className="gs-accordion mt-3">
          {REPORT_SECTIONS.map((section, index) => (
            <details key={section.id} open={index === 0}>
              <summary>{section.title}</summary>
              <p className="lab-muted text-sm">{section.description}</p>
              <p className="mt-1 text-sm">
                {section.columns.map((column) => column.label).join(" · ")}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
