import { formatBankReference } from "./bank-balances.ts";
import {
  historyKinds,
  historyPeriods,
  historySearch,
  historyStates,
  type HistoryFilters,
  type HistoryKind,
} from "./history.ts";
import {
  movementDisplayMethods,
  type MovementDisplayMethod,
} from "./movements.ts";

// UI-04: chips de filtros activos del Historial. Cada chip enlaza a la misma
// búsqueda sin ese criterio (vuelve a la primera página); los demás
// criterios se conservan tal cual.
export type HistoryChip = {
  key: string;
  title: string;
  value: string;
  href: string;
};

type Named = { id: string; name: string };

export function historyChips(
  filters: HistoryFilters,
  names: { categories: Named[]; tags: Named[]; merchants: Named[] },
): HistoryChip[] {
  const chips: HistoryChip[] = [];
  const without = (key: keyof HistoryFilters, value?: string) =>
    `/historial${historySearch({ ...filters, [key]: value })}`;
  const add = (
    key: keyof HistoryFilters,
    title: string,
    value: string | undefined,
  ) => {
    if (value) chips.push({ key, title, value, href: without(key) });
  };
  const named = (list: Named[], id: string | undefined, fallback: string) =>
    id ? (list.find((entry) => entry.id === id)?.name ?? fallback) : undefined;

  add(
    "kind",
    "Tipo",
    filters.kind && historyKinds[filters.kind as HistoryKind],
  );
  add("currency", "Moneda", filters.currency);
  add(
    "status",
    "Estado",
    filters.status &&
      historyStates[filters.status as keyof typeof historyStates],
  );
  add(
    "method",
    "Medio",
    filters.method &&
      movementDisplayMethods[filters.method as MovementDisplayMethod],
  );
  add(
    "category",
    "Categoría",
    filters.category === "none"
      ? "Sin categorizar"
      : named(names.categories, filters.category, "Categoría del enlace"),
  );
  add(
    "merchant",
    "Comercio",
    named(names.merchants, filters.merchant, "Comercio del enlace"),
  );
  const tagIds = filters.tags ? filters.tags.split(",") : [];
  for (const id of tagIds)
    chips.push({
      key: `tags-${id}`,
      title: "Etiqueta",
      value: named(names.tags, id, "Etiqueta del enlace") ?? "",
      href: without(
        "tags",
        tagIds.filter((other) => other !== id).join(",") || undefined,
      ),
    });
  add("min", "Importe mínimo", filters.min);
  add("max", "Importe máximo", filters.max);
  add("from", "Desde", filters.from && formatBankReference(filters.from));
  add("to", "Hasta", filters.to && formatBankReference(filters.to));
  add("q", "Texto", filters.q && `«${filters.q}»`);
  return chips;
}

export function historyPeriodLabel(filters: HistoryFilters) {
  if (filters.period && Object.hasOwn(historyPeriods, filters.period))
    return historyPeriods[filters.period as keyof typeof historyPeriods];
  const from = filters.from && formatBankReference(filters.from);
  const to = filters.to && formatBankReference(filters.to);
  if (from && to) return `Del ${from} al ${to}`;
  if (from) return `Desde el ${from}`;
  if (to) return `Hasta el ${to}`;
  return "Todas las fechas";
}
