import { ProgressRing } from "@/components/glaciar-summary/charts";
import { Panel } from "@/components/glaciar-summary/panel";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented, SegmentedOption } from "@/components/ui/segmented";
import {
  Effects,
  EmptyState,
  ErrorState,
  FormPanel,
  Kpi,
  PageHead,
  Review,
  Screen,
  StateTag,
  m,
} from "../kit";
import { protoHref, type ProtoState } from "../screens";

/* ============================ Fondos de ahorro ============================ */

const fundColors = ["#3987e5", "#199e70", "#c98500", "#9085e9"];

const funds = [
  {
    id: "emergencia",
    name: "Fondo de emergencia",
    currency: "UYU" as const,
    saved: "96000.00",
    target: "150000.00",
    ratio: 0.64,
    date: "30/06/2027",
    state: ["good", "Activo"] as const,
    plan: "Día 5 · 6.000,00 UYU · próxima 05/12",
    committed: null,
  },
  {
    id: "viaje",
    name: "Viaje a Japón",
    currency: "USD" as const,
    saved: "2180.00",
    target: "4000.00",
    ratio: 0.545,
    date: "15/03/2027",
    state: ["good", "Activo"] as const,
    plan: "Día 1 · 300,00 USD · próxima 01/12",
    committed: "420.00",
  },
  {
    id: "auto",
    name: "Service del auto",
    currency: "UYU" as const,
    saved: "18000.00",
    target: "18000.00",
    ratio: 1,
    date: null,
    state: ["good", "Meta alcanzada"] as const,
    plan: "Aportaciones automáticas pausadas por meta",
    committed: null,
  },
  {
    id: "regalos",
    name: "Regalos de fin de año",
    currency: "UYU" as const,
    saved: "4500.00",
    target: null,
    ratio: null,
    date: null,
    state: ["neutral", "Pausado"] as const,
    plan: "Sin aportaciones programadas",
    committed: null,
  },
];

function FundCard({
  fund,
  index,
}: {
  fund: (typeof funds)[number];
  index: number;
}) {
  const pct = fund.ratio === null ? null : `${Math.round(fund.ratio * 100)} %`;
  return (
    <li className="lab-panel" id={`fondo-${fund.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold wrap-anywhere">
            {fund.name}
          </h3>
          <p className="lab-muted text-xs">{fund.currency}</p>
        </div>
        <StateTag tone={fund.state[0]}>{fund.state[1]}</StateTag>
      </div>
      <div className="flex items-center gap-4">
        {fund.ratio !== null ? (
          <ProgressRing
            value={fund.ratio}
            color={fundColors[index % 4]}
            size={76}
            stroke={7}
          >
            {pct}
          </ProgressRing>
        ) : (
          <span
            className="ui05-empty__icon m-0 size-[76px]! rounded-full!"
            aria-hidden="true"
          >
            <Icon name="funds" className="size-6" />
          </span>
        )}
        <div className="min-w-0">
          <p className="lab-muted text-xs font-semibold">Reservado</p>
          <p className="text-[22px] font-bold tracking-[-0.03em] tabular-nums wrap-anywhere">
            {m(fund.saved, fund.currency)}
          </p>
          <p className="lab-muted text-xs tabular-nums">
            {fund.target ? `Meta ${m(fund.target, fund.currency)}` : "Sin meta"}
            {fund.date && ` · ${fund.date}`}
          </p>
        </div>
      </div>
      {fund.committed && (
        <dl className="ui05-review">
          <div>
            <dt>Comprometido con tarjeta</dt>
            <dd>{m(fund.committed, fund.currency)}</dd>
          </div>
          <div>
            <dt>Reserva sin comprometer</dt>
            <dd>{m("1760.00", fund.currency)}</dd>
          </div>
        </dl>
      )}
      <p className="lab-muted flex items-center gap-2 text-xs">
        <Icon name="recurring" duotone={false} className="size-3.5 shrink-0" />
        {fund.plan}
      </p>
      <div className="ui05-actions">
        <a
          href={protoHref("fondos", "operacion")}
          className={buttonClass("outline")}
        >
          Reservar
        </a>
        <button type="button" className={buttonClass("ghost")}>
          Liberar
        </button>
        <button type="button" className={buttonClass("ghost")}>
          Traspasar
        </button>
        <a
          href={protoHref("fondos", "formulario")}
          className="ui-icon-btn ml-auto"
          aria-label={`Editar ${fund.name}`}
        >
          <Icon name="more" duotone={false} />
        </a>
      </div>
    </li>
  );
}

function Contributions() {
  return (
    <Panel title="Aportaciones" icon="recurring">
      <ol className="ui05-timeline">
        <li>
          <span className="ui05-timeline__dot is-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Fondo de emergencia · noviembre
            </p>
            <p className="lab-muted text-xs">
              Pendiente · No había suficiente dinero disponible.
            </p>
            <div className="ui05-actions mt-2">
              <button type="button" className={buttonClass("outline")}>
                Completar aportación
              </button>
              <button type="button" className={buttonClass("ghost")}>
                Posponer
              </button>
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {m("6000.00")}
          </span>
        </li>
        <li>
          <span className="ui05-timeline__dot" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Viaje a Japón · noviembre</p>
            <p className="lab-muted text-xs">Completada el 01/11</p>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {m("300.00", "USD")}
          </span>
        </li>
        <li>
          <span className="ui05-timeline__dot is-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Fondo de emergencia · octubre
            </p>
            <p className="lab-muted text-xs">Descartada</p>
          </div>
          <span className="lab-muted text-sm tabular-nums">{m("6000.00")}</span>
        </li>
      </ol>
      <a href="#" className="lab-link">
        Historial de aportaciones
        <Icon name="chevronRight" duotone={false} className="size-3.5" />
      </a>
    </Panel>
  );
}

function ReserveConfirm() {
  return (
    <FormPanel
      labelId="form-reserva"
      title="Reservar en Viaje a Japón"
      description="Una reserva virtual no mueve Bancos ni crea gastos o ingresos."
      onCloseHref={protoHref("fondos")}
      foot={
        <>
          <span className="ui05-hint">Paso 2 de 2 · Confirmar</span>
          <button type="button" className={buttonClass("ghost")}>
            Modificar
          </button>
          <button type="button" className={buttonClass("primary")}>
            Confirmar operación
          </button>
        </>
      }
    >
      <Review
        rows={[
          ["Operación", "Reservar"],
          ["Fondo de destino", "Viaje a Japón · USD"],
          ["Importe", m("300.00", "USD")],
          ["Disponible libre después", m("940.00", "USD")],
          ["Reservado después", m("2480.00", "USD")],
        ]}
      />
      <Effects
        items={[
          "Baja el disponible libre en USD y sube lo reservado en el fondo.",
          "Tu saldo en Bancos no cambia.",
          "No se registra como gasto ni ingreso.",
        ]}
      />
    </FormPanel>
  );
}

function FundForm() {
  return (
    <FormPanel
      labelId="form-fondo"
      title="Crear fondo"
      description="Cada fondo tiene una sola moneda. Podés agregar una meta y una fecha objetivo cuando quieras."
      onCloseHref={protoHref("fondos")}
      foot={
        <>
          <a href={protoHref("fondos")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Crear fondo
          </button>
        </>
      }
    >
      <div className="ui05-form__grid">
        <Field label="Nombre">
          <Input defaultValue="Mudanza" />
        </Field>
        <div className="ui-field">
          <span className="ui-field__label">Moneda</span>
          <Segmented label="Moneda" className="self-start">
            <SegmentedOption pressed>UYU</SegmentedOption>
            <SegmentedOption pressed={false}>USD</SegmentedOption>
            <SegmentedOption pressed={false}>EUR</SegmentedOption>
          </Segmented>
        </div>
        <Field label="Meta (opcional)">
          <Input inputMode="decimal" placeholder="0,00" />
        </Field>
        <Field label="Fecha objetivo (opcional)">
          <Input type="date" />
        </Field>
      </div>
      <p className="ui05-hint">
        Dejalos vacíos para quitar la meta o la fecha. Cambiarlos no mueve
        dinero ni altera las reservas.
      </p>
    </FormPanel>
  );
}

export function FundsScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Planificación"
      title="Fondos de ahorro"
      description="Organizá reservas virtuales por moneda sin mover el saldo bancario."
      actions={
        state !== "error" && (
          <a
            href={protoHref("fondos", "formulario")}
            className={buttonClass("primary")}
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Agregar fondo
          </a>
        )
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tus fondos. Volvé a intentarlo." />
      </Screen>
    );
  const kpis = (
    <div className="ui05-kpis" aria-label="Disponible libre por moneda">
      <Kpi
        hero
        icon="funds"
        label="Equivalencia del total reservado"
        value={<>≈ {m("199540.00")}</>}
        sub="Cotizaciones de referencia · no convierte tu dinero"
        help={{
          label: "Ayuda: Equivalencia del total reservado",
          text: "Es el valor aproximado en pesos uruguayos de todo el dinero reservado en tus fondos de ahorro activos, incluyendo pesos, dólares y euros. Se calcula con las cotizaciones de referencia; no convierte tu dinero.",
        }}
      />
      <Kpi
        label="Disponible libre · UYU"
        value={m("54310.00")}
        help={{
          label: "Ayuda: Disponible libre en pesos uruguayos",
          text: "Es el dinero en pesos uruguayos que tenés en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro.",
        }}
      />
      <Kpi
        label="Disponible libre · USD"
        value={m("1240.00", "USD")}
        help={{
          label: "Ayuda: Disponible libre en dólares",
          text: "Es el dinero en dólares que tenés en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro.",
        }}
      />
      <Kpi
        label="Disponible libre · EUR"
        value="Sin saldo bancario"
        sub="Configurá el saldo en Resumen"
        help={{
          label: "Ayuda: Disponible libre en euros",
          text: "Es el dinero en euros que tenés en tus cuentas bancarias y que no está reservado en ningún fondo de ahorro.",
        }}
      />
    </div>
  );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        {kpis}
        <EmptyState
          icon="funds"
          title="Todavía no tenés fondos de ahorro"
          actions={
            <a
              href={protoHref("fondos", "formulario")}
              className={buttonClass("primary")}
            >
              <Icon name="plus" duotone={false} className="size-4" />
              Crear fondo
            </a>
          }
        >
          Un fondo separa una parte de tu disponible para una meta. Es una
          reserva virtual: no mueve Bancos ni crea gastos o ingresos.
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      {kpis}
      {state === "operacion" && <ReserveConfirm />}
      {state === "formulario" && <FundForm />}
      <div className="ui05-grid">
        <section
          className="ui05-span-8 ui05-stack"
          aria-labelledby="fondos-activos"
        >
          <h2 id="fondos-activos" className="lab-panel__title">
            Tus fondos
            <span className="lab-tag lab-tag--neutral">4</span>
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {funds.map((fund, index) => (
              <FundCard key={fund.id} fund={fund} index={index} />
            ))}
          </ul>
        </section>
        <div className="ui05-span-4 ui05-stack">
          <Contributions />
          <details className="lab-panel">
            <summary className="lab-panel__title cursor-pointer list-none">
              Fondos cerrados
              <span className="lab-tag lab-tag--neutral">1</span>
            </summary>
            <p className="lab-muted mt-2 text-sm">
              Vacaciones 2025 · UYU · historial consultable.
            </p>
          </details>
        </div>
      </div>
    </Screen>
  );
}

/* ============================== Presupuestos ============================== */

type BudgetRow = {
  name: string;
  sub?: boolean;
  spent: string | null;
  limit: string;
  percent: number | null;
  tone: "good" | "warning" | "critical";
  label: string;
  exception?: string;
};

const budgets: BudgetRow[] = [
  {
    name: "Alimentación",
    spent: "12840.00",
    limit: "15000.00",
    percent: 86,
    tone: "warning",
    label: "Cerca",
    exception: "Límite solo noviembre · habitual 10.000,00 UYU",
  },
  {
    name: "Supermercado",
    sub: true,
    spent: "9320.00",
    limit: "11000.00",
    percent: 85,
    tone: "warning",
    label: "Cerca",
  },
  {
    name: "Restaurantes",
    sub: true,
    spent: "3520.00",
    limit: "3000.00",
    percent: 117,
    tone: "critical",
    label: "Excedido",
  },
  {
    name: "Transporte",
    spent: "2310.00",
    limit: "6000.00",
    percent: 39,
    tone: "good",
    label: "En rango",
  },
  {
    name: "Hogar",
    spent: "7850.00",
    limit: "12000.00",
    percent: 65,
    tone: "good",
    label: "En rango",
  },
  {
    name: "Salud",
    spent: "1200.00",
    limit: "5000.00",
    percent: 24,
    tone: "good",
    label: "En rango",
  },
  {
    name: "Suscripciones",
    spent: null,
    limit: "60.00",
    percent: null,
    tone: "good",
    label: "",
  },
];

function BudgetItemRow({ row }: { row: BudgetRow }) {
  const currency = row.name === "Suscripciones" ? "USD" : "UYU";
  return (
    <li
      className={
        row.sub
          ? "ml-5 border-l border-[var(--glaciar-border-strong)] pl-4"
          : ""
      }
    >
      <div className="lab-budgets__head">
        <span className="min-w-0 font-medium wrap-anywhere">
          {row.name}
          {row.sub && (
            <span className="lab-muted text-xs font-normal">
              {" "}
              · subcategoría
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {row.percent !== null ? (
            <StateTag tone={row.tone}>{row.label}</StateTag>
          ) : (
            <StateTag tone="neutral">Falta cotización</StateTag>
          )}
          <details className="ui05-menu ui05-menu--panel">
            <summary aria-label={`Acciones de ${row.name}`}>
              <Icon name="more" duotone={false} className="size-4" />
            </summary>
            <div className="ui05-menu__list">
              <a href={protoHref("presupuestos", "formulario")}>
                Editar límite habitual
              </a>
              <a href={protoHref("presupuestos", "formulario")}>
                Cambiar límite solo este mes
              </a>
              <button type="button">Quitar presupuesto</button>
            </div>
          </details>
        </span>
      </div>
      {row.percent !== null && (
        <div
          className={`lab-meter lab-meter--${row.tone}`}
          role="meter"
          aria-label={row.name}
          aria-valuetext={`${row.percent} % del presupuesto`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, row.percent)}
        >
          <span style={{ width: `${Math.min(100, row.percent)}%` }} />
        </div>
      )}
      <p className="lab-budgets__foot flex-wrap">
        <span className="tabular-nums">
          {row.spent ? m(row.spent, currency) : "Consumo sin calcular"}
        </span>
        <span className="lab-muted tabular-nums">
          {row.spent ? "de " : "Límite "}
          {m(row.limit, currency)}
          {row.percent !== null && ` · ${row.percent} %`}
        </span>
      </p>
      {row.exception && (
        <p className="lab-muted mt-1 text-xs">{row.exception}</p>
      )}
      {row.percent === null && (
        <a href="#cotizacion" className="lab-link mt-1">
          Agregar cotización manual
          <Icon name="chevronRight" duotone={false} className="size-3.5" />
        </a>
      )}
    </li>
  );
}

function BudgetForm() {
  return (
    <FormPanel
      labelId="form-presupuesto"
      title="Crear presupuesto"
      description="El límite rige desde este mes. Los gastos de subcategorías también consumen el límite de la categoría general."
      onCloseHref={protoHref("presupuestos")}
      foot={
        <>
          <a href={protoHref("presupuestos")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Guardar
          </button>
        </>
      }
    >
      <div className="ui05-form__grid ui05-form__grid--3">
        <Field label="Categoría de gasto">
          <Select defaultValue="Educación">
            <option>Educación</option>
            <option>Ocio</option>
            <option>Mascotas</option>
          </Select>
        </Field>
        <div className="ui-field">
          <span className="ui-field__label">Moneda del límite</span>
          <Segmented label="Moneda del límite" className="self-start">
            <SegmentedOption pressed>UYU</SegmentedOption>
            <SegmentedOption pressed={false}>USD</SegmentedOption>
            <SegmentedOption pressed={false}>EUR</SegmentedOption>
          </Segmented>
        </div>
        <Field label="Límite mensual">
          <Input inputMode="decimal" defaultValue="4000" />
        </Field>
      </div>
      <fieldset className="ui05-form__section">
        <legend className="ui05-form__section-title">Alcance</legend>
        <div className="ui05-choice">
          <label>
            <input type="radio" name="alcance" defaultChecked />
            <span>
              <strong className="block">Límite habitual</strong>
              <span className="ui05-hint">
                Rige desde noviembre y los meses siguientes.
              </span>
            </span>
          </label>
          <label>
            <input type="radio" name="alcance" />
            <span>
              <strong className="block">Solo noviembre</strong>
              <span className="ui05-hint">
                En diciembre vuelve automáticamente al habitual.
              </span>
            </span>
          </label>
        </div>
      </fieldset>
    </FormPanel>
  );
}

export function BudgetsScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Planificación"
      title="Presupuestos"
      description="Límites mensuales opcionales por categoría, sin arrastre de saldos."
      actions={
        state !== "error" && (
          <>
            <div
              className="lab-stepper"
              role="group"
              aria-label="Mes del presupuesto"
            >
              <button
                type="button"
                className="lab-stepper__btn"
                aria-label="Mes anterior"
              >
                <Icon name="chevronLeft" duotone={false} className="size-4" />
              </button>
              <span className="lab-stepper__label">
                <Icon name="calendar" className="size-4" />
                Noviembre 2026
              </span>
              <button
                type="button"
                className="lab-stepper__btn"
                aria-label="Mes siguiente"
                disabled
              >
                <Icon name="chevronRight" duotone={false} className="size-4" />
              </button>
            </div>
            <a
              href={protoHref("presupuestos", "formulario")}
              className={buttonClass("primary")}
            >
              <Icon name="plus" duotone={false} className="size-4" />
              Crear presupuesto
            </a>
          </>
        )
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tus presupuestos. Volvé a intentarlo." />
      </Screen>
    );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        <EmptyState
          icon="budgets"
          title="Todavía no tenés presupuestos"
          actions={
            <a
              href={protoHref("presupuestos", "formulario")}
              className={buttonClass("primary")}
            >
              <Icon name="plus" duotone={false} className="size-4" />
              Crear presupuesto
            </a>
          }
        >
          Podés crear uno por categoría de gasto cuando quieras. Los avisos
          llegan al 80 % y al 100 % del límite.
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      {state === "formulario" && <BudgetForm />}
      <div
        className="ui05-kpis"
        aria-label="Estado de los presupuestos del mes"
      >
        <Kpi
          tone="good"
          icon="check"
          label="En rango"
          value="3"
          sub="presupuestos"
        />
        <Kpi
          tone="warning"
          icon="alert"
          label="Cerca del límite"
          value="2"
          sub="80 % o más"
        />
        <Kpi
          tone="critical"
          icon="alert"
          label="Excedidos"
          value="1"
          sub="100 % o más"
        />
        <Kpi
          icon="info"
          label="Sin calcular"
          value="1"
          sub="Falta cotización"
        />
      </div>
      <div className="ui05-grid">
        <section
          className="lab-panel ui05-span-8"
          aria-labelledby="consumo-mes"
        >
          <header className="lab-panel__head">
            <h2 id="consumo-mes" className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="budgets" className="size-4.5" />
              </span>
              Consumo del mes
            </h2>
            <span className="lab-muted text-xs">Noviembre 2026</span>
          </header>
          <ul className="lab-budgets">
            {budgets.map((row) => (
              <BudgetItemRow key={row.name} row={row} />
            ))}
          </ul>
        </section>
        <div className="ui05-span-4 ui05-stack">
          <section className="lab-panel" aria-label="Cómo funciona">
            <div className="b-notice b-notice--info">
              <Icon name="info" className="size-4.5 shrink-0" />
              <p className="min-w-0 text-sm">
                El seguimiento se reinicia cada mes sin arrastrar sobrantes ni
                excesos.
              </p>
            </div>
          </section>
          <section
            className="lab-panel"
            id="cotizacion"
            aria-labelledby="cotizacion-titulo"
          >
            <h2 id="cotizacion-titulo" className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="swap" duotone={false} className="size-4" />
              </span>
              Cotización manual para presupuestos
            </h2>
            <p className="lab-muted text-sm">
              Para gastos en otra moneda sin cotización de referencia. Las
              conversiones ya calculadas conservan su referencia.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Moneda de origen">
                <Select defaultValue="USD">
                  <option>USD</option>
                  <option>EUR</option>
                </Select>
              </Field>
              <Field label="Moneda de destino">
                <Select defaultValue="UYU">
                  <option>UYU</option>
                </Select>
              </Field>
              <Field label="Tasa de referencia">
                <Input inputMode="decimal" defaultValue="40,25" />
              </Field>
              <Field label="Fecha de cotización">
                <Input type="date" defaultValue="2026-11-03" />
              </Field>
            </div>
            <button type="button" className={buttonClass("outline")}>
              Guardar cotización manual
            </button>
          </section>
        </div>
      </div>
    </Screen>
  );
}
