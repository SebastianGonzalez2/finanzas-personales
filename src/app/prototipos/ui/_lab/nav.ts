import type { LabIconName } from "./icons";

// Mismos destinos que `FinanceShell`; la agrupación es una propuesta visual,
// no cambia rutas ni permisos.
export type LabView = "resumen" | "movimientos";

export type LabNavItem = {
  key: string;
  label: string;
  icon: LabIconName;
  view?: LabView;
  badge?: string;
  hue: string;
};

export const navGroups: { title: string; items: LabNavItem[] }[] = [
  {
    title: "General",
    items: [
      {
        key: "resumen",
        label: "Resumen",
        icon: "summary",
        view: "resumen",
        hue: "#6f9bff",
      },
      {
        key: "historial",
        label: "Historial",
        icon: "history",
        view: "movimientos",
        badge: "16",
        hue: "#8f86f2",
      },
      {
        key: "estadisticas",
        label: "Estadísticas",
        icon: "stats",
        hue: "#41c3a7",
      },
      { key: "informes", label: "Informes", icon: "reports", hue: "#7fa6c9" },
    ],
  },
  {
    title: "Planificación",
    items: [
      {
        key: "presupuestos",
        label: "Presupuestos",
        icon: "budgets",
        badge: "1",
        hue: "#e0a33a",
      },
      {
        key: "recurrentes",
        label: "Recurrentes",
        icon: "recurring",
        hue: "#5fb6e8",
      },
      {
        key: "fondos",
        label: "Fondos de ahorro",
        icon: "funds",
        hue: "#45c08d",
      },
    ],
  },
  {
    title: "Crédito",
    items: [
      { key: "tarjetas", label: "Tarjetas", icon: "cards", hue: "#a587ff" },
      {
        key: "deudas",
        label: "Deudas y préstamos",
        icon: "debts",
        hue: "#e07fa8",
      },
      {
        key: "beneficios",
        label: "Beneficios bancarios",
        icon: "benefits",
        hue: "#e8b45a",
      },
    ],
  },
  {
    title: "Catálogos",
    items: [
      {
        key: "categorias",
        label: "Categorías",
        icon: "categories",
        hue: "#7c95b8",
      },
      {
        key: "catalogo",
        label: "Comercios y contactos",
        icon: "merchants",
        hue: "#7c95b8",
      },
    ],
  },
];

export const footerItems: LabNavItem[] = [
  {
    key: "avisos",
    label: "Avisos",
    icon: "notices",
    badge: "3",
    hue: "#f08a6c",
  },
  { key: "ayuda", label: "Ayuda", icon: "help", hue: "#94a3b8" },
  { key: "account", label: "Mi cuenta", icon: "account", hue: "#94a3b8" },
];

export function navHref(variant: string, item: LabNavItem) {
  return item.view ? `/prototipos/ui/${variant}?vista=${item.view}` : undefined;
}
