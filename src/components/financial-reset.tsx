"use client";

import { useRef, useState, type FormEvent } from "react";
import { financialResetConfirmation } from "@/lib/financial-reset";
import { HistoryField, historyControl } from "./history-fields";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

const failed =
  "No se pudo confirmar el resultado. Revisá tus datos antes de volver a intentarlo.";

async function requestReset(body: object) {
  const response = await fetch("/api/account/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? failed);
  return data;
}

export function FinancialReset({ proof }: { proof: string }) {
  const [revision, setRevision] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const success = useRef<HTMLParagraphElement>(null);

  async function prepare() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setDone(false);
    setError("");
    try {
      const result = await requestReset({ action: "prepare", proof });
      if (typeof result?.revision !== "string") throw new Error(failed);
      setRevision(result.revision);
    } catch (error) {
      setError(error instanceof Error ? error.message : failed);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (
      pending.current ||
      !revision ||
      confirmation !== financialResetConfirmation
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await requestReset({
        action: "reset",
        proof,
        revision,
        confirmation,
      });
      if (result?.reset !== true) throw new Error(failed);
      setRevision("");
      setConfirmation("");
      setDone(true);
      requestAnimationFrame(() => success.current?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : failed);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  return (
    <section aria-labelledby="reiniciar-datos" className="gs-danger">
      <h2 id="reiniciar-datos" className="gs-danger__title">
        <Icon name="alert" className="size-4.5" />
        Reiniciar datos
      </h2>
      <p className="lab-muted max-w-[70ch] text-sm">
        Empezá de cero. Se borrarán tus gastos, presupuestos, recurrentes,
        categorías, historial y configuraciones. Vas a seguir entrando con la
        misma cuenta de Google.
      </p>
      {!revision && (
        <button
          ref={openButton}
          type="button"
          aria-controls="confirmar-reinicio"
          aria-expanded={false}
          disabled={busy}
          className={buttonClass("outline", "gs-btn-danger w-fit")}
          onClick={prepare}
        >
          {busy ? "Preparando…" : "Reiniciar mis datos"}
        </button>
      )}
      <form id="confirmar-reinicio" hidden={!revision} onSubmit={reset}>
        {revision && (
          <div className="grid gap-3">
            <p className="text-sm">El borrado es definitivo.</p>
            <HistoryField
              label={`Escribí ${financialResetConfirmation} para confirmar`}
            >
              <input
                autoFocus
                className={historyControl}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={financialResetConfirmation.length}
                disabled={busy}
                required
              />
            </HistoryField>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={buttonClass("ghost")}
                onClick={() => {
                  setRevision("");
                  setConfirmation("");
                  setError("");
                  requestAnimationFrame(() => openButton.current?.focus());
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || confirmation !== financialResetConfirmation}
                className={buttonClass("outline", "gs-btn-danger")}
              >
                {busy ? "Reiniciando…" : "Borrar mis datos y empezar de cero"}
              </button>
            </div>
          </div>
        )}
      </form>
      {error && (
        <div role="alert" className="b-notice b-notice--critical">
          <Icon name="alert" className="size-4.5 shrink-0" />
          <p className="min-w-0 text-sm wrap-anywhere">{error}</p>
        </div>
      )}
      {done && (
        <div className="grid gap-2">
          <p ref={success} role="status" tabIndex={-1}>
            Reiniciaste tus datos. Ya podés empezar de cero.
          </p>
          <a href="/resumen" className="lab-link w-fit">
            Ir a Resumen
          </a>
        </div>
      )}
    </section>
  );
}
