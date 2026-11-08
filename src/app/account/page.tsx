import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { withGoogleOwner } from "@/server/google-auth.ts";
import { GoogleAccess } from "@/components/google-access";
export const dynamic = "force-dynamic";
export default async function Account() {
  const authorized = await withGoogleOwner(
    new Request("https://internal.invalid", { headers: await headers() }),
    async () => true,
  ).catch(() => false);
  if (!authorized) redirect("/auth/sign-in");
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-5 py-12"
    >
      <h1 className="text-2xl font-semibold">Tu cuenta está conectada</h1>
      <p>
        Tu acceso es privado. Las funciones financieras se habilitarán por
        etapas.
      </p>
      <GoogleAccess signOut />
    </main>
  );
}
