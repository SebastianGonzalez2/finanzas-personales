import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
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
  RowIcon,
  Screen,
  StateTag,
  m,
} from "../kit";
import { protoHref, type ProtoState } from "../screens";

/* ============================ Deudas y préstamos ============================ */

type Loan = {
  concept: string;
  contact?: string;
  amount: string;
  currency: "UYU" | "USD";
  state: ["warning" | "good" | "neutral", string];
  due?: string;
  installments?: string;
};

const payable: Loan[] = [
  {
    concept: "Préstamo del banco",
    contact: "Banco Austral",
    amount: "184500.00",
    currency: "UYU",
    state: ["neutral", "Pendiente"],
    due: "10/12/2026",
    installments: "Cuota habitual 9.850,00 UYU · mensual",
  },
  {
    concept: "Cena compartida",
    contact: "Lucía",
    amount: "1250.00",
    currency: "UYU",
    state: ["warning", "Pendiente de conciliación"],
  },
];

const receivable: Loan[] = [
  {
    concept: "Préstamo a Martín",
    contact: "Martín",
    amount: "300.00",
    currency: "USD",
    state: ["neutral", "Pendiente"],
    due: "30/11/2026",
  },
  {
    concept: "Entradas del recital",
    contact: "Sofía",
    amount: "0.00",
    currency: "UYU",
    state: ["good", "Saldada"],
  },
];

function LoanColumn({
  title,
  icon,
  loans,
}: {
  title: string;
  icon: "expense" | "income";
  loans: Loan[];
}) {
  return (
    <section className="lab-panel" aria-labelledby={`col-${icon}`}>
      <header className="lab-panel__head">
        <h2 id={`col-${icon}`} className="lab-panel__title">
          <span className={`lab-kind lab-kind--${icon}`} aria-hidden="true">
            <Icon name={icon} duotone={false} className="size-4" />
          </span>
          {title}
        </h2>
        <span className="lab-tag lab-tag--neutral">{loans.length}</span>
      </header>
      <ul className="ui05-rows">
        {loans.map((loan) => (
          <li key={loan.concept}>
            <div className="ui05-row__main">
              <a
                href={protoHref("deuda-detalle")}
                className="ui05-row__title hover:underline"
              >
                {loan.concept}
              </a>
              <p className="ui05-row__sub">
                {[loan.contact, loan.due && `Vence ${loan.due}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {loan.installments && (
                <p className="ui05-row__sub">{loan.installments}</p>
              )}
            </div>
            <div className="ui05-row__aside">
              <span className="ui05-row__amount">
                {m(loan.amount, loan.currency)}
              </span>
              <StateTag tone={loan.state[0]}>{loan.state[1]}</StateTag>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoanForm() {
  return (
    <FormPanel
      labelId="form-obligacion"
      title="Nueva obligación"
      description="El alta registra el saldo existente de la obligación."
      onCloseHref={protoHref("deudas")}
      foot={
        <>
          <a href={protoHref("deudas")} className={buttonClass("ghost")}>
            Cancelar
          </a>
          <button type="button" className={buttonClass("primary")}>
            Registrar obligación
          </button>
        </>
      }
    >
      <Field label="Operación">
        <Select defaultValue="Recibir préstamo">
          <option>Registrar deuda existente</option>
          <option>Registrar dinero por cobrar existente</option>
          <option>Recibir préstamo</option>
          <option>Prestar dinero</option>
        </Select>
      </Field>
      <div className="ui05-form__grid">
        <Field label="Persona, entidad o descripción">
          <Input defaultValue="Préstamo para el auto" />
        </Field>
        <Field label="Contacto (opcional)">
          <Input defaultValue="Banco Ribera" />
        </Field>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <div className="ui-field">
            <span className="ui-field__label">Moneda bancaria</span>
            <Segmented label="Moneda bancaria">
              <SegmentedOption pressed>UYU</SegmentedOption>
              <SegmentedOption pressed={false}>USD</SegmentedOption>
            </Segmented>
          </div>
          <Field label="Capital">
            <Input inputMode="decimal" defaultValue="250000" />
          </Field>
        </div>
        <Field label="Fecha efectiva">
          <Input type="date" defaultValue="2026-11-15" />
        </Field>
      </div>
      <details className="ui05-form__section">
        <summary className="ui05-form__section-title cursor-pointer">
          Cuotas y vencimiento (opcional)
        </summary>
        <div className="ui05-form__grid ui05-form__grid--3 mt-3">
          <Field label="Cuota habitual (opcional)">
            <Input inputMode="decimal" />
          </Field>
          <Field label="Frecuencia (opcional)">
            <Select defaultValue="">
              <option value="">Sin especificar</option>
              <option>Mensual</option>
            </Select>
          </Field>
          <Field label="Vencimiento conocido (opcional)">
            <Input type="date" />
          </Field>
        </div>
      </details>
      <p className="ui05-hint">
        Confirmá una entrega o recepción de capital que ya ocurrió en Bancos. El
        capital no se cuenta como ingreso ni gasto.
      </p>
    </FormPanel>
  );
}

export function DebtsScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Crédito"
      title="Deudas y préstamos"
      description="Lo que debés y lo que te deben, con el historial de cada obligación."
      actions={
        state !== "error" && (
          <a
            href={protoHref("deudas", "formulario")}
            className={buttonClass("primary")}
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Nueva obligación
          </a>
        )
      }
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar tus deudas. Volvé a intentarlo." />
      </Screen>
    );
  if (state === "vacio")
    return (
      <Screen>
        {head}
        <EmptyState
          icon="debts"
          title="Todavía no hay registros"
          actions={
            <a
              href={protoHref("deudas", "formulario")}
              className={buttonClass("primary")}
            >
              <Icon name="plus" duotone={false} className="size-4" />
              Nueva obligación
            </a>
          }
        >
          Registrá préstamos recibidos o entregados y deudas existentes. Los
          gastos compartidos también crean obligaciones automáticamente.
        </EmptyState>
      </Screen>
    );
  return (
    <Screen>
      {head}
      {state === "formulario" && <LoanForm />}
      <div className="ui05-grid">
        <div className="ui05-span-6">
          <LoanColumn title="Deudas por pagar" icon="expense" loans={payable} />
        </div>
        <div className="ui05-span-6">
          <LoanColumn
            title="Dinero por cobrar"
            icon="income"
            loans={receivable}
          />
        </div>
      </div>
    </Screen>
  );
}

export function DebtDetailScreen({ state }: { state: ProtoState }) {
  return (
    <Screen>
      <PageHead
        back={{
          href: protoHref("deudas"),
          label: "Volver a deudas y préstamos",
        }}
        eyebrow="Deuda por pagar · con cuotas"
        title="Préstamo del banco"
        actions={
          state !== "operacion" && (
            <a
              href={protoHref("deuda-detalle", "operacion")}
              className={buttonClass("primary")}
            >
              Registrar operación
            </a>
          )
        }
      />
      <div className="ui05-kpis">
        <Kpi
          hero
          label="Importe pendiente"
          value={m("184500.00")}
          sub="Intereses devengados incluidos"
        />
        <Kpi label="Cuota habitual" value={m("9850.00")} sub="Mensual" />
        <Kpi
          label="Vencimiento registrado"
          value="10/12/2026"
          sub="Aviso 5 días antes"
        />
        <Kpi
          label="Estado"
          value={<StateTag tone="neutral">Pendiente</StateTag>}
          sub="Contacto: Banco Austral"
        />
      </div>
      {state === "operacion" && (
        <FormPanel
          labelId="form-operacion"
          title="Registrar operación"
          onCloseHref={protoHref("deuda-detalle")}
          foot={
            <>
              <span className="ui05-hint">Paso 2 de 2 · Confirmar</span>
              <button type="button" className={buttonClass("ghost")}>
                Modificar
              </button>
              <button type="button" className={buttonClass("primary")}>
                Confirmar pago
              </button>
            </>
          }
        >
          <div className="ui05-form__grid">
            <Field label="Acción">
              <Select defaultValue="Registrar pago">
                <option>Registrar pago</option>
                <option>Registrar intereses</option>
                <option>Actualizar importe pendiente</option>
              </Select>
            </Field>
            <label className="ui05-check self-end">
              <input type="checkbox" defaultChecked />
              Conozco el desglose completo de la cuota
            </label>
          </div>
          <Review
            rows={[
              ["Fecha efectiva", "10/11/2026"],
              ["Capital amortizado", m("7400.00")],
              ["Intereses y cargos pagados", m("2450.00")],
              ["Sale de Bancos · UYU", m("9850.00")],
              ["Pendiente después", m("177100.00")],
            ]}
          />
          <Effects
            items={[
              "Baja el saldo en Bancos por el total de la cuota.",
              "Solo los intereses y cargos se registran como gasto financiero.",
              "El capital reduce la deuda; no es un gasto.",
            ]}
          />
        </FormPanel>
      )}
      <section className="lab-panel" aria-labelledby="historial-obligacion">
        <h2 id="historial-obligacion" className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="history" className="size-4.5" />
          </span>
          Historial de la obligación
        </h2>
        <ol className="ui05-timeline">
          {[
            [
              "10/10/2026",
              "Pago de cuota",
              "Capital 7.320,00 · intereses 2.530,00",
              "−9.850,00 UYU",
              "",
            ],
            [
              "01/10/2026",
              "Intereses registrados",
              "Interés real devengado",
              "+2.530,00 UYU",
              "is-warning",
            ],
            [
              "10/09/2026",
              "Pago de cuota",
              "Pago sin desglose · conciliado",
              "−9.850,00 UYU",
              "",
            ],
            [
              "15/03/2026",
              "Recibir préstamo",
              "Capital acreditado en Bancos",
              "+250.000,00 UYU",
              "is-muted",
            ],
          ].map(([date, title, sub, amount, tone]) => (
            <li key={date + title}>
              <span
                className={`ui05-timeline__dot ${tone}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="lab-muted text-xs">
                  {date} · {sub} ·{" "}
                  <a href="#" className="underline">
                    Ver registro en Historial
                  </a>
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {amount}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Screen>
  );
}

/* =========================== Beneficios bancarios =========================== */

export function BenefitsScreen({ state }: { state: ProtoState }) {
  const head = (
    <PageHead
      eyebrow="Crédito"
      title="Beneficios bancarios"
      description="Cashback y bonificaciones acreditados por el banco que no están ligados a una compra concreta."
    />
  );
  if (state === "error")
    return (
      <Screen>
        {head}
        <ErrorState message="No pudimos cargar los beneficios bancarios." />
      </Screen>
    );
  const form =
    state === "confirmar" ? (
      <FormPanel
        labelId="form-beneficio"
        title="Resumen para confirmar"
        description="Revisá el importe, la moneda y confirmá que el beneficio ya fue acreditado."
        foot={
          <>
            <span className="ui05-hint">Paso 2 de 2 · Confirmar</span>
            <a href={protoHref("beneficios")} className={buttonClass("ghost")}>
              Volver
            </a>
            <button type="button" className={buttonClass("primary")}>
              Confirmar registro
            </button>
          </>
        }
      >
        <Review
          rows={[
            ["¿Dónde se acreditó?", "Cuenta bancaria (Bancos) · UYU"],
            ["Importe acreditado", m("850.00")],
            ["Fecha de acreditación", "12/11/2026"],
            ["Concepto", "Cashback supermercados"],
          ]}
        />
        <Effects
          items={[
            "Se registra un ingreso por beneficio bancario una sola vez.",
            "Sube tu saldo en Bancos · UYU.",
            "No cambia compras anteriores ni presupuestos.",
          ]}
        />
      </FormPanel>
    ) : (
      <FormPanel
        labelId="form-beneficio"
        title="Registrar beneficio bancario"
        description="Si es la devolución de una compra, registrala desde esa compra en el Historial."
        foot={
          <a
            href={protoHref("beneficios", "confirmar")}
            className={buttonClass("primary")}
          >
            Revisar
          </a>
        }
      >
        <fieldset className="grid gap-2">
          <legend className="ui-field__label mb-2">¿Dónde se acreditó?</legend>
          <div className="ui05-choice">
            <label>
              <input type="radio" name="destino" defaultChecked />
              <span>
                <strong className="block">Cuenta bancaria (Bancos)</strong>
                <span className="ui05-hint">
                  Sube el saldo y se registra como ingreso.
                </span>
              </span>
            </label>
            <label>
              <input type="radio" name="destino" />
              <span>
                <strong className="block">Abono en tarjeta de crédito</strong>
                <span className="ui05-hint">
                  Reduce la deuda; el excedente queda como saldo a favor.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="ui05-form__grid ui05-form__grid--3">
          <Field label="Importe acreditado">
            <Input inputMode="decimal" defaultValue="850" />
          </Field>
          <Field label="Moneda">
            <Select defaultValue="UYU">
              <option>UYU</option>
              <option>USD</option>
            </Select>
          </Field>
          <Field label="Fecha de acreditación">
            <Input type="date" defaultValue="2026-11-12" />
          </Field>
          <Field label="Concepto (opcional)" className="ui05-form__full">
            <Input defaultValue="Cashback supermercados" />
          </Field>
          <Field label="Nota (opcional)" className="ui05-form__full">
            <Textarea rows={2} />
          </Field>
        </div>
        <label className="ui05-check">
          <input type="checkbox" defaultChecked />
          El banco ya acreditó este importe
        </label>
      </FormPanel>
    );
  return (
    <Screen>
      {head}
      <div className="ui05-grid">
        <div className="ui05-span-7">{form}</div>
        <section
          className="lab-panel ui05-span-5"
          aria-labelledby="beneficios-registrados"
        >
          <h2 id="beneficios-registrados" className="lab-panel__title">
            <span className="lab-panel__icon">
              <Icon name="benefits" className="size-4.5" />
            </span>
            Beneficios registrados
          </h2>
          {state === "vacio" ? (
            <p className="lab-muted py-6 text-center text-sm">
              Todavía no registraste beneficios.
            </p>
          ) : (
            <ul className="ui05-rows">
              {[
                [
                  "Cashback supermercados",
                  "12/11 · Bancos",
                  "+850,00 UYU",
                  false,
                ],
                [
                  "Bonificación anual",
                  "02/10 · Abono en Visa Oro",
                  "+25,00 USD",
                  false,
                ],
                [
                  "Promoción combustible",
                  "18/09 · Bancos · anulado",
                  "320,00 UYU",
                  true,
                ],
              ].map(([title, sub, amount, voided]) => (
                <li key={title as string}>
                  <RowIcon name="benefits" accent={!voided} />
                  <div className="ui05-row__main">
                    <p
                      className={`ui05-row__title ${voided ? "text-[var(--glaciar-faint)] line-through" : ""}`}
                    >
                      {title}
                    </p>
                    <p className="ui05-row__sub">{sub}</p>
                  </div>
                  <span
                    className={`ui05-row__amount ${voided ? "lab-muted" : "is-positive"}`}
                  >
                    {amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
