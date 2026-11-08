import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthForm } from "@/components/auth-form";
import {
  authEnabled,
  appOrigin,
  resolveAuthorizedOwner,
} from "@/server/auth.ts";
export const dynamic = "force-dynamic";
export default async function AuthPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (
    ![
      "sign-in",
      "sign-up",
      "forgot-password",
      "reset-password",
      "verify-email",
      "callback",
      "blocked",
    ].includes(view)
  )
    notFound();
  if (!authEnabled())
    return (
      <main id="contenido" className="mx-auto max-w-md space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">Acceso en preparación</h1>
        <p>El registro y el inicio de sesión todavía no están habilitados.</p>
        <Link className="underline" href="/">
          Volver al inicio
        </Link>
      </main>
    );
  if (view === "callback") {
    const identity = await resolveAuthorizedOwner(
      new Request(`${appOrigin()}/auth/callback`, { headers: await headers() }),
    );
    redirect(identity ? "/account" : "/auth/blocked");
  }
  if (view === "blocked")
    return (
      <main id="contenido" className="mx-auto max-w-md space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">
          No se pudo autorizar el acceso
        </h1>
        <p>Se necesita una cuenta verificada y una invitación válida.</p>
        <Link className="underline" href="/auth/sign-in">
          Volver a iniciar sesión
        </Link>
      </main>
    );
  return (
    <main
      id="contenido"
      className="flex min-h-dvh items-center justify-center px-4 py-10"
    >
      <AuthForm
        key={view}
        initialView={
          view as
            | "sign-in"
            | "sign-up"
            | "forgot-password"
            | "reset-password"
            | "verify-email"
        }
      />
    </main>
  );
}
