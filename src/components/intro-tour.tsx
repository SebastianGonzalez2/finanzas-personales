"use client";

// F6-06: tutorial introductorio no modal. Solo orienta; destaca elementos
// reales del shell y de Resumen sin bloquear la navegación ni ejecutar nada.
// Preferencia de interfaz únicamente: localStorage (completado / no volver a
// mostrar) y sessionStorage (omitido en esta pestaña). Sin datos financieros.

import { useCallback, useEffect, useRef, useState } from "react";
import { FinanceIcon } from "./finance-icon";
import {
  shouldShowTutorial,
  tutorialReplayParam,
  tutorialStorageKey,
  tutorialSteps,
  type TutorialStatus,
} from "@/domain/tutorial";

const skipKey = `${tutorialStorageKey}:omitido`;
const pad = 6;

type Box = { top: number; left: number; width: number; height: number };

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado): el tutorial simplemente puede repetirse.
  }
}

function visibleTarget(selectors: readonly string[]) {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

const button = "min-h-11 rounded-lg px-3 text-sm font-semibold";
const textButton =
  "min-h-11 rounded-lg px-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground";

export function IntroTour() {
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Solo en cliente y dentro de una pantalla ya autorizada por el servidor:
  // evita diferencias de hidratación y nunca aparece en el inicio de sesión.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const replay = params.get(tutorialReplayParam) === "1";
    if (replay) {
      params.delete(tutorialReplayParam);
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
    const show = shouldShowTutorial({
      stored: read(() => window.localStorage, tutorialStorageKey),
      skippedThisSession: read(() => window.sessionStorage, skipKey) === "1",
      replay,
    });
    if (!show) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => setStep(0), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const close = useCallback((status: TutorialStatus | "skipped") => {
    if (status === "skipped") write(() => window.sessionStorage, skipKey, "1");
    else write(() => window.localStorage, tutorialStorageKey, status);
    setStep(null);
    setBox(null);
    const previous = returnFocus.current;
    (previous && previous !== document.body && previous.isConnected
      ? previous
      : document.getElementById("titulo-pagina")
    )?.focus();
  }, []);

  // Destaca el elemento del paso (si existe y es visible) y lo mantiene alineado.
  useEffect(() => {
    if (step === null) return;
    const targets = tutorialSteps[step].targets;
    // En móvil la tarjeta ocupa el ancho inferior; en escritorio queda a un lado.
    const room = () =>
      window.innerWidth < 640
        ? window.innerHeight - (card.current?.offsetHeight ?? 0) - 24
        : window.innerHeight - 8;

    const target = visibleTarget(targets);
    if (target?.closest(".finance-sidebar")) {
      // La barra lateral es fija y con desplazamiento propio.
      target.scrollIntoView({ block: "nearest" });
    } else if (target) {
      const { top, bottom } = target.getBoundingClientRect();
      if (top < 72 || bottom > room()) window.scrollBy(0, top - 72);
    }

    function measure() {
      const element = visibleTarget(targets);
      if (!element) return setBox(null);
      const rect = element.getBoundingClientRect();
      const top = Math.max(rect.top - pad, 4);
      const bottom = Math.min(rect.bottom + pad, room());
      if (bottom - top < 24) return setBox(null);
      setBox({
        top,
        left: Math.max(rect.left - pad, 4),
        width: Math.min(rect.width + pad * 2, window.innerWidth - 8),
        height: bottom - top,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [step]);

  const opened = step !== null;
  useEffect(() => {
    if (!opened) return;
    card.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      // El cajón de navegación modal gestiona su propio Escape.
      if (event.key !== "Escape" || document.querySelector("dialog[open]"))
        return;
      close("skipped");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [opened, close]);

  if (step === null) return null;
  const current = tutorialSteps[step];
  const last = step === tutorialSteps.length - 1;

  return (
    <>
      {box && (
        <div
          aria-hidden="true"
          data-testid="tutorial-highlight"
          className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-ring"
          style={{ ...box, boxShadow: "0 0 0 100vmax rgb(0 0 0 / 40%)" }}
        />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-label="Tutorial introductorio"
        tabIndex={-1}
        className="fixed inset-x-3 bottom-3 z-50 grid gap-3 rounded-2xl border bg-card p-4 text-card-foreground shadow-lg outline-none sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[24rem]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">
              Paso {step + 1} de {tutorialSteps.length}
            </p>
            <h2 id="tutorial-titulo" className="text-base font-semibold">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            className="finance-icon-button -mt-2 -mr-2"
            aria-label="Cerrar tutorial"
            onClick={() => close("skipped")}
          >
            <FinanceIcon name="close" />
          </button>
        </div>
        <p id="tutorial-texto" aria-live="polite" className="text-sm">
          {current.text}
        </p>
        <div aria-hidden="true" className="flex gap-1.5">
          {tutorialSteps.map((item, index) => (
            <span
              key={item.id}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${button} border aria-disabled:opacity-50`}
            aria-disabled={step === 0}
            onClick={() => step > 0 && setStep(step - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className={`${button} flex-1 bg-primary text-primary-foreground`}
            onClick={() => (last ? close("completed") : setStep(step + 1))}
          >
            {last ? "Finalizar" : "Siguiente"}
          </button>
        </div>
        <div className="-mb-1 flex flex-wrap justify-between gap-x-3">
          <button
            type="button"
            className={textButton}
            onClick={() => close("skipped")}
          >
            Omitir
          </button>
          <button
            type="button"
            className={textButton}
            onClick={() => close("hidden")}
          >
            No volver a mostrar
          </button>
        </div>
      </div>
    </>
  );
}
