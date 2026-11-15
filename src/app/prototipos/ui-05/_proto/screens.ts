import type { Destination } from "@/components/finance-navigation";

// UI-05-DESIGN — Registro de prototipos. Cada pantalla corresponde a una ruta
// real (columna `route`) y declara los estados representativos que se pueden
// recorrer con `?estado=`. Solo datos ficticios.

export type ProtoState =
  | "normal"
  | "vacio"
  | "error"
  | "formulario"
  | "confirmar"
  | "pago"
  | "operacion"
  | "todas"
  | "detalle"
  | "sin-favoritos"
  | "periodo"
  | "unificar"
  | "busqueda"
  | "restaurar"
  | "eliminar";

export const stateLabel: Record<ProtoState, string> = {
  normal: "Con datos",
  vacio: "Vacío",
  error: "Error de carga",
  formulario: "Formulario",
  confirmar: "Confirmación",
  pago: "Registrar pago",
  operacion: "Operación",
  todas: "Todas",
  detalle: "Detalle",
  "sin-favoritos": "Sin favoritos",
  periodo: "Período",
  unificar: "Unificar",
  busqueda: "Búsqueda",
  restaurar: "Restaurar copia",
  eliminar: "Eliminar cuenta",
};

export type Ticket = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type ProtoScreen = {
  key: string;
  title: string;
  route: string;
  destination: Destination;
  ticket: Ticket;
  states: ProtoState[];
  summary: string;
};

export const tickets: Record<Ticket, string> = {
  A: "UI-05A · Kit de pantalla y Tarjetas",
  B: "UI-05B · Resumen de ciclo de tarjeta",
  C: "UI-05C · Fondos y Presupuestos",
  D: "UI-05D · Estadísticas e Informes",
  E: "UI-05E · Recurrentes",
  F: "UI-05F · Deudas y Beneficios",
  G: "UI-05G · Catálogos",
  H: "UI-05H · Avisos, Ayuda y Mi cuenta",
};

export const protoScreens: ProtoScreen[] = [
  {
    key: "tarjetas",
    title: "Tarjetas",
    route: "/tarjetas",
    destination: "tarjetas",
    ticket: "A",
    states: ["normal", "formulario", "vacio", "error"],
    summary:
      "Tarjetas dibujadas con deuda por moneda y ciclo, avisos de vencimiento, alta/edición y avisos push.",
  },
  {
    key: "tarjeta-ciclo",
    title: "Resumen de tarjeta",
    route: "/tarjetas/[cardId]/resumen",
    destination: "tarjetas",
    ticket: "B",
    states: ["normal", "pago"],
    summary:
      "Ciclo con cierre y vencimiento, cifras del resumen, revisión de compras, pago y calendario.",
  },
  {
    key: "fondos",
    title: "Fondos de ahorro",
    route: "/fondos",
    destination: "fondos",
    ticket: "C",
    states: ["normal", "operacion", "formulario", "vacio", "error"],
    summary:
      "Reservado y disponible por moneda, anillos de meta, operaciones Reservar/Liberar/Traspasar y aportaciones.",
  },
  {
    key: "presupuestos",
    title: "Presupuestos",
    route: "/presupuestos",
    destination: "presupuestos",
    ticket: "C",
    states: ["normal", "formulario", "vacio", "error"],
    summary:
      "Mes con stepper, barras por categoría con estado, límite solo un mes y cotización manual.",
  },
  {
    key: "estadisticas",
    title: "Estadísticas",
    route: "/estadisticas",
    destination: "estadisticas",
    ticket: "D",
    states: ["normal", "todas", "detalle", "sin-favoritos", "error"],
    summary:
      "Mis favoritos / Todas, filtros, gráficos con paleta de datos, profundización y tablas equivalentes.",
  },
  {
    key: "informes",
    title: "Informes",
    route: "/informes",
    destination: "informes",
    ticket: "D",
    states: ["normal", "error"],
    summary:
      "Exportación del período en CSV, Excel o PDF y contenido incluido.",
  },
  {
    key: "recurrentes",
    title: "Recurrentes",
    route: "/recurrentes",
    destination: "recurrentes",
    ticket: "E",
    states: ["normal", "periodo", "formulario", "vacio", "error"],
    summary:
      "Series activas/pausadas, seguimiento por período, registrar pago/cobro y nueva recurrencia.",
  },
  {
    key: "deudas",
    title: "Deudas y préstamos",
    route: "/deudas",
    destination: "deudas",
    ticket: "F",
    states: ["normal", "formulario", "vacio", "error"],
    summary:
      "Lo que debés y lo que te deben por moneda, estados y alta de obligación.",
  },
  {
    key: "deuda-detalle",
    title: "Detalle de obligación",
    route: "/deudas/[id]",
    destination: "deudas",
    ticket: "F",
    states: ["normal", "operacion"],
    summary: "Pendiente, cuota y vencimiento, historial y registrar operación.",
  },
  {
    key: "beneficios",
    title: "Beneficios bancarios",
    route: "/beneficios",
    destination: "beneficios",
    ticket: "F",
    states: ["normal", "confirmar", "vacio", "error"],
    summary:
      "Registro de cashback y bonificaciones con confirmación y lista de beneficios.",
  },
  {
    key: "categorias",
    title: "Categorías",
    route: "/categorias",
    destination: "categorias",
    ticket: "G",
    states: ["normal", "formulario", "error"],
    summary:
      "Gastos e ingresos con subcategorías, crear, archivar y restaurar.",
  },
  {
    key: "comercios",
    title: "Comercios y contactos",
    route: "/catalogo",
    destination: "catalogo",
    ticket: "G",
    states: ["normal", "unificar", "vacio", "error"],
    summary:
      "Catálogo privado, unificación de duplicados y gastos por comercio del mes.",
  },
  {
    key: "etiquetas",
    title: "Etiquetas",
    route: "/etiquetas",
    destination: "historial",
    ticket: "G",
    states: ["normal", "vacio"],
    summary: "Etiquetas activas y archivadas, crear y renombrar.",
  },
  {
    key: "avisos",
    title: "Avisos",
    route: "/avisos",
    destination: "avisos",
    ticket: "H",
    states: ["normal", "vacio", "error"],
    summary:
      "Avisos por módulo con icono y tono, acciones directas y avisos resueltos.",
  },
  {
    key: "ayuda",
    title: "Ayuda",
    route: "/ayuda",
    destination: "ayuda",
    ticket: "H",
    states: ["normal", "busqueda"],
    summary: "Buscador, índice de secciones, preguntas frecuentes y tutorial.",
  },
  {
    key: "cuenta",
    title: "Mi cuenta",
    route: "/account",
    destination: "account",
    ticket: "H",
    states: ["normal", "restaurar", "eliminar"],
    summary:
      "Cuenta Google conectada, copias de seguridad y eliminación de cuenta.",
  },
];

export const protoBase = "/prototipos/ui-05";

export function protoHref(key: string, state: ProtoState = "normal") {
  return state === "normal"
    ? `${protoBase}/${key}`
    : `${protoBase}/${key}?estado=${state}`;
}

/** Destinos del menú → prototipo equivalente (Resumen e Historial: UI-01). */
export function destinationHref(destination: Destination) {
  if (destination === "resumen") return "/prototipos/ui/final";
  if (destination === "historial")
    return "/prototipos/ui/final?vista=movimientos";
  const screen = protoScreens.find((item) => item.destination === destination);
  return screen ? protoHref(screen.key) : protoBase;
}
