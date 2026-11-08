"use client";
import { useState } from "react";
import Link from "next/link";
import { createAuthClient } from "@neon/auth/next";

const client = createAuthClient();
type View =
  "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email";
const titles: Record<View, string> = {
  "sign-in": "Iniciar sesión",
  "sign-up": "Crear cuenta",
  "forgot-password": "Recuperar contraseña",
  "reset-password": "Elegir nueva contraseña",
  "verify-email": "Verificar correo",
};
const inputStyle =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const buttonStyle =
  "rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50";
export function AuthForm({ initialView }: { initialView: View }) {
  const [view, setView] = useState(initialView);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const signup = view === "sign-up";
  async function submit(
    element: HTMLFormElement,
    google = false,
    resend = false,
  ) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(element);
    try {
      let admissionId: string | undefined;
      if (signup) {
        const response = await fetch("/api/admission", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            provider: google ? "google" : "credential",
            code: form.get("invitation"),
          }),
        });
        if (!response.ok)
          throw new Error(
            "No se pudo autorizar el registro. Revisá la invitación o esperá antes de reintentar.",
          );
        admissionId = (await response.json()).admissionId;
      }
      const password = String(form.get("password") ?? "");
      let result;
      if (google) {
        result = await client.signIn.social({
          provider: "google",
          callbackURL: "/auth/callback",
          additionalData: admissionId ? { admissionId } : undefined,
        });
      } else if (signup) {
        // Transport is deliberately gated until a REAL before_create event proves
        // this metadata mapping for both credentials and OAuth on this branch.
        const data = {
          email,
          password,
          name: String(form.get("name") ?? ""),
          additionalData: { admissionId },
        };
        result = await client.signUp.email(data);
        if (!result.error) {
          setView("verify-email");
          setMessage("Ingresá el código que recibiste por correo.");
        }
      } else if (view === "verify-email") {
        result = resend
          ? await client.emailOtp.sendVerificationOtp({
              email,
              type: "email-verification",
            })
          : await client.emailOtp.verifyEmail({
              email,
              otp: String(form.get("otp") ?? ""),
            });
        if (!result.error) {
          if (resend)
            setMessage(
              "Si corresponde, recibirás un nuevo código. Respetá el tiempo de espera.",
            );
          else window.location.assign("/auth/callback");
        }
      } else if (view === "forgot-password") {
        await client.requestPasswordReset({
          email,
          redirectTo: "/auth/reset-password",
        });
        setMessage(
          "Si tu cuenta admite recuperación, recibirás un enlace por correo.",
        );
      } else if (view === "reset-password") {
        const token =
          new URL(window.location.href).searchParams.get("token") ?? "";
        result = await client.resetPassword({ newPassword: password, token });
        if (!result.error) {
          window.history.replaceState(null, "", "/auth/reset-password");
          setMessage("Contraseña actualizada. Iniciá sesión nuevamente.");
        }
      } else {
        result = await client.signIn.email({ email, password });
        if (!result.error) window.location.assign("/auth/callback");
      }
      if (result?.error)
        throw new Error(
          view === "verify-email"
            ? "El código no es válido o venció. Podés solicitar otro."
            : "No se pudo completar la solicitud. Revisá los datos e intentá nuevamente.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo conectar. Intentá nuevamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6">
      <h1 className="text-2xl font-semibold">{titles[view]}</h1>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        {view !== "reset-password" && (
          <label className="block space-y-1">
            <span>Correo electrónico</span>
            <input
              className={inputStyle}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
            />
          </label>
        )}
        {signup && (
          <>
            <label className="block space-y-1">
              <span>Nombre</span>
              <input
                className={inputStyle}
                name="name"
                autoComplete="name"
                required
                maxLength={100}
              />
            </label>
            <label className="block space-y-1">
              <span>Código de invitación</span>
              <input
                className={inputStyle}
                name="invitation"
                type="password"
                autoComplete="off"
                required
                maxLength={256}
              />
            </label>
          </>
        )}
        {["sign-in", "sign-up", "reset-password"].includes(view) && (
          <label className="block space-y-1">
            <span>Contraseña</span>
            <input
              className={inputStyle}
              name="password"
              type="password"
              autoComplete={
                view === "sign-in" ? "current-password" : "new-password"
              }
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        )}
        {view === "verify-email" && (
          <label className="block space-y-1">
            <span>Código de verificación</span>
            <input
              className={inputStyle}
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
        )}
        <div className="flex flex-col gap-3">
          <button className={buttonStyle} disabled={busy}>
            {busy ? "Procesando…" : titles[view]}
          </button>
          {(view === "sign-in" || signup) && (
            <button
              type="button"
              className={buttonStyle}
              disabled={busy}
              onClick={(e) => {
                const form = e.currentTarget.form;
                if (
                  form &&
                  (!signup ||
                    ((
                      form.elements.namedItem("email") as HTMLInputElement
                    ).reportValidity() &&
                      (
                        form.elements.namedItem(
                          "invitation",
                        ) as HTMLInputElement
                      ).reportValidity()))
                )
                  void submit(form, true);
              }}
            >
              Continuar con Google
            </button>
          )}
          {view === "verify-email" && (
            <button
              type="button"
              className={buttonStyle}
              disabled={busy}
              onClick={(e) => {
                if (e.currentTarget.form)
                  void submit(e.currentTarget.form, false, true);
              }}
            >
              Reenviar código
            </button>
          )}
        </div>
      </form>
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
      <nav className="flex flex-wrap gap-4 text-sm underline">
        <Link href="/auth/sign-in">Iniciar sesión</Link>
        <Link href="/auth/sign-up">Crear cuenta</Link>
        <Link href="/auth/forgot-password">¿Olvidaste tu contraseña?</Link>
        <Link href="/auth/verify-email">Verificar correo</Link>
      </nav>
    </section>
  );
}
