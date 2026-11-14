"use client";

import { Button } from "@/components/ui/button";

export default function SummaryError({ reset }: { reset: () => void }) {
  return (
    <main id="contenido" className="mx-auto grid max-w-lg gap-4 p-6">
      <h1 className="text-2xl font-semibold">Resumen financiero</h1>
      <p role="alert">
        No pudimos cargar el Resumen financiero. Intentá nuevamente.
      </p>
      <Button onClick={reset} className="justify-self-start">
        Volver a intentar
      </Button>
    </main>
  );
}
