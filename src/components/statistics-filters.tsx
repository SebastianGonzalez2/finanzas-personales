import Link from "next/link";
import { bankCurrencies } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";
import {
  statisticsPeriods,
  statisticsSearch,
  type StatisticsFilters,
} from "@/domain/statistics";
import { movementDisplayMethods } from "@/domain/movements";
import {
  historyButton,
  historyControl,
  HistoryField,
  historyPrimary,
} from "./history-fields";
import { Card } from "./ui/card";
import { TagFields } from "./classification-fields";
import type { MovementTag } from "@/domain/classification";

export function StatisticsFiltersForm({
  filters,
  display,
  categories,
  cards,
  tags,
}: {
  filters: StatisticsFilters;
  display: Currency | "original";
  categories: {
    id: string;
    name: string;
    kind: "income" | "expense";
  }[];
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
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 className="font-semibold">Filtros de estadísticas</h2>
      <form action="/estadisticas" method="get" className="grid gap-3">
        <input type="hidden" name="view" value={filters.view ?? "todas"} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HistoryField label="Período">
            <select
              name="period"
              defaultValue={filters.period}
              className={historyControl}
            >
              {Object.entries(statisticsPeriods).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              {custom && <option value="personalizado">Personalizado</option>}
            </select>
          </HistoryField>
          <HistoryField label="Moneda de visualización">
            <select
              name="display"
              defaultValue={display}
              className={historyControl}
            >
              <option value="original">Por moneda original</option>
              {bankCurrencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </HistoryField>
          <HistoryField label="Moneda original">
            <select
              name="currency"
              defaultValue={filters.currency}
              className={historyControl}
            >
              <option value="">Todas</option>
              {bankCurrencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </HistoryField>
          <HistoryField label="Tipo de movimiento">
            <select
              name="kind"
              defaultValue={filters.kind}
              className={historyControl}
            >
              <option value="">Todos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Gastos</option>
            </select>
          </HistoryField>
          <HistoryField label="Categoría">
            <select
              name="category"
              defaultValue={filters.category}
              className={historyControl}
            >
              <option value="">Todas</option>
              <option value="none">Sin categorizar</option>
              {categories.map(({ id, name, kind }) => (
                <option key={id} value={id}>
                  {name} ({kind === "income" ? "ingreso" : "gasto"})
                </option>
              ))}
            </select>
          </HistoryField>
          <HistoryField label="Medio de pago">
            <select
              name="method"
              defaultValue={filters.method}
              className={historyControl}
            >
              <option value="">Todos</option>
              {Object.entries(movementDisplayMethods).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </HistoryField>
          {cards.length > 0 && (
            <HistoryField label="Tarjeta">
              <select
                name="card"
                defaultValue={filters.card}
                className={historyControl}
              >
                <option value="">Todas</option>
                {cards.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </HistoryField>
          )}
        </div>
        {availableTags.length > 0 && (
          <TagFields tags={availableTags} filter initial={selectedTags} />
        )}
        <details open={custom}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Rango de fechas personalizado
          </summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <HistoryField label="Desde">
              <input
                name="from"
                type="date"
                defaultValue={filters.from}
                className={historyControl}
              />
            </HistoryField>
            <HistoryField label="Hasta">
              <input
                name="to"
                type="date"
                defaultValue={filters.to}
                className={historyControl}
              />
            </HistoryField>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Las fechas ingresadas tienen prioridad sobre el período predefinido.
          </p>
        </details>
        <details open={Boolean(filters.compareFrom)}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Elegir período de comparación
          </summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <HistoryField label="Comparar desde">
              <input
                name="compareFrom"
                type="date"
                defaultValue={filters.compareFrom}
                className={historyControl}
              />
            </HistoryField>
            <HistoryField label="Comparar hasta">
              <input
                name="compareTo"
                type="date"
                defaultValue={filters.compareTo}
                className={historyControl}
              />
            </HistoryField>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={historyPrimary}>
            Aplicar filtros
          </button>
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
              compareFrom: undefined,
              compareTo: undefined,
              from: undefined,
              to: undefined,
              period: "mes-actual",
              view: filters.view ?? "todas",
            })}`}
            className={historyButton}
          >
            Limpiar filtros
          </Link>
        </div>
      </form>
    </Card>
  );
}
