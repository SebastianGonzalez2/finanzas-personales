"use client";

import { useRef, useState, type FormEvent } from "react";
import { accountDeletionConfirmation } from "@/lib/account-deletion";
import { HistoryField, historyControl } from "./history-fields";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export function AccountDeletion({ proof }: { proof: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openButton = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || confirmation !== accountDeletionConfirmation) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation, proof }),
      });
      const result = await response.json();
      if (!response.ok || result.deleted !== true) {
        setError(
          result.error ??
            "No se pudo confirmar el resultado. Volvé a Mi cuenta para comprobar el acceso.",
        );
        return;
      }
      window.location.replace("/auth/sign-in?cuenta=eliminada");
    } catch {
      setError(
        "No se pudo confirmar el resultado. Volvé a Mi cuenta para comprobar el acceso.",
      );
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  return (
    <section aria-labelledby="eliminar-cuenta" className="gs-danger">
      <h2 id="eliminar-cuenta" className="gs-danger__title">
        <Icon name="alert" className="size-4.5" />
        Eliminar cuenta
      </h2>
      <p className="lab-muted max-w-[70ch] text-sm">
        El borrado es irreversible en la aplicación. Vas a perder tus datos
        financieros y preferencias, se cerrarán todas tus sesiones y tu acceso
        quedará revocado en la lista privada.
      </p>
      <a className="lab-link min-h-11 w-fit" href="#descargar-copia">
        Descargar copia de seguridad
      </a>
      <p className="lab-muted max-w-[70ch] text-sm">
        La descarga es opcional. Los archivos que ya descargaste quedan en tus
        dispositivos. Las copias técnicas del proveedor pueden conservarse
        durante su ventana de recuperación.
      </p>
      <button
        ref={openButton}
        type="button"
        aria-controls="confirmar-eliminacion"
        aria-expanded={open}
        disabled={open}
        className={buttonClass(
          "outline",
          "gs-btn-danger w-fit disabled:hidden",
        )}
        onClick={() => setOpen(true)}
      >
        Eliminar mi cuenta y mis datos
      </button>
      <form id="confirmar-eliminacion" hidden={!open} onSubmit={submit}>
        {open && (
          <div className="grid gap-3">
            <p className="text-sm">
              Para confirmar necesitás haber entrado con Google en los últimos
              10 minutos. Si pasó más tiempo, cerrá sesión y volvé a entrar.
            </p>
            <HistoryField
              label={`Escribí ${accountDeletionConfirmation} para confirmar`}
            >
              <input
                autoFocus
                className={historyControl}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={accountDeletionConfirmation.length}
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
                  setOpen(false);
                  setConfirmation("");
                  setError("");
                  requestAnimationFrame(() => openButton.current?.focus());
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || confirmation !== accountDeletionConfirmation}
                className={buttonClass("outline", "gs-btn-danger")}
              >
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
            {error && (
              <div role="alert" className="b-notice b-notice--critical">
                <Icon name="alert" className="size-4.5 shrink-0" />
                <p className="min-w-0 text-sm wrap-anywhere">{error}</p>
              </div>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
