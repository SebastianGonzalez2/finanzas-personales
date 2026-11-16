"use client";

import { DateInput } from "./ui/date-fields";
import { useRef, useState, type ReactNode } from "react";
import { bankCurrencies } from "@/domain/bank-balances";
import {
  historyKinds,
  historyPeriods,
  historySearch,
  historyStates,
  type HistoryFilters as FilterValues,
} from "@/domain/history";
import {
  savedFilterCriteria,
  type SavedFilter,
} from "@/domain/history-filters";
import { movementDisplayMethods } from "@/domain/movements";
import { TagFields } from "./classification-fields";
import type { MovementTag } from "@/domain/classification";
import type { CatalogEntry } from "@/domain/catalog";
import type { listHistoryCategories } from "@/server/history";
import { useHistoryNavigate } from "./history-explorer";
import { Icon } from "./ui/icon";

// UI-04: barra de filtros del prototipo aprobado (movements.tsx) sobre la
// búsqueda real del servidor. Es un formulario GET a /historial (funciona sin
// JavaScript); con JavaScript, los desplegables aplican el filtro al
// cambiar, como en el prototipo, y los campos de texto, fecha, importe y
// etiquetas se aplican con Enter, la lupa o «Aplicar filtros».

const filterKeys = [
  "q",
  "period",
  "from",
  "to",
  "currency",
  "kind",
  "category",
  "merchant",
  "method",
  "min",
  "max",
  "status",
  "tags",
] as const;

const advancedKeys = [
  "status",
  "method",
  "category",
  "merchant",
  "min",
  "max",
  "from",
  "to",
  "tags",
] as const;

function formFilters(form: HTMLFormElement): FilterValues {
  const data = new FormData(form);
  const filters: FilterValues = {};
  for (const key of filterKeys) {
    const values = data
      .getAll(key)
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (values.length) filters[key] = values.join(",");
  }
  // Un período relativo excluye el rango fijo (el servidor rechaza ambos).
  // Se descarta aquí porque, al elegir el período, Desde y Hasta todavía no
  // quedaron deshabilitados cuando se lee el formulario.
  if (filters.period) {
    delete filters.from;
    delete filters.to;
  }
  return filters;
}

// Las claves de un filtro guardado pueden volver de la base en otro orden.
const canonical = (criteria: FilterValues) =>
  JSON.stringify(Object.entries(savedFilterCriteria(criteria)).sort());

function SelectField({
  id,
  label,
  children,
  ...select
}: {
  id: string;
  label: string;
  children: ReactNode;
} & Omit<React.ComponentProps<"select">, "id" | "className">) {
  return (
    <div className="lab-field">
      <label htmlFor={id} className="lab-field__label">
        {label}
      </label>
      <span className="lab-select">
        <select id={id} {...select}>
          {children}
        </select>
        <Icon name="chevronDown" duotone={false} className="size-4" />
      </span>
    </div>
  );
}

function InputField({
  id,
  label,
  localizedDate,
  ...input
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  localizedDate?: boolean;
} & Pick<
  React.ComponentProps<"input">,
  "inputMode" | "maxLength" | "autoComplete" | "placeholder"
>) {
  return (
    <div className="lab-field">
      <label htmlFor={id} className="lab-field__label">
        {label}
      </label>
      {localizedDate ? (
        <DateInput id={id} className="lab-input" {...input} />
      ) : (
        <input id={id} className="lab-input" {...input} />
      )}
    </div>
  );
}

type Props = {
  values: FilterValues;
  categories: Awaited<ReturnType<typeof listHistoryCategories>>;
  tags: MovementTag[];
  merchants: CatalogEntry[];
  saved: SavedFilter[] | null;
};

export function HistoryFilters(props: Props) {
  // «Más filtros» queda abierto entre consultas; el formulario se rehace con
  // cada búsqueda para reflejar exactamente los criterios aplicados.
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <HistoryFilterForm
      key={historySearch(props.values)}
      {...props}
      moreOpen={moreOpen}
      onToggleMore={() => setMoreOpen((open) => !open)}
    />
  );
}

function HistoryFilterForm({
  values,
  categories,
  tags,
  merchants,
  saved,
  moreOpen,
  onToggleMore,
}: Props & { moreOpen: boolean; onToggleMore: () => void }) {
  const navigate = useHistoryNavigate();
  const form = useRef<HTMLFormElement>(null);
  const [period, setPeriod] = useState(values.period ?? "");
  const advanced = advancedKeys.some((key) => values[key]);
  const current = canonical(values);
  // Filtro guardado cuyos criterios coinciden con la búsqueda aplicada; se
  // recalcula también al guardar uno nuevo (refresh sin cambiar la URL).
  const appliedSaved =
    saved?.find((entry) => canonical(entry.criteria) === current)?.id ?? "";
  const [savedChoice, setSavedChoice] = useState<string | null>(null);

  function apply(focusId?: string) {
    if (!form.current) return;
    navigate(`/historial${historySearch(formFilters(form.current))}`, focusId);
  }

  const applyOnChange = (event: React.ChangeEvent<HTMLSelectElement>) =>
    apply(event.currentTarget.id);

  return (
    <form
      ref={form}
      action="/historial"
      method="get"
      aria-label="Buscar y filtrar movimientos"
      onSubmit={(event) => {
        event.preventDefault();
        const active = document.activeElement;
        apply(
          active instanceof HTMLElement && form.current?.contains(active)
            ? active.id || undefined
            : undefined,
        );
      }}
    >
      <div className="lab-mx__toolbar">
        <div className="lab-search">
          <button
            type="submit"
            id="historial-buscar"
            className="lab-search__submit"
            aria-label="Buscar"
          >
            <Icon name="search" duotone={false} className="size-4.5" />
          </button>
          <label>
            <span className="sr-only">Buscar texto</span>
            <input
              id="historial-q"
              name="q"
              type="search"
              maxLength={200}
              defaultValue={values.q}
              placeholder="Buscar concepto, nota o comercio"
            />
          </label>
        </div>
        <SelectField
          id="historial-period"
          label="Período"
          name="period"
          value={period}
          onChange={(event) => {
            setPeriod(event.target.value);
            applyOnChange(event);
          }}
        >
          <option value="">Todas las fechas</option>
          {Object.entries(historyPeriods).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="historial-kind"
          label="Tipo"
          name="kind"
          defaultValue={values.kind ?? ""}
          onChange={applyOnChange}
        >
          <option value="">Todos</option>
          {Object.entries(historyKinds).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="historial-currency"
          label="Moneda"
          name="currency"
          defaultValue={values.currency ?? ""}
          onChange={applyOnChange}
        >
          <option value="">Todas</option>
          {bankCurrencies.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </SelectField>
        <button
          type="button"
          id="historial-mas-filtros"
          className="ui-btn ui-btn--ghost lab-mx__more"
          aria-expanded={moreOpen}
          aria-controls="mas-filtros"
          onClick={onToggleMore}
        >
          <Icon name="filter" duotone={false} className="size-4" />
          <span>Más filtros</span>
          {advanced && (
            <>
              <span className="lab-dot" aria-hidden="true" />
              <span className="sr-only"> (con filtros activos)</span>
            </>
          )}
        </button>
        {saved && saved.length > 0 && (
          <SelectField
            id="historial-guardados"
            label="Filtros guardados"
            value={savedChoice ?? appliedSaved}
            onChange={(event) => {
              setSavedChoice(event.target.value);
              const entry = saved.find(({ id }) => id === event.target.value);
              navigate(
                `/historial${entry ? historySearch(entry.criteria) : ""}`,
                event.currentTarget.id,
              );
            }}
          >
            <option value="">Ninguno</option>
            {saved.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      <div id="mas-filtros" hidden={!moreOpen} className="lab-mx__more-panel">
        <SelectField
          id="historial-status"
          label="Estado"
          name="status"
          defaultValue={values.status ?? ""}
          onChange={applyOnChange}
        >
          <option value="">Todos</option>
          {Object.entries(historyStates).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="historial-method"
          label="Medio"
          name="method"
          defaultValue={values.method ?? ""}
          onChange={applyOnChange}
        >
          <option value="">Todos</option>
          {Object.entries(movementDisplayMethods).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="historial-category"
          label="Categoría"
          name="category"
          defaultValue={values.category ?? ""}
          onChange={applyOnChange}
        >
          <option value="">Todas</option>
          <option value="none">Sin categorizar</option>
          {values.category &&
            values.category !== "none" &&
            !categories.some(({ id }) => id === values.category) && (
              <option value={values.category}>Categoría del enlace</option>
            )}
          {categories.map(({ id, name, kind }) => (
            <option key={id} value={id}>
              {name} ({historyKinds[kind].toLowerCase()})
            </option>
          ))}
        </SelectField>
        {merchants.length > 0 && (
          <SelectField
            id="historial-merchant"
            label="Comercio"
            name="merchant"
            defaultValue={values.merchant ?? ""}
            onChange={applyOnChange}
          >
            <option value="">Todos</option>
            {values.merchant &&
              !merchants.some(({ id }) => id === values.merchant) && (
                <option value={values.merchant}>Comercio del enlace</option>
              )}
            {merchants.map(({ id, name, archived }) => (
              <option key={id} value={id}>
                {name}
                {archived ? " (archivado)" : ""}
              </option>
            ))}
          </SelectField>
        )}
        <InputField
          id="historial-min"
          label="Importe mínimo"
          name="min"
          inputMode="decimal"
          maxLength={22}
          autoComplete="off"
          placeholder="0,00"
          defaultValue={values.min}
        />
        <InputField
          id="historial-max"
          label="Importe máximo"
          name="max"
          inputMode="decimal"
          maxLength={22}
          autoComplete="off"
          placeholder="0,00"
          defaultValue={values.max}
        />
        <InputField
          id="historial-from"
          label="Desde"
          name="from"
          localizedDate
          defaultValue={values.from}
          disabled={Boolean(period)}
        />
        <InputField
          id="historial-to"
          label="Hasta"
          name="to"
          localizedDate
          defaultValue={values.to}
          disabled={Boolean(period)}
        />
        {tags.length > 0 && (
          <div className="lab-mx__tags">
            <TagFields tags={tags} initial={values.tags?.split(",")} filter />
          </div>
        )}
        <div className="lab-mx__more-foot">
          <p className="lab-muted text-xs">
            {period
              ? "Con un período elegido no se usan las fechas Desde y Hasta. "
              : ""}
            Los períodos relativos siguen el calendario vigente en cada
            consulta.
          </p>
          <button
            type="submit"
            id="historial-aplicar"
            className="ui-btn ui-btn--primary"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </form>
  );
}
