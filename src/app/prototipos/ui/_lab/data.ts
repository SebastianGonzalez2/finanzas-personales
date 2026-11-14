// UI-01 — Datos ficticios para la exploración visual. Ningún valor proviene de
// la base de datos ni de cuentas reales; solo representan las funciones que el
// producto ya ofrece (saldos, movimientos, tarjetas, fondos, presupuestos,
// recurrentes, cuotas, avisos y estadísticas).
import { formatBankAmount } from "@/domain/bank-balances";
import type { HistoryKind, historyStates } from "@/domain/history";
import type { MovementDisplayMethod } from "@/domain/movements";

export type LabCurrency = "UYU" | "USD" | "EUR";

export const labToday = "2026-11-14";
export const labPeriodLabel = "Noviembre 2026";

export function money(amount: string, currency: LabCurrency) {
  return formatBankAmount({ amount, currency });
}

/** Separa «184.320,55 UYU» en partes para tipografía jerárquica. */
export function moneyParts(amount: string, currency: LabCurrency) {
  const formatted = money(amount, currency);
  const [number] = formatted.split(" ");
  const [whole, cents] = number.split(",");
  return { whole, cents, currency };
}

export function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

export const balances = [
  { currency: "UYU", amount: "184320.55", confirmedOn: "2026-11-10" },
  { currency: "USD", amount: "3215.40", confirmedOn: "2026-11-10" },
  { currency: "EUR", amount: "640.00", confirmedOn: "2026-10-28" },
] as const satisfies readonly {
  currency: LabCurrency;
  amount: string;
  confirmedOn: string;
}[];

export const monthTotals = {
  income: {
    label: "Ingresos del mes",
    rows: [
      { currency: "UYU", amount: "142500.00" },
      { currency: "USD", amount: "1200.00" },
    ],
    previousUYU: "138900.00",
  },
  expense: {
    label: "Gastos del mes",
    rows: [
      { currency: "UYU", amount: "86742.30" },
      { currency: "USD", amount: "14.90" },
    ],
    previousUYU: "91210.00",
  },
  refunds: [{ currency: "UYU", amount: "1290.00" }],
} as const;

/** Variación porcentual con un decimal, en formato local. */
export function variation(current: string, previous: string) {
  const value = ((Number(current) - Number(previous)) / Number(previous)) * 100;
  const label = `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)
    .toFixed(1)
    .replace(".", ",")} %`;
  return { value, label };
}

// Flujo mensual en UYU (estadísticas). Noviembre está en curso.
export const cashflow = [
  { period: "2026-06", label: "Jun", income: 136000, expense: 98400 },
  { period: "2026-07", label: "Jul", income: 136000, expense: 104900 },
  { period: "2026-08", label: "Ago", income: 138900, expense: 92300 },
  { period: "2026-09", label: "Set", income: 138900, expense: 88100 },
  { period: "2026-10", label: "Oct", income: 138900, expense: 91210 },
  {
    period: "2026-11",
    label: "Nov",
    income: 142500,
    expense: 86742.3,
    inProgress: true,
  },
] as const;

export type CashflowPoint = {
  period: string;
  label: string;
  income: number;
  expense: number;
  inProgress?: boolean;
};

// Paleta categórica validada (modo oscuro, superficie #0e1524): orden fijo,
// nunca reciclado. «Otros» es neutro a propósito y siempre lleva etiqueta.
export const categoryColors = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#9085e9",
  "#d55181",
] as const;
export const otherColor = "#5d6b82";

export const categorySpending = [
  { name: "Vivienda", amount: 32000 },
  { name: "Supermercado", amount: 18420.3 },
  { name: "Servicios", amount: 7152 },
  { name: "Restaurantes", amount: 6980 },
  { name: "Ocio", amount: 4720 },
  { name: "Otros", amount: 17470, other: true },
].map((category, index) => ({
  ...category,
  color: category.other ? otherColor : categoryColors[index],
}));

export const categoryTotal = categorySpending.reduce(
  (total, category) => total + category.amount,
  0,
);

export function formatUYU(value: number) {
  return money(value.toFixed(2), "UYU");
}

export function compactUYU(value: number) {
  return value >= 1000
    ? `${(value / 1000)
        .toFixed(value >= 100000 ? 0 : 1)
        .replace(/\.0$/, "")
        .replace(".", ",")} k`
    : value.toFixed(0);
}

export const budgets = [
  { name: "Supermercado", spent: 18420.3, limit: 22000 },
  { name: "Restaurantes", spent: 6980, limit: 6000 },
  { name: "Ocio", spent: 4720, limit: 5000 },
  { name: "Transporte", spent: 3150, limit: 5000 },
  { name: "Salud", spent: 2300, limit: 4000 },
];

export function budgetState(spent: number, limit: number) {
  const ratio = spent / limit;
  if (ratio > 1) return { ratio, tone: "critical", label: "Excedido" } as const;
  if (ratio >= 0.85) return { ratio, tone: "warning", label: "Cerca" } as const;
  return { ratio, tone: "good", label: "En rango" } as const;
}

export const creditCards = [
  {
    name: "Visa Platinum",
    last4: "4821",
    closesOn: "2026-11-22",
    dueOn: "2026-12-05",
    cycleStart: "2026-10-23",
    debts: [
      { currency: "UYU", amount: "23410.00" },
      { currency: "USD", amount: "86.50" },
    ],
    tone: "indigo",
  },
  {
    name: "Mastercard Black",
    last4: "1907",
    closesOn: "2026-11-28",
    dueOn: "2026-12-10",
    cycleStart: "2026-10-29",
    debts: [{ currency: "UYU", amount: "9875.40" }],
    tone: "teal",
  },
] as const;

export const installments = [
  {
    concept: "Heladera",
    current: 5,
    total: 12,
    amount: "3250.00",
    currency: "UYU",
  },
  {
    concept: "Notebook",
    current: 9,
    total: 10,
    amount: "120.00",
    currency: "USD",
  },
] as const;

// Fondos virtuales: separan dinero dentro del saldo; no generan efectos bancarios.
export const funds = [
  {
    name: "Fondo de emergencia",
    saved: "60000.00",
    target: "120000.00",
    currency: "UYU",
  },
  { name: "Viaje 2027", saved: "1150.00", target: "3000.00", currency: "USD" },
  {
    name: "Cambio de auto",
    saved: "85000.00",
    target: "300000.00",
    currency: "UYU",
  },
] as const;

export const upcomingRecurring = [
  {
    concept: "Internet fibra",
    dueOn: "2026-11-18",
    amount: "1890.00",
    currency: "UYU",
    method: "Débito bancario",
  },
  {
    concept: "UTE",
    dueOn: "2026-11-20",
    amount: "2640.00",
    currency: "UYU",
    method: "Débito bancario",
  },
  {
    concept: "Gimnasio",
    dueOn: "2026-11-25",
    amount: "1600.00",
    currency: "UYU",
    method: "Tarjeta de crédito",
  },
  {
    concept: "Música en streaming",
    dueOn: "2026-11-27",
    amount: "11.99",
    currency: "USD",
    method: "Tarjeta de crédito",
  },
] as const;

export const loans = {
  owedToYou: { amount: "8000.00", currency: "UYU", contact: "Martín" },
} as const;

export const notices = [
  {
    tone: "critical",
    title: "Restaurantes superó su presupuesto",
    detail: "116 % del límite mensual",
  },
  {
    tone: "warning",
    title: "Vence Visa ···· 4821",
    detail: "Pago hasta el 05/12",
  },
  {
    tone: "info",
    title: "UTE se debita el 20/11",
    detail: "Recurrente · 2.640,00 UYU",
  },
] as const;

export type LabMovement = {
  id: string;
  effectiveOn: string;
  concept: string;
  counterpart: string | null;
  kind: HistoryKind;
  status: keyof typeof historyStates;
  category: string | null;
  method: MovementDisplayMethod | null;
  currency: LabCurrency;
  /** Con signo: negativo reduce el saldo bancario o aumenta deuda. */
  amount: string;
  other?: { currency: LabCurrency; amount: string };
};

export const movements: LabMovement[] = [
  {
    id: "m01",
    effectiveOn: "2026-11-14",
    concept: "Compra semanal",
    counterpart: "Mercado Central",
    kind: "card_purchase",
    status: "confirmed",
    category: "Supermercado",
    method: "credit",
    currency: "UYU",
    amount: "-2384.50",
  },
  {
    id: "m02",
    effectiveOn: "2026-11-13",
    concept: "Cena con amigos",
    counterpart: "Bistró Lumen",
    kind: "expense",
    status: "confirmed",
    category: "Restaurantes",
    method: "mixed",
    currency: "UYU",
    amount: "-1960.00",
  },
  {
    id: "m03",
    effectiveOn: "2026-11-12",
    concept: "Devolución auriculares",
    counterpart: "TecnoPlaza",
    kind: "purchase_refund",
    status: "confirmed",
    category: "Ocio",
    method: "credit",
    currency: "UYU",
    amount: "1290.00",
  },
  {
    id: "m04",
    effectiveOn: "2026-11-12",
    concept: "Compra de dólares",
    counterpart: null,
    kind: "bank_transfer",
    status: "confirmed",
    category: null,
    method: "transfer",
    currency: "USD",
    amount: "200.00",
    other: { currency: "UYU", amount: "-8020.00" },
  },
  {
    id: "m05",
    effectiveOn: "2026-11-11",
    concept: "UTE",
    counterpart: "UTE",
    kind: "expense",
    status: "pending",
    category: "Servicios",
    method: "debit",
    currency: "UYU",
    amount: "-2640.00",
  },
  {
    id: "m06",
    effectiveOn: "2026-11-10",
    concept: "Saldo confirmado",
    counterpart: null,
    kind: "checkpoint",
    status: "confirmed",
    category: null,
    method: null,
    currency: "UYU",
    amount: "184320.55",
  },
  {
    id: "m07",
    effectiveOn: "2026-11-10",
    concept: "Pago Visa ···· 4821",
    counterpart: null,
    kind: "card_payment",
    status: "confirmed",
    category: null,
    method: "transfer",
    currency: "UYU",
    amount: "-21880.00",
  },
  {
    id: "m08",
    effectiveOn: "2026-11-08",
    concept: "Préstamo a Martín",
    counterpart: "Martín",
    kind: "loan_operation",
    status: "confirmed",
    category: null,
    method: "transfer",
    currency: "UYU",
    amount: "-8000.00",
  },
  {
    id: "m09",
    effectiveOn: "2026-11-07",
    concept: "Farmacia",
    counterpart: "Farmacia del Parque",
    kind: "expense",
    status: "corrected",
    category: "Salud",
    method: "debit",
    currency: "UYU",
    amount: "-1150.00",
  },
  {
    id: "m10",
    effectiveOn: "2026-11-06",
    concept: "Reintegro 20 % en farmacias",
    counterpart: null,
    kind: "bank_benefit",
    status: "confirmed",
    category: "Salud",
    method: "deposit",
    currency: "UYU",
    amount: "230.00",
  },
  {
    id: "m11",
    effectiveOn: "2026-11-05",
    concept: "Viaje al centro",
    counterpart: "App de transporte",
    kind: "card_purchase",
    status: "confirmed",
    category: "Transporte",
    method: "credit",
    currency: "USD",
    amount: "-14.90",
  },
  {
    id: "m12",
    effectiveOn: "2026-11-05",
    concept: "Sueldo noviembre",
    counterpart: "Empleador",
    kind: "income",
    status: "confirmed",
    category: "Sueldo",
    method: "deposit",
    currency: "UYU",
    amount: "142500.00",
  },
  {
    id: "m13",
    effectiveOn: "2026-11-04",
    concept: "Cine",
    counterpart: "Lucía",
    kind: "expense",
    status: "confirmed",
    category: "Ocio",
    method: "third_party",
    currency: "UYU",
    amount: "-780.00",
  },
  {
    id: "m14",
    effectiveOn: "2026-11-03",
    concept: "Proyecto de diseño",
    counterpart: "Cliente freelance",
    kind: "income",
    status: "confirmed",
    category: "Trabajo independiente",
    method: "deposit",
    currency: "USD",
    amount: "1200.00",
  },
  {
    id: "m15",
    effectiveOn: "2026-11-02",
    concept: "Alquiler",
    counterpart: "Inmobiliaria Norte",
    kind: "expense",
    status: "confirmed",
    category: "Vivienda",
    method: "transfer",
    currency: "UYU",
    amount: "-32000.00",
  },
  {
    id: "m16",
    effectiveOn: "2026-11-01",
    concept: "Suscripción duplicada",
    counterpart: "Plataforma de video",
    kind: "card_purchase",
    status: "voided",
    category: "Ocio",
    method: "credit",
    currency: "USD",
    amount: "-10.99",
  },
];

export const savedFilters = [
  {
    id: "tarjetas",
    label: "Compras con tarjeta",
    criteria: { kind: "card_purchase" },
  },
  {
    id: "pendientes",
    label: "Pendientes de confirmar",
    criteria: { status: "pending" },
  },
  { id: "dolares", label: "Movimientos en USD", criteria: { currency: "USD" } },
] as const;
