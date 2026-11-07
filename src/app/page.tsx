import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main
      id="contenido"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-8 px-4 py-12 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring sm:px-6"
    >
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Finanzas personales
        </p>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          Tu espacio para organizar tus finanzas
        </h1>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            Estamos preparando tu espacio
          </h2>
        </CardHeader>
        <CardContent className="space-y-4 text-base leading-6 text-muted-foreground">
          <p>
            La aplicación está en desarrollo. Las funciones se habilitarán por
            etapas.
          </p>
          <p>
            Todavía no es posible crear una cuenta ni registrar movimientos.
          </p>
        </CardContent>
      </Card>

      <footer className="text-sm text-muted-foreground">
        Una vista inicial, sin datos financieros.
      </footer>
    </main>
  );
}
