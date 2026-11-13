"use client";

import { useEffect, useRef, useState } from "react";
import { connectionAwareMessage } from "./connection";

// After an uncertain response, only the same payload may be retried. A new key
// could create a second confirmation if the first one was already committed.
export function useFinancialCommand(url: string, method: "POST" | "PATCH") {
  const lock = useRef(false);
  const sent = useRef<string>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");

  async function send(fields: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      sent.current ??= JSON.stringify({
        ...fields,
        idempotencyKey: crypto.randomUUID(),
      });
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: sent.current,
      });
      const data: { id?: string; error?: string } = await response.json();
      if (response.ok && data.id) {
        sent.current = null;
        setUncertain(false);
        return data.id;
      }
      if (
        response.status >= 500 ||
        !data.error ||
        (uncertain && response.status === 401)
      )
        throw new Error();
      sent.current = null;
      setUncertain(false);
      setError(data.error);
    } catch {
      setUncertain(sent.current !== null);
      setError(
        connectionAwareMessage(
          "No pudimos confirmar el guardado. Reintentá el mismo envío.",
        ),
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
    return false;
  }

  // Con un envío sin confirmar, recargar descartaría el formulario en memoria.
  useEffect(() => {
    if (!uncertain) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uncertain]);

  return { send, pending, uncertain, error, clearError: () => setError("") };
}
