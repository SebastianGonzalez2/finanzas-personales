import { Panel } from "@/components/glaciar-summary/panel";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented, SegmentedOption } from "@/components/ui/segmented";
import {
  EmptyState,
  ErrorState,
  FormPanel,
  Kpi,
  PageHead,
  Screen,
  StateTag,
  m,
} from "../kit";
import { protoHref, type ProtoState } from "../screens";

type DrawnCard = {
  id: string;
  name: string;
  issuer: string;
  kind: "credit" | "debit";
  rows: {
    currency: "UYU" | "USD";
    debt: string;
    favor?: string;
    limit?: string;
  }[];
  progress?: number;
  closes?: string;
  due?: string;
  plans?: number;
  teal?: boolean;
  archived?: boolean;
};

const cards: DrawnCard[] = [
  {
    id: "oro",
    name: "Visa Oro",
    issuer: "Banco Austral",
    kind: "credit",
    rows: [
      { currency: "UYU", debt: "18450.30", limit: "80000" },
      { currency: "USD", debt: "212.40", limit: "2500" },
    ],
    progress: 64,
    closes: "24/11",
    due: "05/12",
    plans: 2,
  },
  {
    id: "black",
    name: "Master Black",
    issuer: "Banco Ribera",
    kind: "credit",
    rows: [
      { currency: "UYU", debt: "6120.00" },
      { currency: "USD", debt: "0.00", favor: "15.00" },
    ],
    progress: 31,
    closes: "02/12",
    due: "14/12",
    teal: true,
  },
  {
    id: "debito",
    name: "Débito Austral",
    issuer: "Banco Austral",
    kind: "debit",
    rows: [],
  },
];

function CardTile({ card }: { card: DrawnCard }) {
  const credit = card.kind === "credit";
  return (
    <li
      className={`b-card ${card.teal ? "b-card--teal" : ""} ${credit ? "" : "ui05-card--debit"} ${card.archived ? "ui05-card--archived" : ""}`}
    >
      <div className="relative z-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold wrap-anywhere">{card.name}</p>
          <p className="ui05-card__issuer">{card.issuer}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="ui05-card__kind">
            {credit ? "Crédito" : "Débito"}
          </span>
          <span className="b-card__chip" aria-hidden="true" />
        </div>
      </div>
      {credit ? (
        <dl className="relative z-1 grid gap-1">
          {card.rows.map((row) => (
            <div
              key={row.currency}
              className="flex flex-wrap items-baseline justify-between gap-x-3"
            >
              <dt className="sr-only">Deuda registrada en {row.currency}</dt>
              <dd className="b-card__debt tabular-nums">
                <span>{m(row.debt, row.currency)}</span>
              </dd>
              <dd className="ui05-card__limit tabular-nums">
                {row.favor
                  ? `Saldo a favor ${m(row.favor, row.currency)}`
                  : row.limit
                    ? `Límite ${m(row.limit, row.currency)}`
                    : ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="relative z-1 text-sm text-white/80">
          Vinculada a Bancos por moneda · UYU · USD
        </p>
      )}
      {card.progress !== undefined && (
        <div
          className="b-card__cycle relative z-1"
          role="progressbar"
          aria-label="Avance del ciclo"
          aria-valuenow={card.progress}
        >
          <span style={{ width: `${card.progress}%` }} />
        </div>
      )}
      {credit && (
        <p className="relative z-1 flex flex-wrap justify-between gap-x-2 text-xs text-white/80">
          <span>Cierra {card.closes}</span>
          <span>Vence {card.due}</span>
        </p>
      )}
      <div className="ui05-card__actions">
        {credit && (
          <a href={protoHref("tarjeta-ciclo")}>
            Resúmenes y ciclos
            <Icon name="chevronRight" duotone={false} className="size-3.5" />
          </a>
        )}
        {credit ? (
          <>
            <a href={protoHref("tarjeta-ciclo", "pago")}>Registrar pago</a>
            <details className="ui05-menu">
              <summary aria-label={`Más acciones de ${card.name}`}>
                <Icon name="more" duotone={false} className="size-4" />
              </summary>
              <div className="ui05-menu__list">
                <button type="button">Registrar compra</button>
                <button type="button">Actualizar deuda</button>
                <a href={protoHref("tarjetas", "formulario")}>Editar tarjeta</a>
              </div>
            </details>
          </>
        ) : (
          <a
            href={protoHref("tarjetas", "formulario")}
            aria-label={`Editar ${card.name}`}
          >
            Editar
          </a>
        )}
      </div>
    </li>
  );
}

function CardForm() {
  return (
    <FormPanel
      labelId="form-tarjeta"
      title="Agregar tarjeta"
      description="Las tarjetas de crédito registran deuda por moneda; las de débito quedan vinculadas a Bancos."
      onCloseHref={protoHref("tarjetas")}
      foot={
        <>
          <a href={protoHref("tarjetas")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Guardar tarjeta
          </button>
        </>
      }
    >
      <div className="ui05-form__grid">
        <Field label="Nombre">
          <Input defaultValue="Visa Oro" />
        </Field>
        <Field label="Emisor (opcional)">
          <Input defaultValue="Banco Austral" />
        </Field>
        <div className="ui-field">
          <span className="ui-field__label">Tipo de tarjeta</span>
          <Segmented label="Tipo de tarjeta" className="self-start">
            <SegmentedOption pressed={false}>Débito</SegmentedOption>
            <SegmentedOption pressed>Crédito</SegmentedOption>
          </Segmented>
        </div>
        <div className="ui-field">
          <span className="ui-field__label">Monedas</span>
          <Segmented label="Monedas" className="self-start">
            <SegmentedOption pressed>UYU</SegmentedOption>
            <SegmentedOption pressed>USD</SegmentedOption>
            <SegmentedOption pressed={false}>EUR</SegmentedOption>
          </Segmented>
        </div>
      </div>
      {(["UYU", "USD"] as const).map((currency) => (
        <fieldset key={currency} className="ui05-form__section">
          <legend className="ui05-form__section-title">{currency}</legend>
          <div className="ui05-form__grid ui05-form__grid--3">
            <Field label="Límite (opcional)">
              <Input
                inputMode="decimal"
                defaultValue={currency === "UYU" ? "80000" : "2500"}
              />
            </Field>
            <Field label="Deuda inicial (opcional)">
              <Input inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field label="Fecha de deuda inicial">
              <Input type="date" defaultValue="2026-11-15" />
            </Field>
          </div>
        </fieldset>
      ))}
      <p className="ui05-hint">
        Podés informar un límite por moneda con hasta cuatro decimales. Dejá
        vacía la deuda inicial si no hay deuda en esa moneda.
      </p>
    </FormPanel>
  );
}

function CardAlerts() {
  return (
    <Panel title="Avisos de tarjetas" icon="notices">
      <ul className="b-notices">
        <li className="b-notice b-notice--warning">
          <Icon name="alert" className="size-4.5 shrink-0" />
          <div className="min-w-0 flex-1 wrap-anywhere">
            <p className="font-medium">Visa Oro · Vence el 05/12</p>
            <p className="lab-muted">
              Pago del resumen pendiente según tus registros · {m("18450.30")} y{" "}
              {m("212.40", "USD")}
            </p>
            <div className="ui05-actions mt-2">
              <a
                href={protoHref("tarjeta-ciclo", "pago")}
                className={buttonClass("outline")}
              >
                Registrar pago
              </a>
              <a href={protoHref("tarjeta-ciclo")} className="lab-link">
                Ver resumen
                <Icon
                  name="chevronRight"
                  duotone={false}
                  className="size-3.5"
                />
              </a>
            </div>
          </div>
        </li>
        <li className="b-notice b-notice--info">
          <Icon name="info" className="size-4.5 shrink-0" />
          <div className="min-w-0 wrap-anywhere">
            <p className="font-medium">Master Black · Vence el 14/12</p>
            <p className="lab-muted">
              Mínimo cubierto según tus pagos registrados.
            </p>
          </div>
        </li>
      </ul>
    </Panel>
  );
}

function Installments() {
  return (
    <Panel title="Compras en cuotas · Visa Oro" icon="calendar">
      <ul className="ui05-rows">
        {[
          [
            "Heladera",
            "12 × 3.250,00 UYU · Total financiado 39.000,00 UYU",
            "7 futuras",
            "22.750,00 UYU",
          ],
          [
            "Notebook",
            "6 × 145,00 USD · Total financiado 870,00 USD",
            "2 futuras",
            "290,00 USD",
          ],
        ].map(([title, sub, future, commitment]) => (
          <li key={title}>
            <span className="ui05-row__icon" aria-hidden="true">
              <Icon name="cards" className="size-4.5" />
            </span>
            <div className="ui05-row__main">
              <a href="#" className="ui05-row__title hover:underline">
                {title}
              </a>
              <p className="ui05-row__sub">{sub}</p>
            </div>
            <div className="ui05-row__aside">
              <span className="ui05-row__amount">{commitment}</span>
              <span className="lab-muted text-xs">
                {future} · compromiso futuro
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CardsScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Crédito"
      title="Tarjetas"
      description="Gestioná tus tarjetas de débito y crédito por moneda."
      actions={
        state !== "error" && (
          <a
            href={protoHref("tarjetas", "formulario")}
            className={buttonClass("primary")}
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Agregar tarjeta
          </a>
        )
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tus tarjetas. Volvé a intentarlo." />
      </Screen>
    );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        <EmptyState
          icon="cards"
          title="Todavía no tenés tarjetas activas"
          actions={
            <a
              href={protoHref("tarjetas", "formulario")}
              className={buttonClass("primary")}
            >
              <Icon name="plus" duotone={false} className="size-4" />
              Agregar tarjeta
            </a>
          }
        >
          Agregá tus tarjetas de crédito para seguir deuda, cierres y
          vencimientos, y las de débito para registrar gastos desde Bancos.
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      {state === "formulario" && <CardForm />}
      <div className="ui05-grid">
        <div className="ui05-span-8 ui05-stack">
          <section aria-labelledby="tarjetas-activas" className="ui05-stack">
            <h2 id="tarjetas-activas" className="lab-panel__title">
              Activas
              <span className="lab-tag lab-tag--neutral">3</span>
            </h2>
            <ul className="b-cards">
              {cards.map((card) => (
                <CardTile key={card.id} card={card} />
              ))}
            </ul>
          </section>
          <Installments />
        </div>
        <div className="ui05-span-4 ui05-stack">
          <CardAlerts />
          <details className="lab-panel">
            <summary className="lab-panel__title cursor-pointer list-none">
              Archivadas
              <span className="lab-tag lab-tag--neutral">1</span>
            </summary>
            <ul className="ui05-rows mt-3">
              <li>
                <span className="ui05-row__icon" aria-hidden="true">
                  <Icon name="cards" className="size-4.5" />
                </span>
                <div className="ui05-row__main">
                  <p className="ui05-row__title">Visa Clásica</p>
                  <p className="ui05-row__sub">
                    Crédito · Banco Ribera · sin deuda
                  </p>
                </div>
                <StateTag tone="neutral">Archivada</StateTag>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </Screen>
  );
}

function CurrencyStatement({
  currency,
  remaining,
  facts,
  notice,
}: {
  currency: "UYU" | "USD";
  remaining: string;
  facts: [string, string][];
  notice?: React.ReactNode;
}) {
  return (
    <section
      className="lab-panel c-feature"
      aria-labelledby={`resumen-${currency}`}
    >
      <header className="lab-panel__head">
        <h2 id={`resumen-${currency}`} className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="cards" className="size-4.5" />
          </span>
          Resumen en {currency}
        </h2>
        <StateTag tone="warning">Pago pendiente</StateTag>
      </header>
      <div>
        <p className="lab-muted text-[13px] font-semibold">
          Remanente estimado
        </p>
        <p className="mt-1 text-[clamp(28px,4vw,38px)] leading-tight font-bold tracking-[-0.04em] tabular-nums">
          {m(remaining, currency)}
        </p>
      </div>
      <dl className="ui05-review">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {notice}
      <div className="ui05-actions">
        <a
          href={protoHref("tarjeta-ciclo", "pago")}
          className={buttonClass("primary")}
        >
          Registrar pago del ciclo
        </a>
        <button type="button" className={buttonClass("outline")}>
          Editar resumen oficial
        </button>
      </div>
    </section>
  );
}

function PaymentForm() {
  return (
    <FormPanel
      labelId="form-pago"
      title="Registrar pago del ciclo · UYU"
      description="El pago reduce la deuda de la tarjeta y tu saldo en Bancos. No se registra como un gasto nuevo."
      onCloseHref={protoHref("tarjeta-ciclo")}
      foot={
        <>
          <span className="ui05-hint">Paso 1 de 2 · Revisar</span>
          <a href={protoHref("tarjeta-ciclo")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Revisar pago
          </button>
        </>
      }
    >
      <div className="ui05-form__grid ui05-form__grid--3">
        <Field label="Importe pagado">
          <Input inputMode="decimal" defaultValue="18450,30" />
        </Field>
        <Field label="Fecha del pago">
          <Input type="date" defaultValue="2026-12-03" />
        </Field>
        <Field label="Cuenta bancaria">
          <Input
            defaultValue="Bancos · UYU (disponible 54.310,00 UYU)"
            readOnly
          />
        </Field>
      </div>
      <fieldset className="ui05-form__section">
        <legend className="ui05-form__section-title">
          Asignación del pago
        </legend>
        <div className="ui05-choice">
          <label>
            <input type="radio" name="asignacion" defaultChecked />
            <span>
              <strong className="block">Remanente del ciclo</strong>
              <span className="ui05-hint">
                Cubre el resumen de noviembre completo.
              </span>
            </span>
          </label>
          <label>
            <input type="radio" name="asignacion" />
            <span>
              <strong className="block">Elegir compras y cuotas</strong>
              <span className="ui05-hint">
                Asignación manual, sin reparto automático.
              </span>
            </span>
          </label>
        </div>
      </fieldset>
    </FormPanel>
  );
}

export function CardCycleScreen({ state }: { state: ProtoState }) {
  return (
    <Screen>
      <PageHead
        back={{ href: protoHref("tarjetas"), label: "Volver a Tarjetas" }}
        eyebrow="Ciclo de cierre de noviembre de 2026"
        title="Resumen de Visa Oro"
        actions={
          <div className="lab-stepper" role="group" aria-label="Elegir ciclo">
            <button
              type="button"
              className="lab-stepper__btn"
              aria-label="Ciclo anterior"
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
              aria-label="Ciclo siguiente"
            >
              <Icon name="chevronRight" duotone={false} className="size-4" />
            </button>
          </div>
        }
      />
      <div className="ui05-kpis">
        <Kpi icon="calendar" label="Cierre" value="24/11/2026" sub="Habitual" />
        <Kpi
          icon="clock"
          label="Vencimiento"
          value="05/12/2026"
          sub="Oficial"
        />
        <Kpi
          label="Avance del ciclo"
          value="64 %"
          extra={
            <div className="lab-meter lab-meter--cycle mt-1" aria-hidden="true">
              <span style={{ width: "64%" }} />
            </div>
          }
        />
        <Kpi label="Compras por revisar" value="2" sub="Cerca del cierre" />
      </div>
      {state === "pago" && <PaymentForm />}
      <div className="ui05-grid">
        <div className="ui05-span-6">
          <CurrencyStatement
            currency="UYU"
            remaining="18450.30"
            facts={[
              ["Deuda total registrada", m("24570.30")],
              ["Estimación según movimientos cargados", m("18450.30")],
              ["Importe confirmado del resumen", "Sin datos"],
              ["Pago mínimo informado", m("1845.00")],
              ["Pagos registrados en el ciclo", m("0.00")],
            ]}
          />
        </div>
        <div className="ui05-span-6">
          <CurrencyStatement
            currency="USD"
            remaining="187.40"
            facts={[
              ["Deuda total registrada", m("212.40", "USD")],
              ["Estimación según movimientos cargados", m("212.40", "USD")],
              ["Importe confirmado del resumen", m("199.90", "USD")],
              ["Pagos registrados en el ciclo", m("12.50", "USD")],
            ]}
            notice={
              <div className="b-notice b-notice--warning">
                <Icon name="alert" className="size-4.5 shrink-0" />
                <p className="min-w-0 text-sm">
                  Diferencia pendiente de revisión · −12,50 USD. Compará tus
                  compras con el resumen del emisor.
                </p>
              </div>
            }
          />
        </div>
      </div>
      <section className="lab-panel" aria-labelledby="revisar-compras">
        <header className="lab-panel__head">
          <h2 id="revisar-compras" className="lab-panel__title">
            <span className="lab-panel__icon">
              <Icon name="search" duotone={false} className="size-4" />
            </span>
            Revisar mis compras
          </h2>
          <span className="lab-muted text-xs">
            El emisor puede contabilizar compras cerca del cierre en otro
            resumen.
          </span>
        </header>
        <table className="ui05-table ui05-table--stack">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Compra o cuota</th>
              <th>Ciclo</th>
              <th className="is-num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                "23/11",
                "Supermercado Central",
                "Ciclo estimado: nov.",
                m("2140.00"),
              ],
              [
                "24/11",
                "Heladera · cuota 5 de 12",
                "Ciclo estimado: nov.",
                m("3250.00"),
              ],
              [
                "22/11",
                "Suscripción streaming",
                "Ciclo informado por el emisor: dic.",
                m("12.50", "USD"),
              ],
            ].map(([date, concept, cycle, amount]) => (
              <tr key={concept}>
                <td data-label="Fecha" className="lab-muted">
                  {date}
                </td>
                <td data-label="Compra" className="font-medium">
                  {concept}
                </td>
                <td data-label="Ciclo" className="lab-muted text-[13px]">
                  {cycle}
                </td>
                <td className="is-num font-semibold">{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ui05-actions">
          <button type="button" className={buttonClass("outline")}>
            Registrar compra real
          </button>
          <button type="button" className={buttonClass("outline")}>
            Actualizar deuda real
          </button>
          <button type="button" className={buttonClass("ghost")}>
            Revisar más tarde
          </button>
        </div>
      </section>
      <section className="lab-panel" aria-labelledby="calendario">
        <h2 id="calendario" className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="calendar" className="size-4.5" />
          </span>
          Fechas y calendario
        </h2>
        <div className="ui05-accordion">
          <details>
            <summary>
              Fechas excepcionales del ciclo
              <Icon name="chevronDown" duotone={false} className="size-4" />
            </summary>
            <div className="ui05-accordion__body">
              Dejá el campo vacío para volver a la fecha habitual.
            </div>
          </details>
          <details>
            <summary>
              Calendario habitual de la tarjeta
              <Icon name="chevronDown" duotone={false} className="size-4" />
            </summary>
            <div className="ui05-accordion__body">
              El cierre y vencimiento son opcionales. En meses cortos se usa el
              último día disponible.
            </div>
          </details>
          <details>
            <summary>
              Registrar reintegro a Bancos en USD
              <Icon name="chevronDown" duotone={false} className="size-4" />
            </summary>
            <div className="ui05-accordion__body">
              Saldo a favor registrado: {m("15.00", "USD")}.
            </div>
          </details>
        </div>
      </section>
    </Screen>
  );
}
