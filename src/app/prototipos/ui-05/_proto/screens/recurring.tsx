import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented, SegmentedOption } from "@/components/ui/segmented";
import {
  EmptyState,
  ErrorState,
  FormPanel,
  PageHead,
  Review,
  Screen,
  StateTag,
  m,
} from "../kit";
import { protoHref, type ProtoState } from "../screens";

type Series = {
  id: string;
  concept: string;
  kind: "expense" | "income";
  detail: string;
  amount: string;
  currency: "UYU" | "USD";
  period: [tone: "good" | "warning" | "neutral" | "critical", label: string];
  series: [tone: "good" | "neutral", label: string];
  selected?: boolean;
};

const series: Series[] = [
  {
    id: "alquiler",
    concept: "Alquiler",
    kind: "expense",
    detail: "Mensual · vence el día 10 · Hogar",
    amount: "28000.00",
    currency: "UYU",
    period: ["warning", "Pago parcial"],
    series: ["good", "Activa"],
    selected: true,
  },
  {
    id: "sueldo",
    concept: "Sueldo",
    kind: "income",
    detail: "Mensual · fecha aproximada día 1 · Sueldo",
    amount: "92000.00",
    currency: "UYU",
    period: ["good", "Cobrado completo"],
    series: ["good", "Activa"],
  },
  {
    id: "luz",
    concept: "Luz y agua",
    kind: "expense",
    detail: "Mensual · vence el día 18 · Servicios · compartida",
    amount: "3400.00",
    currency: "UYU",
    period: ["neutral", "Sin pago confirmado"],
    series: ["good", "Activa"],
  },
  {
    id: "streaming",
    concept: "Suscripción streaming",
    kind: "expense",
    detail: "Mensual · Visa Oro · Suscripciones",
    amount: "12.50",
    currency: "USD",
    period: ["good", "Pagado"],
    series: ["good", "Activa"],
  },
  {
    id: "seguro",
    concept: "Seguro del auto",
    kind: "expense",
    detail: "Trimestral · vence el día 20",
    amount: "9600.00",
    currency: "UYU",
    period: ["neutral", "No corresponde pagar"],
    series: ["neutral", "Pausada"],
  },
];

function SeriesList() {
  return (
    <section className="lab-panel" aria-labelledby="recurrencias">
      <header className="lab-panel__head">
        <h2 id="recurrencias" className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="recurring" className="size-4.5" />
          </span>
          Recurrencias guardadas
        </h2>
        <span className="lab-muted text-xs">Período actual: noviembre</span>
      </header>
      <ul className="ui05-rows ui05-rows--select">
        {series.map((item) => (
          <li key={item.id} aria-current={item.selected ? "true" : undefined}>
            <span
              className={`lab-kind lab-kind--${item.kind}`}
              aria-hidden="true"
            >
              <Icon name={item.kind} duotone={false} className="size-4" />
            </span>
            <div className="ui05-row__main">
              <a
                href={protoHref("recurrentes")}
                className="ui05-row__title hover:underline"
              >
                {item.concept}
              </a>
              <p className="ui05-row__sub">{item.detail}</p>
            </div>
            <div className="ui05-row__aside">
              <span
                className={`ui05-row__amount ${item.kind === "income" ? "is-positive" : ""}`}
              >
                {item.kind === "income" ? "+" : ""}
                {m(item.amount, item.currency)}
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {item.series[1] === "Pausada" && (
                  <StateTag tone="neutral">Pausada</StateTag>
                )}
                <StateTag tone={item.period[0]}>{item.period[1]}</StateTag>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeriesDetail({ settling }: { settling: boolean }) {
  return (
    <section className="lab-panel c-feature" aria-labelledby="detalle-serie">
      <header className="lab-panel__head">
        <h2 id="detalle-serie" className="lab-panel__title">
          <span className="lab-kind lab-kind--expense" aria-hidden="true">
            <Icon name="expense" duotone={false} className="size-4" />
          </span>
          Alquiler
        </h2>
        <StateTag tone="good">Activa</StateTag>
      </header>
      <dl className="ui05-review">
        <div>
          <dt>Importe de referencia</dt>
          <dd>{m("28000.00")}</dd>
        </div>
        <div>
          <dt>Vencimiento habitual</dt>
          <dd>Día 10 de cada mes</dd>
        </div>
        <div>
          <dt>Primer período</dt>
          <dd>Marzo 2026</dd>
        </div>
        <div>
          <dt>Categoría</dt>
          <dd>Hogar</dd>
        </div>
      </dl>
      <div className="ui05-actions">
        <button type="button" className={buttonClass("ghost")}>
          Editar día de vencimiento
        </button>
        <button type="button" className={buttonClass("ghost")}>
          Pausar serie
        </button>
      </div>
      <h3 className="ui05-form__section-title pt-2">Seguimiento por período</h3>
      <ol className="ui05-timeline">
        <li>
          <span className="ui05-timeline__dot is-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Noviembre 2026 ·{" "}
              <span className="text-[var(--state-warning)]">Pago parcial</span>
            </p>
            <p className="lab-muted text-xs">
              Vencimiento previsto 10/11 · Pagado a la fecha {m("14000.00")} ·
              Restante {m("14000.00")}
            </p>
            {!settling && (
              <div className="ui05-actions mt-2">
                <a
                  href={protoHref("recurrentes", "periodo")}
                  className={buttonClass("primary")}
                >
                  Completar pago
                </a>
                <button type="button" className={buttonClass("outline")}>
                  Vincular movimiento registrado
                </button>
                <button type="button" className={buttonClass("ghost")}>
                  Omitir este período
                </button>
              </div>
            )}
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {m("28000.00")}
          </span>
        </li>
        <li>
          <span className="ui05-timeline__dot" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Octubre 2026 · Pagado</p>
            <p className="lab-muted text-xs">
              Transferencia bancaria · 09/10 · 1 movimiento vinculado
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {m("28000.00")}
          </span>
        </li>
        <li>
          <span className="ui05-timeline__dot" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Septiembre 2026 · Pagado</p>
            <p className="lab-muted text-xs">Débito bancario · 10/09</p>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {m("27500.00")}
          </span>
        </li>
      </ol>
      <a href="#" className="lab-link">
        Períodos anteriores
        <Icon name="chevronRight" duotone={false} className="size-3.5" />
      </a>
    </section>
  );
}

function SettlementForm() {
  return (
    <FormPanel
      labelId="form-periodo"
      title="Completar pago · Alquiler · noviembre"
      description="Registra un movimiento real en Historial y lo vincula a este período."
      onCloseHref={protoHref("recurrentes")}
      foot={
        <>
          <a href={protoHref("recurrentes")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Registrar pago
          </button>
        </>
      }
    >
      <div className="ui05-form__grid ui05-form__grid--3">
        <Field label="Fecha real de pago">
          <Input type="date" defaultValue="2026-11-14" />
        </Field>
        <Field label="Importe pagado">
          <Input inputMode="decimal" defaultValue="14000" />
        </Field>
        <Field label="Medio de pago">
          <Select defaultValue="Transferencia bancaria">
            <option>Débito bancario</option>
            <option>Transferencia bancaria</option>
            <option>Tarjeta de crédito</option>
          </Select>
        </Field>
      </div>
      <label className="ui05-check">
        <input type="checkbox" defaultChecked />
        Con esto queda pagado el período
      </label>
      <Review
        rows={[
          ["Pagado a la fecha", m("14000.00")],
          ["Este pago", m("14000.00")],
          ["Restante después", m("0.00")],
        ]}
      />
    </FormPanel>
  );
}

function RecurrenceForm() {
  return (
    <FormPanel
      labelId="form-recurrencia"
      title="Nueva recurrencia"
      onCloseHref={protoHref("recurrentes")}
      foot={
        <>
          <a href={protoHref("recurrentes")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Guardar recurrencia
          </button>
        </>
      }
    >
      <div className="ui05-form__grid">
        <div className="ui-field">
          <span className="ui-field__label">Tipo</span>
          <Segmented label="Tipo" className="self-start">
            <SegmentedOption pressed>Gasto</SegmentedOption>
            <SegmentedOption pressed={false}>Ingreso</SegmentedOption>
          </Segmented>
        </div>
        <Field label="Concepto">
          <Input defaultValue="Gimnasio" />
        </Field>
        <Field label="Categoría">
          <Select defaultValue="Salud">
            <option>Salud</option>
            <option>Hogar</option>
          </Select>
        </Field>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <div className="ui-field">
            <span className="ui-field__label">Moneda</span>
            <Segmented label="Moneda">
              <SegmentedOption pressed>UYU</SegmentedOption>
              <SegmentedOption pressed={false}>USD</SegmentedOption>
              <SegmentedOption pressed={false}>EUR</SegmentedOption>
            </Segmented>
          </div>
          <Field label="Importe de referencia (opcional)">
            <Input inputMode="decimal" defaultValue="1900" />
          </Field>
        </div>
        <Field label="Frecuencia">
          <Select defaultValue="Mensual">
            <option>Semanal</option>
            <option>Mensual</option>
            <option>Trimestral</option>
            <option>Anual</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Comienza en">
            <Input type="month" defaultValue="2026-12" />
          </Field>
          <Field label="Finaliza el (opcional)">
            <Input type="date" />
          </Field>
        </div>
      </div>
      <fieldset className="ui05-form__section">
        <legend className="ui05-form__section-title">Vencimiento</legend>
        <div className="ui05-choice">
          {[
            ["Sin fecha", "Solo se sigue por período."],
            ["Fecha aproximada", "Avisos orientativos."],
            ["Fecha exacta", "Día habitual desde el segundo período."],
          ].map(([label, hint], index) => (
            <label key={label}>
              <input
                type="radio"
                name="vencimiento"
                defaultChecked={index === 2}
              />
              <span>
                <strong className="block">{label}</strong>
                <span className="ui05-hint">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="ui05-form__grid">
        <label className="ui05-check">
          <input type="checkbox" />
          Compartida
        </label>
        <Field label="Nota (opcional)" className="ui05-form__full">
          <Textarea rows={2} />
        </Field>
      </div>
    </FormPanel>
  );
}

export function RecurringScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Planificación"
      title="Recurrentes"
      description="Gastos e ingresos que se repiten, con seguimiento de cada período."
      actions={
        state !== "error" && (
          <a
            href={protoHref("recurrentes", "formulario")}
            className={buttonClass("primary")}
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Nueva recurrencia
          </a>
        )
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tus recurrencias. Volvé a intentarlo." />
      </Screen>
    );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        <EmptyState
          icon="recurring"
          title="Todavía no tenés recurrencias"
          actions={
            <a
              href={protoHref("recurrentes", "formulario")}
              className={buttonClass("primary")}
            >
              <Icon name="plus" duotone={false} className="size-4" />
              Nueva recurrencia
            </a>
          }
        >
          Para conceptos que se repiten, como alquiler o sueldo. Cada período se
          confirma con un movimiento real; nada se registra solo.
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      {state === "formulario" && <RecurrenceForm />}
      {state === "periodo" && <SettlementForm />}
      <div className="ui05-grid">
        <div className="ui05-span-7">
          <SeriesList />
        </div>
        <div className="ui05-span-5">
          <SeriesDetail settling={state === "periodo"} />
        </div>
      </div>
    </Screen>
  );
}
