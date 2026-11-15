import type { ReactNode } from "react";
import {
  CashflowChart,
  CategoryDonut,
  type CashflowPoint,
} from "@/components/glaciar-summary/charts";
import { buttonClass } from "@/components/ui/button";
import { REPORT_SECTIONS } from "@/lib/export/report-format";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  EmptyState,
  ErrorState,
  FormPanel,
  HBars,
  Kpi,
  PageHead,
  RowIcon,
  Screen,
  m,
} from "../kit";
import { protoHref, type ProtoState } from "../screens";

/* ============================== Estadísticas ============================== */

const flow: CashflowPoint[] = [
  {
    period: "2026-06",
    label: "jun",
    income: "98000",
    expense: "71200",
    result: "26800",
  },
  {
    period: "2026-07",
    label: "jul",
    income: "98000",
    expense: "83900",
    result: "14100",
  },
  {
    period: "2026-08",
    label: "ago",
    income: "104500",
    expense: "76350",
    result: "28150",
  },
  {
    period: "2026-09",
    label: "sep",
    income: "98000",
    expense: "91800",
    result: "6200",
  },
  {
    period: "2026-10",
    label: "oct",
    income: "112300",
    expense: "79640",
    result: "32660",
  },
  {
    period: "2026-11",
    label: "nov",
    income: "98000",
    expense: "52410",
    result: "45590",
    inProgress: true,
  },
];

const categories = [
  { name: "Alimentación", amount: "18640", color: "#3987e5" },
  { name: "Hogar", amount: "12350", color: "#199e70" },
  { name: "Transporte", amount: "7310", color: "#c98500" },
  { name: "Salud", amount: "5200", color: "#9085e9" },
  { name: "Ocio", amount: "4110", color: "#d55181" },
  { name: "Otros", amount: "4800", color: "#5d6b82" },
];

function StatPanel({
  id,
  title,
  icon,
  favorite,
  className = "",
  children,
  foot,
}: {
  id: string;
  title: string;
  icon: IconName;
  favorite: boolean;
  className?: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <section className={`lab-panel ${className}`} aria-labelledby={id}>
      <header className="lab-panel__head">
        <h2 id={id} className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name={icon} className="size-4.5" />
          </span>
          {title}
        </h2>
        <button
          type="button"
          className="ui-icon-btn ui05-star"
          aria-pressed={favorite}
          aria-label={
            favorite
              ? `Quitar «${title}» de favoritos`
              : `Agregar «${title}» a favoritos`
          }
        >
          <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden="true">
            <path
              d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
              fill={favorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>
      {children}
      {foot}
    </section>
  );
}

function Delta({ good, children }: { good: boolean; children: ReactNode }) {
  return (
    <span className={`lab-delta ${good ? "is-good" : "is-bad"}`}>
      <Icon
        name={good ? "trendUp" : "trendDown"}
        duotone={false}
        className="size-3.5"
      />
      {children}
    </span>
  );
}

function Filters({ detail }: { detail?: boolean }) {
  return (
    <section
      className="lab-panel lab-panel--dense"
      aria-label="Filtros de estadísticas"
    >
      <form
        className="ui05-filterbar"
        role="search"
        aria-label="Filtros de estadísticas"
      >
        <Field label="Período">
          <Select defaultValue="mes">
            <option value="mes">Este mes · noviembre</option>
            <option>Mes anterior</option>
            <option>Últimos 3 meses</option>
            <option>Este año</option>
            <option>Personalizado</option>
          </Select>
        </Field>
        <Field label="Tipo de movimiento">
          <Select defaultValue="Todos">
            <option>Todos</option>
            <option>Ingresos</option>
            <option>Gastos</option>
          </Select>
        </Field>
        <Field label="Moneda original">
          <Select defaultValue="Todas">
            <option>Todas</option>
            <option>UYU</option>
            <option>USD</option>
            <option>EUR</option>
          </Select>
        </Field>
        <Field label="Medio de pago">
          <Select defaultValue="Todos">
            <option>Todos</option>
            <option>Débito</option>
            <option>Crédito</option>
            <option>Transferencia</option>
          </Select>
        </Field>
        <div className="ui05-filterbar__actions">
          <button
            type="button"
            className={buttonClass("outline")}
            aria-expanded="false"
          >
            <Icon name="filter" duotone={false} className="size-4" />
            Más filtros
          </button>
          <button type="button" className={buttonClass("primary")}>
            Aplicar filtros
          </button>
        </div>
      </form>
      <div className="ui05-filterbar__chips">
        <span className="lab-muted text-xs">Comparando con octubre 2026</span>
        {detail && (
          <ul className="lab-chips">
            <li>
              <button type="button" className="lab-chip">
                Categoría: Alimentación
                <Icon name="close" duotone={false} className="size-3" />
              </button>
            </li>
          </ul>
        )}
        <a href="#" className="lab-link ml-auto">
          Limpiar filtros
        </a>
      </div>
    </section>
  );
}

function Metrics() {
  return (
    <StatPanel
      id="st-metrics"
      title="Indicadores del período"
      icon="stats"
      favorite
      className="ui05-span-12"
    >
      <div className="ui05-kpis">
        <Kpi
          label="Ingresos"
          value={m("98000.00")}
          extra={<Delta good>−12,7 % vs. octubre</Delta>}
        />
        <Kpi
          label="Gastos"
          value={m("52410.00")}
          extra={<Delta good>−34,2 % vs. octubre</Delta>}
        />
        <Kpi
          hero
          label="Resultado del período"
          value={m("45590.00")}
          extra={<Delta good>+39,6 % vs. octubre</Delta>}
        />
        <Kpi
          label="Devoluciones acreditadas"
          value={m("1240.00")}
          sub="2 devoluciones"
        />
      </div>
      <p className="lab-muted text-xs">
        La fecha de hoy todavía está en curso. Los períodos tienen distinta
        duración.
      </p>
    </StatPanel>
  );
}

function Charts({ all }: { all: boolean }) {
  return (
    <div className="ui05-grid">
      <Metrics />
      <StatPanel
        id="st-flow"
        title="Ingresos y gastos por mes"
        icon="trendUp"
        favorite
        className="ui05-span-8"
      >
        <CashflowChart data={flow} height={260} />
      </StatPanel>
      <StatPanel
        id="st-categories"
        title="Gastos por categoría"
        icon="budgets"
        favorite
        className="ui05-span-4"
      >
        <CategoryDonut data={categories} total="52410" />
        <a href={protoHref("estadisticas", "detalle")} className="lab-link">
          Ver detalle por subcategoría
          <Icon name="chevronRight" duotone={false} className="size-3.5" />
        </a>
      </StatPanel>
      <StatPanel
        id="st-methods"
        title="Medios de pago"
        icon="cards"
        favorite={!all}
        className="ui05-span-6"
      >
        <HBars
          items={[
            {
              label: "Tarjeta de crédito",
              value: m("27340.00"),
              ratio: 0.52,
              color: "#3987e5",
            },
            {
              label: "Débito bancario",
              value: m("16820.00"),
              ratio: 0.32,
              color: "#199e70",
            },
            {
              label: "Transferencia",
              value: m("8250.00"),
              ratio: 0.16,
              color: "#c98500",
            },
          ]}
        />
        <p className="lab-muted text-xs">
          Importes registrados según el medio de pago. Un pago de tarjeta no se
          cuenta como segundo gasto.
        </p>
      </StatPanel>
      <StatPanel
        id="st-smart"
        title="Resumen inteligente"
        icon="sparkle"
        favorite={!all}
        className="ui05-span-6"
      >
        <ul className="ui05-rows">
          <li>
            <RowIcon name="trendDown" />
            <div className="ui05-row__main">
              <p className="ui05-row__title">
                Gastaste 34 % menos que en octubre
              </p>
              <p className="ui05-row__sub">
                Principalmente en Hogar (−8.120,00 UYU).
              </p>
            </div>
          </li>
          <li>
            <RowIcon name="budgets" />
            <div className="ui05-row__main">
              <p className="ui05-row__title">
                Alimentación concentra el 36 % del gasto
              </p>
              <p className="ui05-row__sub">18.640,00 UYU en 23 movimientos.</p>
            </div>
          </li>
          <li>
            <RowIcon name="recurring" />
            <div className="ui05-row__main">
              <p className="ui05-row__title">
                Los recurrentes son el 41 % del gasto
              </p>
              <p className="ui05-row__sub">
                Alquiler, servicios y suscripciones.
              </p>
            </div>
          </li>
        </ul>
      </StatPanel>
      {all && (
        <>
          <StatPanel
            id="st-income"
            title="Ingresos por categoría"
            icon="income"
            favorite={false}
            className="ui05-span-6"
          >
            <HBars
              items={[
                {
                  label: "Sueldo",
                  value: m("92000.00"),
                  ratio: 0.94,
                  color: "#199e70",
                },
                {
                  label: "Freelance",
                  value: m("4760.00"),
                  ratio: 0.05,
                  color: "#3987e5",
                },
                {
                  label: "Reintegros",
                  value: m("1240.00"),
                  ratio: 0.01,
                  color: "#5d6b82",
                },
              ]}
            />
          </StatPanel>
          <StatPanel
            id="st-recurring"
            title="Gastos recurrentes"
            icon="recurring"
            favorite={false}
            className="ui05-span-6"
          >
            <div
              className="ui05-split"
              role="img"
              aria-label="Recurrentes 41 %, no recurrentes 59 %"
            >
              <span style={{ width: "41%", background: "#9085e9" }} />
              <span style={{ width: "59%", background: "#5d6b82" }} />
            </div>
            <ul className="lab-legend">
              <li>
                <span
                  className="ui05-swatch"
                  style={{ background: "#9085e9" }}
                />{" "}
                Recurrentes · {m("21490.00")} · 41 %
              </li>
              <li>
                <span
                  className="ui05-swatch"
                  style={{ background: "#5d6b82" }}
                />{" "}
                No recurrentes · {m("30920.00")} · 59 %
              </li>
            </ul>
          </StatPanel>
          <StatPanel
            id="st-history"
            title="Histórico por fecha"
            icon="calendar"
            favorite={false}
            className="ui05-span-12"
          >
            <p className="lab-muted text-sm">
              Saldos, reservas y deudas al cierre del día según los registros
              disponibles. Se aplica el filtro de moneda.
            </p>
            <table className="ui05-table ui05-table--stack">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="is-num">Banco</th>
                  <th className="is-num">Reservado</th>
                  <th className="is-num">Disponible</th>
                  <th className="is-num">Deuda de tarjetas</th>
                  <th className="is-num">Patrimonio registrado</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "30/09",
                    "●",
                    "214.300,00",
                    "112.000,00",
                    "102.300,00",
                    "31.900,00",
                    "182.400,00",
                  ],
                  [
                    "31/10",
                    "○",
                    "228.910,00",
                    "116.200,00",
                    "112.710,00",
                    "26.110,00",
                    "202.800,00",
                  ],
                  [
                    "15/11",
                    "●",
                    "236.130,00",
                    "118.500,00",
                    "117.630,00",
                    "24.570,30",
                    "211.559,70",
                  ],
                ].map(([date, dot, bank, reserved, free, debt, worth]) => (
                  <tr key={date}>
                    <td data-label="Fecha" className="lab-muted">
                      {date}
                    </td>
                    <td data-label="Banco" className="is-num">
                      <span
                        aria-label={dot === "●" ? "Confirmado" : "Calculado"}
                      >
                        {dot}
                      </span>{" "}
                      {bank}
                    </td>
                    <td data-label="Reservado" className="is-num">
                      {reserved}
                    </td>
                    <td data-label="Disponible" className="is-num">
                      {free}
                    </td>
                    <td data-label="Deuda de tarjetas" className="is-num">
                      {debt}
                    </td>
                    <td
                      data-label="Patrimonio"
                      className="is-num font-semibold"
                    >
                      {worth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="lab-muted text-xs">
              En Banco, un punto lleno indica un saldo confirmado y un punto
              hueco, un saldo calculado. Importes en UYU.
            </p>
          </StatPanel>
        </>
      )}
    </div>
  );
}

function Drilldown() {
  return (
    <div className="ui05-grid">
      <nav aria-label="Ruta del detalle" className="ui05-crumbs ui05-span-12">
        <a href={protoHref("estadisticas")}>Gastos por categoría</a>
        <Icon name="chevronRight" duotone={false} className="size-3.5" />
        <span aria-current="page">Alimentación</span>
      </nav>
      <section className="lab-panel ui05-span-5" aria-labelledby="sub-cat">
        <h2 id="sub-cat" className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="budgets" className="size-4.5" />
          </span>
          Subcategorías
        </h2>
        <p className="text-[28px] font-bold tracking-[-0.03em] tabular-nums">
          {m("18640.00")}
        </p>
        <HBars
          items={[
            {
              label: "Supermercado",
              value: m("11930.00"),
              ratio: 0.64,
              color: "#3987e5",
            },
            {
              label: "Restaurantes",
              value: m("4520.00"),
              ratio: 0.24,
              color: "#199e70",
            },
            {
              label: "Delivery",
              value: m("2190.00"),
              ratio: 0.12,
              color: "#c98500",
            },
          ]}
        />
      </section>
      <section
        className="lab-panel lab-panel--dense ui05-span-7"
        aria-labelledby="mov-cifra"
      >
        <header className="lab-panel__head px-5 pt-5">
          <h2 id="mov-cifra" className="lab-panel__title">
            Movimientos que explican la cifra
          </h2>
          <span className="lab-muted text-xs">23 movimientos</span>
        </header>
        <div className="px-5 pb-4">
          <table className="ui05-table ui05-table--stack">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Medio</th>
                <th className="is-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "14/11",
                  "Supermercado Central",
                  "Supermercado",
                  "Visa Oro",
                  "2.140,00 UYU",
                ],
                [
                  "12/11",
                  "Parrilla del Puerto",
                  "Restaurantes",
                  "Débito",
                  "1.860,00 UYU",
                ],
                [
                  "09/11",
                  "Feria vecinal",
                  "Supermercado",
                  "Débito",
                  "980,00 UYU",
                ],
                [
                  "07/11",
                  "Pedidos en casa",
                  "Delivery",
                  "Master Black",
                  "760,00 UYU",
                ],
                [
                  "03/11",
                  "Supermercado Central",
                  "Supermercado",
                  "Visa Oro",
                  "3.420,00 UYU",
                ],
              ].map(([date, concept, sub, method, amount]) => (
                <tr key={date + concept}>
                  <td data-label="Fecha" className="lab-muted">
                    {date}
                  </td>
                  <td data-label="Concepto">
                    <a href="#" className="font-medium hover:underline">
                      {concept}
                    </a>
                    <span className="lab-muted block text-xs">{sub}</span>
                  </td>
                  <td data-label="Medio" className="lab-muted text-[13px]">
                    {method}
                  </td>
                  <td className="is-num font-semibold">−{amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav
            aria-label="Páginas de movimientos"
            className="ui05-actions mt-3 justify-end"
          >
            <button type="button" className={buttonClass("outline")} disabled>
              Página anterior
            </button>
            <button type="button" className={buttonClass("outline")}>
              Página siguiente
            </button>
          </nav>
        </div>
      </section>
    </div>
  );
}

export function StatisticsScreen({ state }: { state: ProtoState }) {
  const all = state === "todas" || state === "detalle";
  const head = (
    <PageHead
      eyebrow="General"
      title="Estadísticas"
      actions={
        <nav
          aria-label="Vistas de estadísticas"
          className="ui-segment ui05-viewtabs"
        >
          <a
            href={protoHref("estadisticas")}
            className="ui-segment__option"
            aria-current={!all ? "page" : undefined}
          >
            Mis favoritos
          </a>
          <a
            href={protoHref("estadisticas", "todas")}
            className="ui-segment__option"
            aria-current={all ? "page" : undefined}
          >
            Todas las estadísticas
          </a>
        </nav>
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar las estadísticas." />
      </Screen>
    );
  if (state === "sin-favoritos")
    return (
      <Screen>
        {head}
        <EmptyState
          icon="stats"
          title="Todavía no elegiste estadísticas favoritas"
          actions={
            <a
              href={protoHref("estadisticas", "todas")}
              className={buttonClass("primary")}
            >
              Explorar estadísticas
            </a>
          }
        >
          Marcá con una estrella las estadísticas que querés ver al entrar.
          Siempre podés volver a «Todas las estadísticas».
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      <Filters detail={state === "detalle"} />
      {state === "detalle" ? <Drilldown /> : <Charts all={all} />}
    </Screen>
  );
}

/* ================================ Informes ================================ */

export function ReportsScreen({ state }: { state: ProtoState }) {
  return (
    <Screen>
      <PageHead
        eyebrow="General"
        title="Informes"
        description="Descargá tus estadísticas en CSV, Excel o PDF."
      />
      <div className="ui05-grid">
        <div className="ui05-span-7 ui05-stack">
          <FormPanel
            labelId="exportar"
            title="Exportar informe del período"
            description="Elegí las fechas y el formato. El resumen compara dos tramos dentro del período seleccionado."
            foot={
              <button type="button" className={buttonClass("primary")}>
                <Icon name="reports" duotone={false} className="size-4" />
                Exportar PDF
              </button>
            }
          >
            <div className="ui05-form__grid">
              <Field label="Desde">
                <Input type="date" defaultValue="2026-10-01" />
              </Field>
              <Field label="Hasta">
                <Input type="date" defaultValue="2026-11-15" />
              </Field>
            </div>
            <fieldset className="ui05-form__section">
              <legend className="ui05-form__section-title">Formato</legend>
              <div className="ui05-choice">
                {[
                  [
                    "CSV",
                    "Texto plano UTF-8, apto para Excel y hojas de cálculo.",
                  ],
                  [
                    "Excel",
                    "Libro .xlsx con una hoja por sección del informe.",
                  ],
                  ["PDF", "Documento paginado para archivo o impresión."],
                ].map(([label, desc]) => (
                  <label key={label}>
                    <input
                      type="radio"
                      name="formato"
                      defaultChecked={label === "PDF"}
                    />
                    <span>
                      <strong className="block">{label}</strong>
                      <span className="ui05-hint">{desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {state === "error" && (
              <div className="b-notice b-notice--critical" role="alert">
                <Icon name="alert" className="size-4.5 shrink-0" />
                <p className="min-w-0 text-sm font-medium">
                  No se pudo generar el informe. Volvé a intentarlo.
                </p>
              </div>
            )}
          </FormPanel>
        </div>
        <section
          className="lab-panel ui05-span-5"
          aria-labelledby="contenido-informe"
        >
          <h2 id="contenido-informe" className="lab-panel__title">
            <span className="lab-panel__icon">
              <Icon name="reports" className="size-4.5" />
            </span>
            Contenido del informe
          </h2>
          <p className="lab-muted text-sm">
            Secciones y columnas incluidas en todos los formatos. Los importes
            se exportan como texto decimal exacto, sin redondeos.
          </p>
          <div className="ui05-accordion">
            {REPORT_SECTIONS.map((section, index) => (
              <details key={section.id} open={index === 0}>
                <summary>
                  {section.title}
                  <Icon name="chevronDown" duotone={false} className="size-4" />
                </summary>
                <div className="ui05-accordion__body">
                  <p>{section.description}</p>
                  <p className="text-[13px] text-[var(--glaciar-text)]">
                    {section.columns.map((column) => column.label).join(" · ")}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Screen>
  );
}
