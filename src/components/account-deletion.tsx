"use client";

import { useRef, useState, type FormEvent } from "react";
import { accountDeletionConfirmation } from "@/lib/account-deletion";
import { HistoryField, historyControl } from "./history-fields";
import { Card } from "./ui/card";

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
    <section aria-labelledby="eliminar-cuenta" className="mt-6 max-w-2xl">
      <Card className="gap-3 p-5 shadow-none">
        <h2 id="eliminar-cuenta" className="text-lg font-semibold">
          Eliminar cuenta
        </h2>
        <p className="text-sm text-muted-foreground">
          El borrado es irreversible en la aplicación. Vas a perder tus datos
          financieros y preferencias, se cerrarán todas tus sesiones y tu acceso
          quedará revocado en la lista privada.
        </p>
        <a
          className="w-fit py-2 text-sm font-medium underline"
          href="#descargar-copia"
        >
          Descargar copia de seguridad
        </a>
        <p className="text-sm text-muted-foreground">
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
          className="w-fit min-h-11 rounded-lg border border-red-400/70 px-4 font-medium text-red-300 disabled:hidden"
          onClick={() => setOpen(true)}
        >
          Eliminar mi cuenta y mis datos
        </button>
        <form id="confirmar-eliminacion" hidden={!open} onSubmit={submit}>
          {open && (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
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
                  className="min-h-11 rounded-lg border px-4 font-medium"
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
                  disabled={
                    busy || confirmation !== accountDeletionConfirmation
                  }
                  className="min-h-11 rounded-lg bg-red-700 px-4 font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Eliminando…" : "Eliminar definitivamente"}
                </button>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
            </div>
          )}
        </form>
      </Card>
    </section>
  );
}
