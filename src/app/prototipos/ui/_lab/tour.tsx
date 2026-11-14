"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LabIcon } from "./icons";

// UI-01 — Tutorial con flechas (propuesta para la variante Final). Sigue el
// mismo criterio del tutorial F6-06: no modal, solo orienta, no ejecuta nada.
// Diferencias: la tarjeta se ubica junto al elemento y una flecha lo señala.
// En el prototipo no se guarda nada: se abre una vez por visita y se puede
// repetir con «Ver tutorial».

type Step = { title: string; text: string; targets: readonly string[] };

export const labTourSteps: readonly Step[] = [
  {
    title: "Bienvenido a Finanzas personales",
    text: "Un recorrido corto por el resumen. Solo orienta: no registra ni cambia nada.",
    targets: [],
  },
  {
    title: "Moneda de toda la app",
    text: "Elegí en qué moneda ver los totales de toda la aplicación. Solo cambia cómo se muestran los números: tu dinero no se convierte.",
    targets: ['[data-tour="moneda-app"]'],
  },
  {
    title: "Tus cuentas por moneda",
    text: "Pasá de tu cuenta en pesos a la de dólares o euros. Muestra lo que tenés en cada una; no convierte una en otra.",
    targets: ['[data-tour="moneda-cuenta"]'],
  },
  {
    title: "Cambio de moneda",
    text: "Registrá cuando pasás plata entre tus cuentas del banco, por ejemplo de pesos a dólares. Baja una, sube la otra y no cuenta como gasto ni ingreso.",
    targets: ['[data-tour="cambio-moneda"]'],
  },
  {
    title: "Confirmar saldo",
    text: "Anotá el saldo exacto que te muestra tu banco. Queda como punto de control y la app toma esa cifra como referencia.",
    targets: ['[data-tour="confirmar-saldo"]'],
  },
  {
    title: "Registrar un movimiento",
    text: "Desde acá cargás gastos, ingresos y el resto de las operaciones.",
    targets: ['[data-tour="registrar"]', ".c-dock__add"],
  },
  {
    title: "Menú de secciones",
    text: "Historial, Tarjetas, Fondos, Presupuestos, Estadísticas y más. En computadora se abre al pasar el mouse.",
    targets: [".c-rail", ".c-dock"],
  },
  {
    title: "Ayuda cuando la necesites",
    text: "En Ayuda tenés las preguntas frecuentes con más detalle y podés repetir este recorrido.",
    targets: [
      '.c-rail [data-nav="ayuda"]',
      '.c-dock button[aria-label="Abrir navegación"]',
    ],
  },
];

const openEvent = "lab-tour:open";
let shownThisVisit = false;

export function openLabTour() {
  window.dispatchEvent(new Event(openEvent));
}

type Rect = { top: number; left: number; width: number; height: number };
type Layout = {
  box: Rect | null;
  card: { top: number; left: number; width: number };
  arrow: string | null;
};

const pad = 8;
const gap = 28;

function visibleTarget(selectors: readonly string[]) {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
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
  const width = mobile ? vw - 24 : 340;

  if (!target) {
    return {
      box: null,
      card: mobile
        ? { top: vh - cardHeight - 12, left: 12, width }
        : { top: vh - cardHeight - 24, left: vw - width - 24, width },
      arrow: null,
    };
  }

  const r = target.getBoundingClientRect();
  const box = {
    top: r.top - pad,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  let card: Layout["card"];
  let start: [number, number];
  let end: [number, number];

  if (mobile) {
    card = { top: vh - cardHeight - 12, left: 12, width };
    start = [clamp(cx, 40, vw - 40), card.top - 6];
    end = [cx, box.top + box.height + 6];
    if (end[1] > start[1]) end = [cx, box.top - 6];
  } else if (box.top + box.height + gap + cardHeight < vh - 16) {
    // Debajo del elemento.
    const left = clamp(cx - width / 2 + 60, 16, vw - width - 16);
    card = { top: box.top + box.height + gap, left, width };
    start = [clamp(cx, left + 28, left + width - 28), card.top - 6];
    end = [cx, box.top + box.height + 4];
  } else if (box.top - gap - cardHeight > 56) {
    // Encima del elemento.
    const left = clamp(cx - width / 2 + 60, 16, vw - width - 16);
    card = { top: box.top - gap - cardHeight, left, width };
    start = [
      clamp(cx, left + 28, left + width - 28),
      card.top + cardHeight + 6,
    ];
    end = [cx, box.top - 4];
  } else {
    // Al costado (elementos altos como el menú lateral).
    const right = box.left + box.width + gap;
    const left =
      right + width < vw - 16 ? right : Math.max(16, box.left - gap - width);
    const top = clamp(cy - cardHeight / 2, 64, vh - cardHeight - 16);
    card = { top, left, width };
    const onRight = left >= box.left + box.width;
    start = [
      onRight ? left - 6 : left + width + 6,
      clamp(cy, top + 28, top + cardHeight - 28),
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

export function LabTour() {
  const [step, setStep] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(openEvent, open);
    let timer = 0;
    if (!shownThisVisit) {
      shownThisVisit = true;
      timer = window.setTimeout(open, 900);
    }
    return () => {
      window.removeEventListener(openEvent, open);
      window.clearTimeout(timer);
    };
  }, []);

  const close = useCallback(() => {
    setStep(null);
    setLayout(null);
    document.getElementById("titulo-pagina")?.focus();
  }, []);

  useEffect(() => {
    if (step === null) return;
    const targets = labTourSteps[step].targets;
    const target = visibleTarget(targets);
    if (target && !target.closest(".c-rail, .c-dock")) {
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
    card.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector("dialog[open]"))
        return;
      close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [opened, close]);

  if (step === null) return null;
  const current = labTourSteps[step];
  const last = step === labTourSteps.length - 1;

  return (
    <>
      {layout?.box && (
        <div
          aria-hidden="true"
          className="lab-tour__spot"
          style={{ ...layout.box }}
        />
      )}
      {layout?.arrow && (
        <svg aria-hidden="true" className="lab-tour__arrow">
          <defs>
            <marker
              id="lab-tour-head"
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
            markerEnd="url(#lab-tour-head)"
            className="lab-tour__path"
          />
        </svg>
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-labelledby="lab-tour-titulo"
        aria-describedby="lab-tour-texto"
        tabIndex={-1}
        className="lab-tour__card"
        style={
          layout
            ? {
                top: layout.card.top,
                left: layout.card.left,
                width: layout.card.width,
              }
            : { visibility: "hidden" }
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="lab-tour__count">
              Paso {step + 1} de {labTourSteps.length}
            </p>
            <h2 id="lab-tour-titulo" className="lab-tour__title">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            className="lab-icon-btn -mt-2 -mr-2"
            aria-label="Cerrar tutorial"
            onClick={close}
          >
            <LabIcon name="close" duotone={false} className="size-4.5" />
          </button>
        </div>
        <p id="lab-tour-texto" aria-live="polite" className="lab-tour__text">
          {current.text}
        </p>
        <div aria-hidden="true" className="lab-tour__dots">
          {labTourSteps.map((item, index) => (
            <span
              key={item.title}
              className={index <= step ? "is-done" : undefined}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="lab-btn lab-btn--ghost"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className="lab-btn lab-btn--primary ml-auto"
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {last ? "Finalizar" : "Siguiente"}
          </button>
        </div>
      </div>
    </>
  );
}
