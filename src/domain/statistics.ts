import {
  bankCurrencies,
  formatBankAmount,
  isBankReferenceDate,
} from "./bank-balances.ts";
import { normalizeDecimalAmount, type Currency } from "./money.ts";
import {
  movementDisplayMethods,
  movementUuid,
  type MovementDisplayMethod,
} from "./movements.ts";

export const statisticsPeriods = {
  "mes-actual": "Mes actual",
  "mes-anterior": "Mes anterior",
  "ultimos-3-meses": "Últimos 3 meses",
  "ultimos-6-meses": "Últimos 6 meses",
  "ultimos-12-meses": "Últimos 12 meses",
  "anio-actual": "Año actual",
} as const;

export type StatisticsPeriod = keyof typeof statisticsPeriods;
export type StatisticsView = "favoritos" | "todas";
export type StatisticsFilters = {
  period: StatisticsPeriod | "personalizado";
  from?: string;
  to?: string;
  currency?: Currency;
  category?: string;
  method?: MovementDisplayMethod;
  view?: StatisticsView;
};

export const statisticsChartIds = {
  metrics: "Indicadores del período",
  "income-expense": "Ingresos y gastos por mes",
  "expense-categories": "Gastos por categoría",
  "income-categories": "Ingresos por categoría",
  methods: "Medios de pago",
  history: "Histórico por fecha",
  summary: "Resumen inteligente",
} as const;

export type StatisticsChartId = keyof typeof statisticsChartIds;
export const statisticsChartIdList = Object.keys(
  statisticsChartIds,
) as StatisticsChartId[];

export type StatisticsRange = {
  from: string;
  to: string;
  label: string;
  complete: boolean;
};

export type StatisticsCategoryTotal = {
  categoryId: string | null;
  parentId: string | null;
  category: string;
  kind: "income" | "expense";
  currency: Currency;
  amount: string;
  count: number;
};

export type StatisticsMethodTotal = {
  method: MovementDisplayMethod;
  kind: "income" | "expense";
  currency: Currency;
  amount: string;
  count: number;
};

export type StatisticsMonthTotal = {
  period: string;
  label: string;
  currency: Currency;
  income: string;
  expense: string;
  refunds: string;
  complete: boolean;
  missing?: boolean;
};

export type StatisticsTotal = {
  currency: Currency;
  income: string;
  expense: string;
  refunds: string;
  movements: number;
};

export type StatisticsSnapshot = {
  range: StatisticsRange;
  previous: StatisticsRange | null;
  historyRange: StatisticsRange;
  totals: StatisticsTotal[];
  previousTotals: StatisticsTotal[];
  categories: StatisticsCategoryTotal[];
  methods: StatisticsMethodTotal[];
  months: StatisticsMonthTotal[];
  movementCount: number;
};

export type Comparison = {
  status: "ok" | "no-data" | "zero-base" | "insufficient";
  delta: string | null;
  percent: string | null;
  label: string;
};

export type StatisticsSummary = {
  status: "ready" | "insufficient";
  paragraphs: string[];
};

const filterKeys = [
  "period",
  "from",
  "to",
  "currency",
  "category",
  "method",
  "view",
] as const;
const minimumSample = 5;
const scale = BigInt(10000);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function shiftMonth(period: string, delta: number) {
  const [year, month] = period.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

function lastDay(period: string) {
  const [year, month] = period.split("-").map(Number);
  return pad(new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function addDays(date: string, delta: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) -
        Date.parse(`${from}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}

const dateFormat = new Intl.DateTimeFormat("es-UY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("es-UY", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function statisticsMonthLabel(period: string) {
  const label = monthFormat.format(new Date(`${period}-01T00:00:00.000Z`));
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
}

export function statisticsRangeLabel(from: string, to: string) {
  return `${dateFormat.format(new Date(`${from}T00:00:00.000Z`))} – ${dateFormat.format(new Date(`${to}T00:00:00.000Z`))}`;
}

export function statisticsPeriodRange(
  period: StatisticsPeriod,
  today: string,
): { from: string; to: string } {
  const currentMonth = today.slice(0, 7);
  switch (period) {
    case "mes-anterior": {
      const previous = shiftMonth(currentMonth, -1);
      return { from: `${previous}-01`, to: `${previous}-${lastDay(previous)}` };
    }
    case "ultimos-3-meses":
    case "ultimos-6-meses":
    case "ultimos-12-meses": {
      const months =
        period === "ultimos-3-meses"
          ? 3
          : period === "ultimos-6-meses"
            ? 6
            : 12;
      const start = shiftMonth(currentMonth, -(months - 1));
      return { from: `${start}-01`, to: today };
    }
    case "anio-actual":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: `${currentMonth}-01`, to: today };
  }
}

export function statisticsComparisonRange(from: string, to: string) {
  const period = from.slice(0, 7);
  if (from === `${period}-01` && to === `${period}-${lastDay(period)}`) {
    const previous = shiftMonth(period, -1);
    return { from: `${previous}-01`, to: `${previous}-${lastDay(previous)}` };
  }
  const length = daysBetween(from, to);
  const previousTo = addDays(from, -1);
  return { from: addDays(previousTo, -(length - 1)), to: previousTo };
}

export function statisticsHistoryRange(
  selected: StatisticsRange,
  today: string,
): StatisticsRange {
  const start = `${shiftMonth(selected.to.slice(0, 7), -11)}-01`;
  const from = start < selected.from ? start : selected.from;
  return range(from, selected.to, today);
}

function range(from: string, to: string, today: string): StatisticsRange {
  return {
    from,
    to,
    label: statisticsRangeLabel(from, to),
    complete: to < today,
  };
}

export function parseStatisticsParams(
  input: Record<string, string | string[] | undefined>,
  today: string,
):
  | {
      filters: StatisticsFilters;
      range: StatisticsRange;
      previous: StatisticsRange;
    }
  | { error: string } {
  const invalid = {
    error:
      "Revisá los filtros. Usá fechas válidas en orden y monedas, categorías o medios conocidos.",
  } as const;
  if (Object.values(input).some(Array.isArray)) return invalid;

  const values: Record<string, string> = {};
  for (const key of filterKeys) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return invalid;
    const trimmed = value.trim();
    if (trimmed) values[key] = trimmed;
  }

  let from: string;
  let to: string;
  let period: StatisticsFilters["period"];
  if (values.from || values.to) {
    if (
      !values.from ||
      !values.to ||
      !isBankReferenceDate(values.from, today) ||
      !isBankReferenceDate(values.to, today) ||
      values.from > values.to
    )
      return invalid;
    from = values.from;
    to = values.to;
    period = "personalizado";
  } else {
    period = (values.period ?? "mes-actual") as StatisticsFilters["period"];
    if (period === "personalizado" || !Object.hasOwn(statisticsPeriods, period))
      return invalid;
    const preset = statisticsPeriodRange(period, today);
    from = preset.from;
    to = preset.to;
  }

  if (
    values.currency &&
    !bankCurrencies.some((currency) => currency === values.currency)
  )
    return invalid;
  if (
    values.category &&
    values.category !== "none" &&
    !movementUuid.test(values.category)
  )
    return invalid;
  if (values.method && !Object.hasOwn(movementDisplayMethods, values.method))
    return invalid;
  if (values.view && values.view !== "favoritos" && values.view !== "todas")
    return invalid;

  const previousRange = statisticsComparisonRange(from, to);
  const filters: StatisticsFilters = {
    period,
    ...(period === "personalizado" ? { from, to } : {}),
    ...(values.currency ? { currency: values.currency as Currency } : {}),
    ...(values.category ? { category: values.category } : {}),
    ...(values.method
      ? { method: values.method as MovementDisplayMethod }
      : {}),
    ...(values.view ? { view: values.view as StatisticsView } : {}),
  };
  return {
    filters,
    range: range(from, to, today),
    previous: range(previousRange.from, previousRange.to, today),
  };
}

export function statisticsSearch(
  filters: StatisticsFilters,
  changes: Partial<Record<keyof StatisticsFilters, string | undefined>> = {},
) {
  const merged = { ...filters, ...changes } as Record<
    string,
    string | undefined
  >;
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function amountUnits(amount: string) {
  return BigInt(normalizeDecimalAmount(amount).replace(".", ""));
}

export function unitsDecimal(units: bigint) {
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / scale}.${(absolute % scale).toString().padStart(4, "0")}`;
}

export function sumAmounts(amounts: string[]) {
  return unitsDecimal(
    amounts.reduce((total, amount) => total + amountUnits(amount), BigInt(0)),
  );
}

export function formatStatisticsAmount(amount: string, currency: Currency) {
  return formatBankAmount({ amount, currency });
}

function formatPercentage(tenths: bigint) {
  const negative = tenths < BigInt(0);
  const absolute = negative ? -tenths : tenths;
  return `${negative ? "−" : ""}${absolute / BigInt(10)},${absolute % BigInt(10)} %`;
}

function divideRounded(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;
}

export function percentageChange(current: string, previous: string) {
  const base = amountUnits(previous);
  if (base === BigInt(0)) return null;
  const tenths = divideRounded(
    (amountUnits(current) - base) * BigInt(1000),
    base,
  );
  return `${tenths > BigInt(0) ? "+" : ""}${formatPercentage(tenths)}`;
}

export function comparison(
  current: string | null,
  previous: string | null,
  sample: number,
  previousLabel = "el período anterior",
): Comparison {
  if (current === null || previous === null)
    return {
      status: "no-data",
      delta: null,
      percent: null,
      label: "Sin datos comparables en el período anterior.",
    };
  const currentUnits = amountUnits(current);
  const previousUnits = amountUnits(previous);
  if (previousUnits === BigInt(0))
    return {
      status: "zero-base",
      delta: unitsDecimal(currentUnits),
      percent: null,
      label:
        "Sin base de comparación: el período anterior no registró importes.",
    };
  if (sample < minimumSample)
    return {
      status: "insufficient",
      delta: unitsDecimal(currentUnits - previousUnits),
      percent: null,
      label: "Muestra insuficiente para afirmar una variación.",
    };
  const delta = currentUnits - previousUnits;
  const percent = percentageChange(current, previous);
  return {
    status: "ok",
    delta: unitsDecimal(delta),
    percent,
    label:
      delta === BigInt(0)
        ? `Sin variación respecto de ${previousLabel}.`
        : `Variación de ${percent ?? "0,0 %"} respecto de ${previousLabel}.`,
  };
}

export function chartScale(amounts: string[]) {
  const units = amounts.map(amountUnits);
  const maximum = units.reduce(
    (max, value) => (value > max ? value : max),
    BigInt(0),
  );
  if (maximum === BigInt(0)) return amounts.map(() => 0);
  return units.map((value) => Number((value * BigInt(1000)) / maximum) / 10);
}

export function categoryChildren(
  categories: StatisticsCategoryTotal[],
  parentId: string,
  kind: "income" | "expense",
  currency: Currency,
) {
  return categories.filter(
    (category) =>
      category.parentId === parentId &&
      category.kind === kind &&
      category.currency === currency,
  );
}

export function statisticsSummary(input: {
  range: StatisticsRange;
  previous: StatisticsRange | null;
  totals: StatisticsTotal[];
  previousTotals: StatisticsTotal[];
  movementCount: number;
}): StatisticsSummary {
  if (input.movementCount < minimumSample)
    return {
      status: "insufficient",
      paragraphs: [
        `Muestra insuficiente: hay ${input.movementCount} ${input.movementCount === 1 ? "movimiento registrado" : "movimientos registrados"} en ${input.range.label}.`,
        "No se afirman tendencias, comercios ni gastos no registrados. Registrá más movimientos para obtener un resumen más útil.",
      ],
    };

  const paragraphs: string[] = [];
  for (const total of input.totals) {
    const previous = input.previousTotals.find(
      (row) => row.currency === total.currency,
    );
    paragraphs.push(
      `En ${input.range.label} registraste ${formatStatisticsAmount(total.income, total.currency)} de ingresos y ${formatStatisticsAmount(total.expense, total.currency)} de gastos.`,
    );
    if (amountUnits(total.income) > BigInt(0)) {
      const ratio = divideRounded(
        amountUnits(total.expense) * BigInt(1000),
        amountUnits(total.income),
      );
      paragraphs.push(
        `Los gastos representan ${formatPercentage(ratio)} de los ingresos registrados${ratio > BigInt(1000) ? " y superan los ingresos" : ""}.`,
      );
    } else {
      paragraphs.push(
        "Sin ingresos registrados para calcular la relación gastos/ingresos.",
      );
    }
    if (input.previous && previous) {
      const change = comparison(
        total.expense,
        previous.expense,
        total.movements,
        input.previous.label,
      );
      paragraphs.push(`Gastos: ${change.label}`);
    }
    if (amountUnits(total.refunds) > BigInt(0)) {
      paragraphs.push(
        `Devoluciones registradas: ${formatStatisticsAmount(total.refunds, total.currency)}. Se informan por separado y no reducen compras de otros períodos.`,
      );
    }
  }
  paragraphs.push(
    "El resumen usa solo movimientos registrados en la app; no incluye información bancaria no cargada.",
  );
  return { status: "ready", paragraphs };
}

export function favoriteLabel(chart: StatisticsChartId, favorite: boolean) {
  return favorite
    ? `Quitar ${statisticsChartIds[chart]} de favoritos`
    : `Añadir ${statisticsChartIds[chart]} a favoritos`;
}
