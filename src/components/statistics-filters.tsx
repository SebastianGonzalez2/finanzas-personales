import Link from "next/link";
import { bankCurrencies } from "@/domain/bank-balances";
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

export function StatisticsFiltersForm({
  filters,
  categories,
}: {
  filters: StatisticsFilters;
  categories: {
    id: string;
    name: string;
    kind: "income" | "expense";
  }[];
}) {
  const active = [
    filters.currency,
    filters.category,
    filters.method,
    filters.from,
    filters.to,
  ].filter(Boolean).length;
  const custom = filters.period === "personalizado";
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 className="font-semibold">
        Filtros de estadísticas{active > 0 && ` (${active})`}
      </h2>
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
        </div>
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
            Si elegís fechas, se usan en lugar del período predefinido. Las
            comparaciones usan un tramo anterior de igual duración.
          </p>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={historyPrimary}>
            Aplicar filtros
          </button>
          <Link
            href={`/estadisticas${statisticsSearch(filters, {
              currency: undefined,
              category: undefined,
              method: undefined,
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
