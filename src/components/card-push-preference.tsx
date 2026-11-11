"use client";

import { useEffect, useRef, useState } from "react";

const worker = "/card-push-worker.js";
const api = "/api/avisos/push";

function supported() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function pushRequest(body: object) {
  const response = await fetch(api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409 ? "device-in-use" : "push-unavailable",
    );
  const { enabled } = (await response.json()) as { enabled: boolean };
  return enabled;
}

export function PushPreference({
  storageReady,
  publicKey,
}: {
  storageReady: boolean;
  publicKey: string | null;
}) {
  const [state, setState] = useState<
    "loading" | "active" | "inactive" | "blocked" | "unsupported" | "unknown"
  >("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const subscription = useRef<PushSubscription | null>(null);

  useEffect(() => {
    let current = true;
    async function check() {
      try {
        let next: typeof state = "unsupported";
        if (supported()) {
          const existing = storageReady
            ? await navigator.serviceWorker.getRegistration("/")
            : null;
          const ready = publicKey
            ? await navigator.serviceWorker
                .register(worker)
                .then(() => navigator.serviceWorker.ready)
            : existing;
          const device = (await ready?.pushManager.getSubscription()) ?? null;
          if (!current) return;
          registration.current = ready ?? null;
          subscription.current = device;
          if (
            device &&
            (await pushRequest({
              action: "status",
              endpoint: device.endpoint,
            }))
          ) {
            next = "active";
          } else {
            next =
              Notification.permission === "denied" ? "blocked" : "inactive";
          }
        }
        if (current) setState(next);
      } catch {
        if (current) setState("unknown");
      }
    }
    void check();
    return () => {
      current = false;
    };
  }, [publicKey, storageReady]);

  async function activate() {
    if (!publicKey || !registration.current) return;
    setBusy(true);
    setMessage("");
    try {
      // Subscribe directly from the click so Safari can prompt with a gesture.
      const device =
        subscription.current ??
        (await registration.current.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        }));
      subscription.current = device;
      await pushRequest({
        action: "enable",
        subscription: device.toJSON(),
      });
      setState("active");
    } catch (error) {
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      setMessage(
        error instanceof Error && error.message === "device-in-use"
          ? "Este navegador ya tiene una suscripción asociada a otra cuenta. Usá otro perfil del navegador."
          : "No pudimos activar los avisos. Revisá la compatibilidad del navegador y volvé a intentar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    setMessage("");
    try {
      const device = subscription.current;
      if (device) {
        await pushRequest({
          action: "disable",
          endpoint: device.endpoint,
        });
      }
      // Keep the device registration so reactivation preserves deduplication.
      setState(Notification.permission === "denied" ? "blocked" : "inactive");
    } catch {
      setMessage("No pudimos confirmar la desactivación. Volvé a intentar.");
    } finally {
      setBusy(false);
    }
  }

  const status = {
    loading: "Consultando el estado de este dispositivo…",
    active: publicKey
      ? "Activados en este dispositivo."
      : "Activados en este dispositivo. El envío está temporalmente deshabilitado.",
    inactive: publicKey
      ? "Desactivados en este dispositivo."
      : "El envío push todavía no está disponible.",
    blocked:
      "El navegador bloqueó el permiso. Podés cambiarlo en la configuración del sitio.",
    unsupported:
      "Este navegador no admite avisos push aquí. En iPhone, abrí la app desde la pantalla de inicio.",
    unknown:
      "No pudimos comprobar el estado de los avisos en este dispositivo.",
  }[state];

  return (
    <section aria-labelledby="preferencia-push" className="grid gap-2">
      <h2 id="preferencia-push" className="font-semibold">
        Avisos al celular (opcional)
      </h2>
      <div className="grid gap-2 rounded-lg border p-4 text-sm">
        <p>
          Recibí avisos de vencimiento de tarjetas de crédito en este
          dispositivo.
        </p>
        <p role="status" className="text-muted-foreground">
          {message || status}
        </p>
        {state === "active" && (
          <button
            type="button"
            className="w-fit rounded-md border px-3 py-2 font-medium hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={deactivate}
          >
            Desactivar avisos push
          </button>
        )}
        {state === "inactive" && publicKey && (
          <button
            type="button"
            className="w-fit rounded-md border px-3 py-2 font-medium hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={activate}
          >
            Activar avisos push
          </button>
        )}
      </div>
    </section>
  );
}
