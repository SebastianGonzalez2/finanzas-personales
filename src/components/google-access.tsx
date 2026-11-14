"use client";
import { useState } from "react";
import { buttonClass } from "./ui/button";
export function GoogleAccess({ signOut = false }: { signOut?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/auth/${signOut ? "sign-out" : "sign-in/social"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(signOut ? {} : { provider: "google" }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error();
      if (signOut) {
        window.location.assign("/auth/sign-in");
        return;
      }
      const target = new URL(data.url);
      if (
        target.protocol !== "https:" ||
        target.hostname !== "accounts.google.com"
      )
        throw new Error();
      window.location.assign(target.href);
    } catch {
      setMessage("No se pudo completar el acceso. Intentá nuevamente.");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        aria-busy={busy}
        className={buttonClass(
          signOut ? "outline" : "primary",
          "min-h-11 px-4 text-[15px]",
        )}
      >
        {busy ? "Un momento…" : signOut ? "Cerrar sesión" : "Entrar con Google"}
      </button>
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
    </>
  );
}
