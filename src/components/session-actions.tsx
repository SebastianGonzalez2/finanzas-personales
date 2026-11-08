"use client";
import { useState } from "react";
import { createAuthClient } from "@neon/auth/next";
const auth = createAuthClient();
export function SessionActions() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(signOut: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const result = signOut
        ? await auth.signOut()
        : await auth.revokeOtherSessions();
      if (result.error) throw new Error();
      if (signOut) window.location.replace("/auth/sign-in");
      else setMessage("Las otras sesiones fueron revocadas.");
    } catch {
      setMessage("No se pudo confirmar la operación. Intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        <button
          className="underline disabled:opacity-50"
          disabled={busy}
          onClick={() => void run(false)}
        >
          Cerrar otras sesiones
        </button>
        <button
          className="underline disabled:opacity-50"
          disabled={busy}
          onClick={() => void run(true)}
        >
          Cerrar sesión
        </button>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
