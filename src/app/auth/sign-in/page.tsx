import { GoogleAccess } from "@/components/google-access";
import { googleAuthEnabled } from "@/server/google-auth.ts";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cuenta?: string }>;
}) {
  const { error, cuenta } = await searchParams;
  return (
    <main
      id="contenido"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-5 py-12"
    >
      <p className="text-sm text-muted-foreground">Finanzas personales</p>
      <h1 className="text-2xl font-semibold">Tu espacio personal</h1>
      <p>Acceso privado para las cuentas Google autorizadas.</p>
      {cuenta === "eliminada" && (
        <p role="status">
          Eliminaste tu cuenta y tus datos de Finanzas personales.
        </p>
      )}
      {error && (
        <p role="alert">
          No se pudo autorizar el acceso. Revisá la cuenta elegida.
        </p>
      )}
      {googleAuthEnabled() ? (
        <GoogleAccess />
      ) : (
        <p role="status">Estamos preparando el acceso con Google.</p>
      )}
    </main>
  );
}
