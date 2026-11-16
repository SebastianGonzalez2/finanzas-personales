"use client";

// F6-06 + UI-06: tutorial introductorio no modal. Solo orienta; destaca
// elementos reales del shell y de Resumen y los señala con una flecha, sin
// bloquear la navegación ni ejecutar nada.
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
const pad = 8;
const gap = 28;
const cardWidth = 340;

type Rect = { top: number; left: number; width: number; height: number };
type Layout = {
  box: Rect | null;
  card: { top: number; left: number; width: number } | null;
  arrow: string | null;
};

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

/** Primer elemento visible entre los selectores candidatos. */
function visibleTarget(selectors: readonly string[]) {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
  }
  return null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Ubica la tarjeta junto al elemento y traza una flecha curva hacia él. */
function computeLayout(target: HTMLElement | null, cardHeight: number): Layout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw < 640;
  const width = mobile ? vw - 24 : cardWidth;
  const bottomCard = {
    top: vh - cardHeight - (mobile ? 12 : 24),
    left: mobile ? 12 : vw - width - 24,
    width,
  };
  if (!target) return { box: null, card: bottomCard, arrow: null };

  const r = target.getBoundingClientRect();
  const top = Math.max(r.top - pad, 4);
  const left = Math.max(r.left - pad, 4);
  const box = {
    top,
    left,
    width: Math.min(r.width + pad * 2, vw - 4 - left),
    height: Math.min(r.height + pad * 2, vh - 4 - top),
  };
  const cx = clamp(r.left + r.width / 2, 8, vw - 8);
  const cy = clamp(r.top + r.height / 2, 8, vh - 8);
  const boxBottom = box.top + box.height;

  let card: { top: number; left: number; width: number };
  let start: [number, number];
  let end: [number, number];

  if (mobile) {
    // La tarjeta ocupa el ancho; sube si el elemento está en la mitad inferior
    // (barra flotante) para no taparlo.
    const onTop = r.top > vh / 2;
    card = { top: onTop ? 12 : bottomCard.top, left: 12, width };
    start = [
      clamp(cx, 40, vw - 40),
      onTop ? card.top + cardHeight + 6 : card.top - 6,
    ];
    end = [cx, onTop ? box.top - 6 : boxBottom + 6];
  } else if (boxBottom + gap + cardHeight < vh - 16) {
    // Debajo del elemento.
    const x = clamp(cx - width / 2 + 60, 16, vw - width - 16);
    card = { top: boxBottom + gap, left: x, width };
    start = [clamp(cx, x + 28, x + width - 28), card.top - 6];
    end = [cx, boxBottom + 4];
  } else if (box.top - gap - cardHeight > 56) {
    // Encima del elemento.
    const x = clamp(cx - width / 2 + 60, 16, vw - width - 16);
    card = { top: box.top - gap - cardHeight, left: x, width };
    start = [clamp(cx, x + 28, x + width - 28), card.top + cardHeight + 6];
    end = [cx, box.top - 4];
  } else {
    // Al costado (elementos altos como el riel lateral).
    const right = box.left + box.width + gap;
    const x =
      right + width < vw - 16 ? right : Math.max(16, box.left - gap - width);
    const y = clamp(cy - cardHeight / 2, 16, vh - cardHeight - 16);
    card = { top: y, left: x, width };
    const onRight = x >= box.left + box.width;
    start = [
      onRight ? x - 6 : x + width + 6,
      clamp(cy, y + 28, y + cardHeight - 28),
    ];
    end = [onRight ? box.left + box.width + 4 : box.left - 4, cy];
  }

  const [sx, sy] = start;
  const [ex, ey] = end;
  const bend = Math.abs(ex - sx) < 24 ? 36 : 0;
  const control = [(sx + ex) / 2 + bend, (sy + ey) / 2 - (bend ? 0 : 24)];
  return {
    box,
    card,
    arrow: `M${sx},${sy} Q${control[0]},${control[1]} ${ex},${ey}`,
  };
}

export function IntroTour() {
  const [step, setStep] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
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
    setLayout(null);
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

    const target = visibleTarget(targets);
    if (target?.closest(".finance-sidebar, .finance-dock")) {
      // El riel y la barra móvil son fijos (el riel, con desplazamiento propio).
      target.scrollIntoView({ block: "nearest" });
    } else if (target) {
      // Deja sitio a la tarjeta: abajo en móvil, y en escritorio debajo o
      // encima del elemento.
      const { top, bottom } = target.getBoundingClientRect();
      const room =
        window.innerWidth < 640
          ? window.innerHeight * 0.5
          : window.innerHeight - 260;
      if (top < 96 || bottom > room) window.scrollBy(0, top - 140);
    }

    function measure() {
      const height = card.current?.offsetHeight ?? 200;
      setLayout(computeLayout(visibleTarget(targets), height));
    }

    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [step]);

  const opened = step !== null;
  useEffect(() => {
    if (!opened) return;
    card.current?.focus({ preventScroll: true });
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
      {layout?.box && (
        <div
          aria-hidden="true"
          data-testid="tutorial-highlight"
          className="intro-tour__spot"
          style={{ ...layout.box }}
        />
      )}
      {layout?.arrow && (
        <svg aria-hidden="true" className="intro-tour__arrow">
          <defs>
            <marker
              id="intro-tour-head"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M1,1 L9,5 L1,9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>
          <path
            key={step}
            d={layout.arrow}
            pathLength={1}
            markerEnd="url(#intro-tour-head)"
            className="intro-tour__path"
          />
        </svg>
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-label="Tutorial introductorio"
        aria-describedby="tutorial-texto"
        tabIndex={-1}
        className="intro-tour__card"
        style={layout?.card ? { ...layout.card } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="intro-tour__count">
              Paso {step + 1} de {tutorialSteps.length}
            </p>
            <h2 id="tutorial-titulo" className="intro-tour__title">
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
        <p id="tutorial-texto" aria-live="polite" className="intro-tour__text">
          {current.text}
        </p>
        <div aria-hidden="true" className="intro-tour__dots">
          {tutorialSteps.map((item, index) => (
            <span
              key={item.id}
              className={index <= step ? "is-done" : undefined}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ui-btn ui-btn--outline aria-disabled:opacity-50"
            aria-disabled={step === 0}
            onClick={() => step > 0 && setStep(step - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary ml-auto"
            onClick={() => (last ? close("completed") : setStep(step + 1))}
          >
            {last ? "Finalizar" : "Siguiente"}
          </button>
        </div>
        <div className="-mb-1 flex flex-wrap justify-between gap-x-3">
          <button
            type="button"
            className="intro-tour__link"
            onClick={() => close("skipped")}
          >
            Omitir
          </button>
          <button
            type="button"
            className="intro-tour__link"
            onClick={() => close("hidden")}
          >
            No volver a mostrar
          </button>
        </div>
      </div>
    </>
  );
}
