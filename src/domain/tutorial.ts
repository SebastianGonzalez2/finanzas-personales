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

const menuButton = 'button[aria-label="Abrir navegación"]';

export const tutorialSteps: readonly TutorialStep[] = [
  {
    id: "bienvenida",
    title: "Bienvenido a Finanzas personales",
    text: "Un recorrido de cinco pasos para ubicarte. Solo orienta: no registra movimientos ni completa formularios.",
    targets: [],
  },
  {
    id: "menu",
    title: "Menú de secciones",
    text: "Desde el menú llegás a Historial, Tarjetas, Fondos de ahorro, Presupuestos, Estadísticas y el resto de las secciones.",
    targets: [".finance-sidebar nav", menuButton],
  },
  {
    id: "indicadores",
    title: "Tus saldos y totales",
    text: "Acá ves tus saldos por banco y los totales del mes, con el disponible libre y lo reservado.",
    targets: ['section[aria-label="Indicadores financieros"]'],
  },
  {
    id: "nueva-transaccion",
    title: "Registrar un movimiento",
    text: "Con «Nueva transacción» cargás gastos, ingresos y transferencias. Esto es solo una guía: no se crea nada.",
    targets: ['button[aria-controls="nueva-transaccion"]'],
  },
  {
    id: "ayuda",
    title: "Ayuda cuando la necesites",
    text: "En Ayuda encontrás preguntas frecuentes con buscador y podés volver a ver este recorrido cuando quieras.",
    targets: ['.finance-sidebar a[href^="/ayuda"]', menuButton],
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
