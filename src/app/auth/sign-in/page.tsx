import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/finance-navigation";
import { GoogleAccess } from "@/components/google-access";
import { Icon } from "@/components/ui/icon";
import { googleAuthEnabled } from "@/server/google-auth.ts";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cuenta?: string }>;
}) {
  const { error, cuenta } = await searchParams;
  // UI-02: mismo fondo ambiental y vidrio que la aplicación. El acceso sigue
  // siendo solo Google con allowlist (ADR 0004): esta pantalla no lee datos.
  return (
    <div className="glaciar-root">
      <AmbientBackground />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12"
      >
        <section className="ui-panel ui-panel--hero gap-6 p-6 sm:p-8">
          <span className="ui-hero-orb" aria-hidden="true" />
          <div className="relative grid gap-6">
            <Brand />
            <div className="grid gap-3">
              <h1 className="text-[clamp(28px,7vw,36px)] leading-tight font-bold tracking-[-0.035em]">
                Tu espacio personal
              </h1>
              <p className="flex items-start gap-2 text-muted-foreground">
                <Icon name="account" className="mt-0.5 size-4 text-primary" />
                Acceso privado para las cuentas Google autorizadas.
              </p>
            </div>
            {cuenta === "eliminada" && (
              <p
                role="status"
                className="rounded-xl border border-border-strong bg-glass-3 px-4 py-3 text-sm"
              >
                Eliminaste tu cuenta y tus datos de Finanzas personales.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-critical/40 bg-critical/10 px-4 py-3 text-sm"
              >
                <Icon
                  name="alert"
                  className="mt-0.5 size-4 text-critical"
                  duotone={false}
                />
                No se pudo autorizar el acceso. Revisá la cuenta elegida.
              </p>
            )}
            {googleAuthEnabled() ? (
              <div className="grid gap-2">
                <GoogleAccess />
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Estamos preparando el acceso con Google.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
