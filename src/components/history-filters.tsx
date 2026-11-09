import Link from "next/link";
import { bankCurrencies } from "@/domain/bank-balances";
import {
  historyKinds,
  historyStates,
  type HistoryFilters as FilterValues,
} from "@/domain/history";
import { movementMethods } from "@/domain/movements";
import type { listHistoryCategories } from "@/server/history";
import {
  historyButton,
  historyControl,
  HistoryField,
  historyPrimary,
} from "./history-fields";
import { Card } from "./ui/card";

export function HistoryFilters({
  values,
  categories,
}: {
  values: FilterValues;
  categories: Awaited<ReturnType<typeof listHistoryCategories>>;
}) {
  const active = Object.values(values).filter(Boolean).length;
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 className="font-semibold">
        Buscar y filtrar{active > 0 && ` (${active})`}
      </h2>
      <form action="/historial" method="get" className="grid gap-3">
        <HistoryField label="Concepto o nota">
          <input
            name="q"
            type="search"
            maxLength={200}
            defaultValue={values.q}
            placeholder="Ej. alquiler"
            className={historyControl}
          />
        </HistoryField>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HistoryField label="Desde">
            <input
              name="from"
              type="date"
              defaultValue={values.from}
              className={historyControl}
            />
          </HistoryField>
          <HistoryField label="Hasta">
            <input
              name="to"
              type="date"
              defaultValue={values.to}
              className={historyControl}
            />
          </HistoryField>
          <HistoryField label="Tipo">
            <select
              name="kind"
              defaultValue={values.kind}
              className={historyControl}
            >
              <option value="">Todos</option>
              {Object.entries(historyKinds).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </HistoryField>
          <HistoryField label="Moneda">
            <select
              name="currency"
              defaultValue={values.currency}
              className={historyControl}
            >
              <option value="">Todas</option>
              {bankCurrencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </HistoryField>
        </div>
        <details
          open={Boolean(
            values.min ||
            values.max ||
            values.category ||
            values.method ||
            values.status,
          )}
        >
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Más filtros
          </summary>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <HistoryField label="Importe mínimo">
              <input
                name="min"
                inputMode="decimal"
                maxLength={22}
                defaultValue={values.min}
                className={historyControl}
              />
            </HistoryField>
            <HistoryField label="Importe máximo">
              <input
                name="max"
                inputMode="decimal"
                maxLength={22}
                defaultValue={values.max}
                className={historyControl}
              />
            </HistoryField>
            <HistoryField label="Categoría">
              <select
                name="category"
                defaultValue={values.category}
                className={historyControl}
              >
                <option value="">Todas</option>
                <option value="none">Sin categorizar</option>
                {categories.map(({ id, name, kind }) => (
                  <option key={id} value={id}>
                    {name} ({historyKinds[kind].toLowerCase()})
                  </option>
                ))}
              </select>
            </HistoryField>
            <HistoryField label="Medio">
              <select
                name="method"
                defaultValue={values.method}
                className={historyControl}
              >
                <option value="">Todos</option>
                {Object.entries(movementMethods).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </HistoryField>
            <HistoryField label="Estado">
              <select
                name="status"
                defaultValue={values.status}
                className={historyControl}
              >
                <option value="">Todos</option>
                {Object.entries(historyStates).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </HistoryField>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <button className={historyPrimary} type="submit">
            Aplicar filtros
          </button>
          {active > 0 && (
            <Link href="/historial" prefetch={false} className={historyButton}>
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>
    </Card>
  );
}
