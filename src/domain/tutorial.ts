// F6-06: tutorial introductorio. Contenido estático y reglas de visualización.
// Solo se guarda una preferencia de interfaz en localStorage (sin datos
// financieros ni Neon); ver `src/components/intro-tour.tsx`.

export const tutorialStorageKey = "finanzas:tutorial-introductorio:v1";
export const tutorialReplayParam = "tutorial";

export type TutorialStatus = "completed" | "hidden";

export type TutorialStep = {
  id: string;
  title: string;
  text: string;
  /** Selectores CSS candidatos; se destaca el primero visible. Sin ellos, el paso es general. */
  targets: readonly string[];
};

// UI-06 / SIMP-03: recorrido de seis pasos sobre la aplicación de gastos. Los
// objetivos son los elementos reales del shell y de Resumen (`data-tour` o
// selectores estables); un paso sin objetivo visible se muestra sin foco.
export const tutorialSteps: readonly TutorialStep[] = [
  {
    id: "bienvenida",
    title: "Bienvenido a Finanzas personales",
    text: "Un recorrido corto por el resumen. Solo orienta: no registra ni cambia nada.",
    targets: [],
  },
  {
    id: "moneda-app",
    title: "Moneda de toda la app",
    text: "Elegí en qué moneda ver los totales de toda la aplicación. Solo cambia cómo se muestran los números: tu dinero no se convierte.",
    targets: ['.finance-topbar [data-tour="moneda-app"]'],
  },
  {
    id: "gastos-mes",
    title: "Gastos del mes",
    text: "Acá ves cuánto gastaste en el mes y cómo se compara con el anterior. Con las flechas cambiás de mes.",
    targets: ['[data-tour="gastos-mes"]'],
  },
  {
    id: "nueva-transaccion",
    title: "Registrar un gasto",
    text: "Desde acá cargás un gasto: importe, moneda, fecha, categoría y, si querés, en cuotas.",
    targets: [
      '.finance-topbar [data-tour="registrar"]',
      '.finance-dock [data-tour="registrar"]',
    ],
  },
  {
    id: "menu",
    title: "Menú de secciones",
    text: "Historial, Estadísticas, Presupuestos, Recurrentes y más. En el móvil se abre con el botón de menú.",
    targets: [".finance-sidebar", ".finance-dock"],
  },
  {
    id: "ayuda",
    title: "Ayuda cuando la necesites",
    text: "En Ayuda tenés las preguntas frecuentes con más detalle y podés repetir este recorrido.",
    targets: [
      '.finance-topbar a[aria-label="Ayuda"]',
      '.finance-sidebar a[href^="/ayuda"]',
    ],
  },
];

export function parseTutorialStatus(raw: string | null): TutorialStatus | null {
  return raw === "completed" || raw === "hidden" ? raw : null;
}

/** Muestra el tutorial si se pidió expresamente o si no hay preferencia ni omisión en esta sesión. */
export function shouldShowTutorial(input: {
  stored: string | null;
  skippedThisSession: boolean;
  replay: boolean;
}): boolean {
  if (input.replay) return true;
  return (
    parseTutorialStatus(input.stored) === null && !input.skippedThisSession
  );
}
