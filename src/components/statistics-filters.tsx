import { DateInput } from "./ui/date-fields";
import Link from "next/link";
import { bankCurrencies } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import {
  statisticsPeriods,
  statisticsSearch,
  type StatisticsFilters,
} from "@/domain/statistics";
import { movementDisplayMethods } from "@/domain/movements";
import { buttonClass } from "./ui/button";
import { Field, Select } from "./ui/field";
import { Icon } from "./ui/icon";
import { TagFields } from "./classification-fields";
import type { MovementTag } from "@/domain/classification";

type StatisticsCategoryOption = {
  id: string;
  name: string;
  kind: "income" | "expense";
};

export function StatisticsCategorySelect({
  categories,
  category,
  expensesOnly = false,
}: {
  categories: StatisticsCategoryOption[];
  category?: string;
  expensesOnly?: boolean;
}) {
  return (
    <Field label={expensesOnly ? "Categoría de gasto" : "Categoría"}>
      <Select name="category" defaultValue={category}>
        <option value="">Todas</option>
        <option value="none">Sin categorizar</option>
        {categories
          .filter(({ kind }) => !expensesOnly || kind === "expense")
          .map(({ id, name, kind }) => (
            <option key={id} value={id}>
              {expensesOnly
                ? name
                : `${name} (${kind === "income" ? "ingreso" : "gasto"})`}
            </option>
          ))}
      </Select>
    </Field>
  );
}

export function StatisticsFiltersForm({
  filters,
  display,
  categories,
  cards,
  tags,
}: {
  filters: StatisticsFilters;
  display: Currency | "original";
  categories: StatisticsCategoryOption[];
  cards: { id: string; name: string }[];
  tags: MovementTag[];
}) {
  const custom = filters.period === "personalizado";
  const selectedTags =
    filters.tags?.split(",") ?? (filters.tag ? [filters.tag] : []);
  const availableTags = [
    ...tags,
    ...selectedTags
      .filter((id) => !tags.some((tag) => tag.id === id))
      .map((id) => ({
        id,
        name: "Etiqueta no disponible",
        archived: false,
        version: 1,
      })),
  ];
  const clear = (patch: Partial<Record<keyof StatisticsFilters, undefined>>) =>
    `/estadisticas${statisticsSearch(filters, { ...patch, detailPage: undefined })}`;
  const chips = [
    filters.currency && {
      key: "currency",
      text: `Moneda original: ${filters.currency}`,
      href: clear({ currency: undefined }),
    },
    filters.kind && {
      key: "kind",
      text: `Tipo: ${filters.kind === "income" ? "Ingresos" : "Gastos"}`,
      href: clear({ kind: undefined }),
    },
    filters.category && {
      key: "category",
      text: `Categoría: ${
        filters.category === "none"
          ? "Sin categorizar"
          : (categories.find(({ id }) => id === filters.category)?.name ??
            "Categoría no disponible")
      }`,
      href: clear({ category: undefined }),
    },
    filters.method && {
      key: "method",
      text: `Medio de pago: ${movementDisplayMethods[filters.method] ?? filters.method}`,
      href: clear({ method: undefined }),
    },
    filters.card && {
      key: "card",
      text: `Tarjeta: ${cards.find(({ id }) => id === filters.card)?.name ?? "Tarjeta no disponible"}`,
      href: clear({ card: undefined }),
    },
  ].filter(Boolean) as { key: string; text: string; href: string }[];
  const moreOpen = Boolean(
    filters.category ||
    filters.method ||
    filters.card ||
    custom ||
    filters.compareFrom,
  );
  return (
    <section className="lab-panel lab-panel--dense">
      <form
        action="/estadisticas"
        method="get"
        role="search"
        aria-label="Filtros de estadísticas"
        className="grid gap-3"
      >
        <input type="hidden" name="view" value={filters.view ?? "todas"} />
        {filters.annualEnd && (
          <input type="hidden" name="annualEnd" value={filters.annualEnd} />
        )}
        <div className="gs-filterbar">
          <Field label="Período">
            <Select name="period" defaultValue={filters.period}>
              {Object.entries(statisticsPeriods).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              {custom && <option value="personalizado">Personalizado</option>}
            </Select>
          </Field>
          <Field label="Moneda de visualización">
            <Select name="display" defaultValue={display}>
              <option value="original">Por moneda original</option>
              {bankCurrencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </Select>
          </Field>
          <Field label="Moneda original">
            <Select name="currency" defaultValue={filters.currency}>
              <option value="">Todas</option>
              {bankCurrencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de movimiento">
            <Select name="kind" defaultValue={filters.kind}>
              <option value="">Todos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Gastos</option>
            </Select>
          </Field>
          <div className="gs-filterbar__actions">
            <button type="submit" className={buttonClass("primary")}>
              Aplicar filtros
            </button>
          </div>
        </div>
        <details className="gs-filterbar__more" open={moreOpen}>
          <summary>
            <Icon name="filter" className="size-4" />
            Más filtros
          </summary>
          <div className="gs-form__grid">
            <StatisticsCategorySelect
              categories={categories}
              category={filters.category}
            />
            <Field label="Medio de pago">
              <Select name="method" defaultValue={filters.method}>
                <option value="">Todos</option>
                {Object.entries(movementDisplayMethods).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {cards.length > 0 && (
              <Field label="Tarjeta">
                <Select name="card" defaultValue={filters.card}>
                  <option value="">Todas</option>
                  {cards.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Desde">
              <DateInput name="from" defaultValue={filters.from} />
            </Field>
            <Field label="Hasta">
              <DateInput name="to" defaultValue={filters.to} />
            </Field>
            <Field label="Comparar desde">
              <DateInput
                name="compareFrom"
                defaultValue={filters.compareFrom}
              />
            </Field>
            <Field label="Comparar hasta">
              <DateInput name="compareTo" defaultValue={filters.compareTo} />
            </Field>
          </div>
          <p className="lab-muted mt-2 text-xs">
            Las fechas ingresadas tienen prioridad sobre el período predefinido.
          </p>
        </details>
        {availableTags.length > 0 && (
          <TagFields tags={availableTags} filter initial={selectedTags} />
        )}
      </form>
      <div className="gs-filterbar__chips">
        {chips.length > 0 && (
          <ul className="lab-chips" aria-label="Filtros activos">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chip.href}
                  className="lab-chip"
                  aria-label={`Quitar filtro ${chip.text}`}
                >
                  {chip.text}
                  <Icon name="close" className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/estadisticas${statisticsSearch(filters, {
            currency: undefined,
            category: undefined,
            tag: undefined,
            tags: undefined,
            method: undefined,
            kind: undefined,
            card: undefined,
            detailPage: undefined,
            annualEnd: undefined,
            compareFrom: undefined,
            compareTo: undefined,
            from: undefined,
            to: undefined,
            period: "mes-actual",
            view: filters.view ?? "todas",
          })}`}
          className="lab-link ml-auto"
        >
          Limpiar filtros
        </Link>
      </div>
    </section>
  );
}
