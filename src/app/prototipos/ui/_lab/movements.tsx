"use client";

import { useId, useMemo, useState } from "react";
import { historyKinds, historyPeriods, historyStates } from "@/domain/history";
import { movementDisplayMethods } from "@/domain/movements";
import { LabIcon, type LabIconName } from "./icons";
import {
  money,
  movements,
  savedFilters,
  shortDate,
  type LabMovement,
} from "./data";

// UI-01 — Historial denso con filtros. Filtra datos ficticios en el cliente
// para comprobar el diseño; no reemplaza la búsqueda del servidor.

type Criteria = {
  text: string;
  period: string;
  kind: string;
  currency: string;
  status: string;
  method: string;
  category: string;
};

const empty: Criteria = {
  text: "",
  period: "mes-actual",
  kind: "",
  currency: "",
  status: "",
  method: "",
  category: "",
};

export const kindVisual: Record<
  LabMovement["kind"],
  { icon: LabIconName; tone: string }
> = {
  income: { icon: "income", tone: "income" },
  expense: { icon: "expense", tone: "expense" },
  bank_transfer: { icon: "swap", tone: "neutral" },
  checkpoint: { icon: "check", tone: "neutral" },
  card_purchase: { icon: "cards", tone: "expense" },
  card_payment: { icon: "cards", tone: "neutral" },
  card_opening: { icon: "cards", tone: "neutral" },
  card_adjustment: { icon: "cards", tone: "neutral" },
  loan_operation: { icon: "debts", tone: "neutral" },
  purchase_refund: { icon: "income", tone: "income" },
  card_credit_return: { icon: "income", tone: "income" },
  bank_benefit: { icon: "benefits", tone: "income" },
};

const statusIcon: Record<LabMovement["status"], LabIconName> = {
  confirmed: "check",
  pending: "clock",
  corrected: "info",
  voided: "close",
};

export function MovementAmount({ movement }: { movement: LabMovement }) {
  const negative = movement.amount.startsWith("-");
  const value = money(movement.amount.replace("-", ""), movement.currency);
  const neutral = movement.kind === "checkpoint";
  return (
    <span
      className={`lab-amount${negative ? "" : neutral ? "" : " is-positive"}${movement.status === "voided" ? " is-voided" : ""}`}
    >
      {neutral ? "" : negative ? "−" : "+"}
      {value}
      {movement.other && (
        <span className="lab-amount__other">
          {money(
            movement.other.amount.replace("-", ""),
            movement.other.currency,
          )}
        </span>
      )}
    </span>
  );
}

export function KindBadge({ kind }: { kind: LabMovement["kind"] }) {
  const visual = kindVisual[kind];
  return (
    <span className={`lab-kind lab-kind--${visual.tone}`} aria-hidden="true">
      <LabIcon name={visual.icon} className="size-4" />
    </span>
  );
}

export function StatusPill({ status }: { status: LabMovement["status"] }) {
  return (
    <span className={`lab-status lab-status--${status}`}>
      <LabIcon name={statusIcon[status]} duotone={false} className="size-3.5" />
      {historyStates[status]}
    </span>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  all = "Todos",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all?: string | null;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <label htmlFor={id} className="lab-field__label">
        {label}
      </label>
      <span className="lab-select">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {all !== null && <option value="">{all}</option>}
          {options.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
        <LabIcon name="chevronDown" duotone={false} className="size-4" />
      </span>
    </div>
  );
}

const categories = Array.from(
  new Set(
    movements.flatMap((movement) =>
      movement.category ? [movement.category] : [],
    ),
  ),
).sort((a, b) => a.localeCompare(b, "es"));

export function MovementsExplorer() {
  const [criteria, setCriteria] = useState<Criteria>(empty);
  const [saved, setSaved] = useState("");
  const [sort, setSort] = useState<{
    key: "date" | "amount";
    dir: "asc" | "desc";
  }>({
    key: "date",
    dir: "desc",
  });
  const [moreOpen, setMoreOpen] = useState(false);

  const set = (key: keyof Criteria) => (value: string) => {
    setSaved("");
    setCriteria((current) => ({ ...current, [key]: value }));
  };

  const rows = useMemo(() => {
    const text = criteria.text.trim().toLocaleLowerCase("es");
    const filtered = movements.filter(
      (movement) =>
        (!text ||
          `${movement.concept} ${movement.counterpart ?? ""} ${movement.category ?? ""}`
            .toLocaleLowerCase("es")
            .includes(text)) &&
        (!criteria.kind || movement.kind === criteria.kind) &&
        (!criteria.currency || movement.currency === criteria.currency) &&
        (!criteria.status || movement.status === criteria.status) &&
        (!criteria.method || movement.method === criteria.method) &&
        (!criteria.category || movement.category === criteria.category),
    );
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "date"
        ? a.effectiveOn.localeCompare(b.effectiveOn) * factor ||
          a.id.localeCompare(b.id) * factor
        : (Math.abs(Number(a.amount)) - Math.abs(Number(b.amount))) * factor,
    );
  }, [criteria, sort]);

  const chips = (
    [
      [
        "kind",
        "Tipo",
        criteria.kind &&
          historyKinds[criteria.kind as keyof typeof historyKinds],
      ],
      ["currency", "Moneda", criteria.currency],
      [
        "status",
        "Estado",
        criteria.status &&
          historyStates[criteria.status as keyof typeof historyStates],
      ],
      [
        "method",
        "Medio",
        criteria.method &&
          movementDisplayMethods[
            criteria.method as keyof typeof movementDisplayMethods
          ],
      ],
      ["category", "Categoría", criteria.category],
      ["text", "Texto", criteria.text.trim() && `«${criteria.text.trim()}»`],
    ] as const
  ).filter(([, , value]) => value);

  function toggleSort(key: "date" | "amount") {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  }

  const ariaSort = (key: "date" | "amount") =>
    sort.key === key
      ? sort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none";

  return (
    <section aria-labelledby="titulo-movimientos" className="lab-mx">
      <div className="lab-mx__toolbar">
        <label className="lab-search">
          <LabIcon name="search" duotone={false} className="size-4.5" />
          <span className="sr-only">Buscar texto</span>
          <input
            type="search"
            placeholder="Buscar concepto, comercio o categoría"
            value={criteria.text}
            onChange={(event) => set("text")(event.target.value)}
          />
        </label>
        <Select
          label="Período"
          value={criteria.period}
          onChange={set("period")}
          options={Object.entries(historyPeriods)}
          all={null}
        />
        <Select
          label="Tipo"
          value={criteria.kind}
          onChange={set("kind")}
          options={Object.entries(historyKinds)}
        />
        <Select
          label="Moneda"
          value={criteria.currency}
          onChange={set("currency")}
          options={[
            ["UYU", "UYU"],
            ["USD", "USD"],
            ["EUR", "EUR"],
          ]}
          all="Todas"
        />
        <button
          type="button"
          className="lab-btn lab-btn--ghost lab-mx__more"
          aria-expanded={moreOpen}
          aria-controls="mas-filtros"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <LabIcon name="filter" duotone={false} className="size-4" />
          Más filtros
          {chips.some(
            ([key]) =>
              key === "status" || key === "method" || key === "category",
          ) && <span className="lab-dot" aria-label="con filtros activos" />}
        </button>
        <Select
          label="Filtros guardados"
          value={saved}
          onChange={(id) => {
            setSaved(id);
            const preset = savedFilters.find((filter) => filter.id === id);
            setCriteria({ ...empty, ...(preset?.criteria ?? {}) });
          }}
          options={savedFilters.map((filter) => [filter.id, filter.label])}
          all="Ninguno"
        />
      </div>

      <div id="mas-filtros" hidden={!moreOpen} className="lab-mx__more-panel">
        <Select
          label="Estado"
          value={criteria.status}
          onChange={set("status")}
          options={Object.entries(historyStates)}
        />
        <Select
          label="Medio"
          value={criteria.method}
          onChange={set("method")}
          options={Object.entries(movementDisplayMethods)}
        />
        <Select
          label="Categoría"
          value={criteria.category}
          onChange={set("category")}
          options={categories.map((category) => [category, category])}
          all="Todas"
        />
      </div>

      <div className="lab-mx__summary">
        <h2 id="titulo-movimientos" className="lab-mx__title">
          Movimientos
        </h2>
        <p aria-live="polite" className="lab-muted text-sm">
          {rows.length} {rows.length === 1 ? "resultado" : "resultados"} ·{" "}
          {historyPeriods[criteria.period as keyof typeof historyPeriods]}
        </p>
        {chips.length > 0 && (
          <ul className="lab-chips" aria-label="Filtros activos">
            {chips.map(([key, title, value]) => (
              <li key={key}>
                <button
                  type="button"
                  className="lab-chip"
                  aria-label={`Quitar filtro ${title}: ${value}`}
                  onClick={() => set(key)("")}
                >
                  <span className="lab-muted">{title}:</span> {value}
                  <LabIcon name="close" duotone={false} className="size-3.5" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="lab-link"
                onClick={() => {
                  setSaved("");
                  setCriteria(empty);
                }}
              >
                Limpiar todo
              </button>
            </li>
          </ul>
        )}
      </div>

      <div className="lab-table-wrap">
        <table className="lab-table">
          <caption className="sr-only">
            Movimientos filtrados. Los encabezados Fecha e Importe permiten
            ordenar.
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort("date")}>
                <button
                  type="button"
                  className="lab-sort"
                  onClick={() => toggleSort("date")}
                >
                  Fecha
                  <LabIcon name="sort" duotone={false} className="size-3.5" />
                </button>
              </th>
              <th scope="col">Concepto</th>
              <th scope="col">Categoría</th>
              <th scope="col">Medio</th>
              <th scope="col">Estado</th>
              <th
                scope="col"
                aria-sort={ariaSort("amount")}
                className="text-right"
              >
                <button
                  type="button"
                  className="lab-sort ml-auto"
                  onClick={() => toggleSort("amount")}
                >
                  Importe
                  <LabIcon name="sort" duotone={false} className="size-3.5" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((movement) => (
              <tr
                key={movement.id}
                className={
                  movement.status === "voided" ? "is-voided" : undefined
                }
              >
                <td className="lab-td-date tabular-nums">
                  {shortDate(movement.effectiveOn)}
                </td>
                <td className="lab-td-concept">
                  <KindBadge kind={movement.kind} />
                  <span className="min-w-0">
                    <span className="lab-td-concept__title">
                      {movement.concept}
                    </span>
                    <span className="lab-td-concept__sub">
                      {historyKinds[movement.kind]}
                      {movement.counterpart ? ` · ${movement.counterpart}` : ""}
                    </span>
                  </span>
                </td>
                <td className="lab-td-category">
                  {movement.category ?? <span className="lab-muted">—</span>}
                </td>
                <td className="lab-td-method">
                  {movement.method ? (
                    movementDisplayMethods[movement.method]
                  ) : (
                    <span className="lab-muted">—</span>
                  )}
                </td>
                <td className="lab-td-status">
                  <StatusPill status={movement.status} />
                </td>
                <td className="lab-td-amount">
                  <MovementAmount movement={movement} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="lab-empty">
            <LabIcon name="search" className="size-8" />
            <p className="font-medium">No hay movimientos con estos filtros</p>
            <button
              type="button"
              className="lab-btn lab-btn--ghost"
              onClick={() => setCriteria(empty)}
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
