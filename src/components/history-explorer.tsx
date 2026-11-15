"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// UI-04: el prototipo filtraba en el cliente. La app real sigue consultando
// al servidor (GET /historial?…): este contenedor navega dentro de una
// transición, marca la tabla como ocupada mientras llega la respuesta y
// devuelve el foco al control que la originó (o a los resultados), para que
// teclado y lector de pantalla no lo pierdan al rehacerse el formulario.
type Navigate = (url: string, focusId?: string) => void;

const HistoryNavigation = createContext<Navigate>((url) => {
  window.location.assign(url);
});

export function useHistoryNavigate() {
  return useContext(HistoryNavigation);
}

export function HistoryExplorer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const focusAfter = useRef<string | null>(null);

  const navigate = useCallback<Navigate>(
    (url, focusId) => {
      focusAfter.current = focusId ?? null;
      startTransition(() => router.push(url, { scroll: false }));
    },
    [router],
  );

  useEffect(() => {
    if (pending || !focusAfter.current) return;
    const target = document.getElementById(focusAfter.current);
    focusAfter.current = null;
    target?.focus();
  }, [pending]);

  return (
    <HistoryNavigation value={navigate}>
      <section
        aria-labelledby="resultados"
        aria-busy={pending}
        className="lab-panel lab-panel--dense"
      >
        {children}
      </section>
    </HistoryNavigation>
  );
}
