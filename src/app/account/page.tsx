import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authEnabled,
  resolveAuthorizedOwner,
  appOrigin,
} from "@/server/auth.ts";
import { SessionActions } from "@/components/session-actions";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  if (!authEnabled()) redirect("/auth/sign-in");
  const identity = await resolveAuthorizedOwner(
    new Request(`${appOrigin()}/account`, { headers: await headers() }),
  );
  if (!identity) redirect("/auth/sign-in");
  return (
    <main id="contenido" className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Tu cuenta</h1>
      <p>Acceso verificado. Las funciones financieras siguen en preparación.</p>
      <SessionActions />
    </main>
  );
}
