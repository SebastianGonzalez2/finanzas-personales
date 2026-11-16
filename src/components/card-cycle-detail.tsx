"use client";

import { MonthField, DateInput } from "./ui/date-fields";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { FundSource } from "@/domain/fund-coverage";
import {
  formatBankAmount,
  formatBankReference,
  type BankAvailability,
} from "@/domain/bank-balances";
import type { CatalogCard } from "@/domain/cards";
import type {
  CreditAction,
  CreditPurchaseOption,
} from "@/domain/credit-operations";
import { formatInstallmentPeriod } from "@/domain/installments";
import type { Currency } from "@/domain/money";
import type { CatalogCategory } from "@/domain/categories";
import type { loadCardCycle } from "@/server/card-cycles";
import { CreditOperationForm } from "./credit-operation-form";
import { useFinancialCommand } from "./financial-command";
import { Kpi, StateTag } from "./glaciar/screen";
import {
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";

type Cycle = Awaited<ReturnType<typeof loadCardCycle>>;
type CyclePurchase = Cycle["purchases"][number];

function dueSourceLabel(source: string | null) {
  return source === "official"
    ? "oficial"
    : source === "exception"
      ? "informado para el ciclo"
      : "estimado";
}

export function CardCycleDetail({
  card,
  cycle,
  period,
  today,
  banks,
  bankAvailability,
  fundSources,
  categories,
  purchases,
  openPayment,
  refunds,
}: {
  card: CatalogCard;
  cycle: Cycle;
  period: string;
  today: string;
  banks: Currency[];
  bankAvailability: BankAvailability[];
  fundSources: FundSource[] | null;
  categories: CatalogCategory[];
  purchases: CreditPurchaseOption[];
  openPayment: boolean;
  refunds?: ReactNode;
}) {
  const router = useRouter();
  const [operation, setOperation] = useState<{
    action: CreditAction;
    currency?: Currency;
  } | null>(openPayment ? { action: "payment" } : null);
  const [review, setReview] = useState<Currency | null>(null);
  const [message, setMessage] = useState("");
  const { schedule, dates, summaries } = cycle;
  const suggestions = Object.fromEntries(
    summaries.flatMap(({ currency, remaining }) =>
      remaining && /[1-9]/.test(remaining) ? [[currency, remaining]] : [],
    ),
  );
  const money = (currency: Currency, value: string | null | undefined) =>
    value == null ? "Sin datos" : formatBankAmount({ amount: value, currency });
  const positionOf = (currency: Currency) =>
    card.currencies.find((row) => row.currency === currency);
  const closingOn = summaries.find((summary) => summary.closingOn)?.closingOn;
  const dueDates = [
    ...new Set(summaries.flatMap(({ dueOn }) => (dueOn ? [dueOn] : []))),
  ];
  const singleDue = summaries.find(({ dueOn }) => dueOn);
  const toReview = cycle.purchases.length;
  const reviewPurchases = review
    ? cycle.purchases.filter((purchase) => purchase.currency === review)
    : [];

  return (
    <>
      <div
        role="status"
        className={message ? "b-notice b-notice--info" : "sr-only"}
      >
        {message && <Icon name="info" className="size-4.5 shrink-0" />}
        <p className={message ? "gs-notice-text" : undefined}>{message}</p>
      </div>
      <div className="gs-kpis gs-kpis--fill">
        <Kpi
          icon="calendar"
          label="Cierre"
          value={closingOn ? formatBankReference(closingOn) : "Sin fecha"}
          sub={closingOn ? (dates.closingOn ? "Excepcional" : "Habitual") : ""}
        />
        <Kpi
          icon="clock"
          label="Vencimiento"
          value={
            dueDates.length === 1 && singleDue?.dueOn
              ? formatBankReference(singleDue.dueOn)
              : dueDates.length === 0
                ? "Sin fecha"
                : "Según moneda"
          }
          sub={
            dueDates.length === 1 && singleDue
              ? capitalize(dueSourceLabel(singleDue.dueSource))
              : dueDates.length > 1
                ? summaries
                    .filter(({ dueOn }) => dueOn)
                    .map(
                      ({ currency, dueOn }) =>
                        `${currency} ${formatBankReference(dueOn as string)}`,
                    )
                    .join(" · ")
                : ""
          }
        />
        <Kpi
          icon="debts"
          label="Deuda total registrada"
          value={
            <span className="gs-kpi__lines">
              {summaries.map(({ currency }) => (
                <span key={currency} className="block">
                  {money(currency, positionOf(currency)?.debt)}
                </span>
              ))}
            </span>
          }
        />
        <Kpi
          icon="check"
          label="Pagos del ciclo"
          value={
            <span className="gs-kpi__lines">
              {summaries.map(({ currency, paid }) => (
                <span key={currency} className="block">
                  {money(currency, paid)}
                </span>
              ))}
            </span>
          }
        />
        <Kpi
          icon="search"
          label="Compras por revisar"
          value={String(toReview)}
          sub="Compras y cuotas de este ciclo"
        />
      </div>
      <div className="gs-actions">
        <Button
          variant="primary"
          disabled={operation !== null}
          onClick={() => setOperation({ action: "payment" })}
        >
          Registrar pago del ciclo
        </Button>
        <span className="gs-hint">
          El pago reduce la deuda de la tarjeta y tu saldo en Bancos. No se
          registra como un gasto nuevo.
        </span>
      </div>
      {operation && (
        <div className="gs-form">
          {operation.action === "payment" &&
            summaries
              .filter(({ currency }) => suggestions[currency])
              .map(({ currency, statement }) => (
                <p key={currency} className="gs-hint">
                  Sugerencia{" "}
                  {statement.officialAmount === null
                    ? "estimada"
                    : "del resumen oficial"}{" "}
                  ·{" "}
                  {formatBankAmount({
                    currency,
                    amount: suggestions[currency],
                  })}
                </p>
              ))}
          <CreditOperationForm
            key={`${operation.action}:${operation.currency ?? ""}`}
            action={operation.action}
            initialCurrency={operation.currency}
            cards={[card]}
            today={today}
            banks={banks}
            bankAvailability={bankAvailability}
            fundSources={fundSources}
            categories={categories}
            purchases={purchases}
            installmentsReady
            statement={
              operation.action === "payment"
                ? { period, suggestions }
                : undefined
            }
            close={(notice) => {
              setOperation(null);
              if (notice) {
                setMessage(notice);
                router.refresh();
              }
            }}
          />
        </div>
      )}
      <div className="gs-grid">
        {summaries.map(
          ({
            currency,
            statement,
            closingOn,
            dueOn,
            dueSource,
            estimate,
            credited,
            paid,
            minimumCovered,
            remaining,
            difference,
          }) => {
            const different = difference !== null && /[1-9]/.test(difference);
            const position = positionOf(currency);
            const amount = (value: string | null | undefined) =>
              money(currency, value);
            const pending = remaining !== null && /[1-9]/.test(remaining);
            return (
              <section
                key={currency}
                className={`lab-panel c-feature ${summaries.length > 1 ? "gs-span-6" : ""}`}
                aria-labelledby={`resumen-${currency}`}
              >
                <header className="lab-panel__head">
                  <h2 id={`resumen-${currency}`} className="lab-panel__title">
                    <span className="lab-panel__icon">
                      <Icon name="cards" className="size-4.5" />
                    </span>
                    Resumen en {currency}
                  </h2>
                  {different ? (
                    <StateTag tone="warning">Diferencia pendiente</StateTag>
                  ) : minimumCovered ? (
                    <StateTag tone="good">Mínimo cubierto</StateTag>
                  ) : remaining !== null ? (
                    <StateTag tone={pending ? "warning" : "good"}>
                      {pending ? "Pago pendiente" : "Sin saldo pendiente"}
                    </StateTag>
                  ) : null}
                </header>
                {remaining !== null && (
                  <div className="gs-figure">
                    <p className="gs-figure__label">
                      {statement.officialAmount === null
                        ? "Remanente estimado"
                        : "Remanente del resumen"}
                    </p>
                    <p className="gs-figure__value">{amount(remaining)}</p>
                  </div>
                )}
                <dl className="gs-review">
                  <Fact
                    label="Cierre"
                    value={
                      closingOn
                        ? `${formatBankReference(closingOn)} (${dates.closingOn ? "excepcional" : "habitual"})`
                        : "Sin fecha"
                    }
                  />
                  <Fact
                    label="Vencimiento"
                    value={
                      dueOn
                        ? `${formatBankReference(dueOn)} (${dueSourceLabel(dueSource)})`
                        : "Sin fecha"
                    }
                  />
                  <Fact
                    label="Deuda total registrada"
                    value={amount(position?.debt)}
                  />
                  {/[1-9]/.test(position?.creditBalance ?? "") && (
                    <Fact
                      label="Saldo a favor"
                      value={amount(position?.creditBalance)}
                    />
                  )}
                  {credited !== "0.0000" && (
                    <Fact
                      label="Abonos aplicados a la estimación"
                      value={amount(credited)}
                    />
                  )}
                  <Fact
                    label="Estimación según movimientos cargados"
                    value={amount(estimate)}
                  />
                  <Fact
                    label="Importe confirmado del resumen"
                    value={amount(statement.officialAmount)}
                  />
                  {statement.minimumAmount !== null && (
                    <Fact
                      label="Pago mínimo informado"
                      value={amount(statement.minimumAmount)}
                    />
                  )}
                  <Fact
                    label="Pagos registrados en el ciclo"
                    value={amount(paid)}
                  />
                </dl>
                {minimumCovered && (
                  <div className="b-notice b-notice--info">
                    <Icon name="check" className="size-4.5 shrink-0" />
                    <p className="gs-notice-text font-medium">
                      Mínimo cubierto según tus pagos registrados. El emisor
                      puede aplicar cargos sobre el remanente.
                    </p>
                  </div>
                )}
                {different && (
                  <div className="b-notice b-notice--warning">
                    <Icon name="alert" className="size-4.5 shrink-0" />
                    <p className="gs-notice-text">
                      Diferencia pendiente de revisión ·{" "}
                      {difference.startsWith("-") ? "" : "+"}
                      {amount(difference)}. Compará tus compras con el resumen
                      del emisor.
                    </p>
                  </div>
                )}
                <div className="gs-actions">
                  <button
                    type="button"
                    className={historyButton}
                    aria-expanded={review === currency}
                    aria-controls={`compras-${currency}`}
                    onClick={() =>
                      setReview(review === currency ? null : currency)
                    }
                  >
                    Revisar mis compras
                  </button>
                  {different && (
                    <button
                      type="button"
                      className={historyButton}
                      disabled={operation !== null}
                      onClick={() =>
                        setOperation({ action: "adjustment", currency })
                      }
                    >
                      Actualizar deuda real
                    </button>
                  )}
                  {different && (
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost min-h-11 px-3 py-2"
                      onClick={() => {
                        setReview(null);
                        setMessage(
                          `La diferencia en ${currency} queda pendiente de revisión.`,
                        );
                      }}
                    >
                      Revisar más tarde
                    </button>
                  )}
                </div>
                <div className="gs-accordion">
                  <details>
                    <summary>Editar resumen oficial</summary>
                    <div className="gs-accordion__body">
                      <CycleForm
                        label={`Guardar resumen ${currency}`}
                        target={{
                          scope: "statement",
                          cardId: card.id,
                          period,
                          currency,
                          version: statement.version,
                        }}
                      >
                        <MoneyField
                          label={`Total oficial en ${currency}`}
                          name="officialAmount"
                          value={statement.officialAmount}
                        />
                        <MoneyField
                          label={`Mínimo oficial en ${currency}`}
                          name="minimumAmount"
                          value={statement.minimumAmount}
                        />
                        <DateField
                          label={`Vencimiento oficial en ${currency}`}
                          name="dueOn"
                          value={statement.dueOn}
                          min={`${period}-01`}
                        />
                      </CycleForm>
                    </div>
                  </details>
                </div>
              </section>
            );
          },
        )}
      </div>
      <p className="gs-hint">
        Los importes estimados pueden omitir cargos o compras del emisor. Cada
        cuota parte de su mes de registro en el plan.
      </p>
      {review && (
        <section
          id={`compras-${review}`}
          aria-label={`Compras del ciclo en ${review}`}
          className="lab-panel"
        >
          <header className="lab-panel__head">
            <h2 className="lab-panel__title">
              <span className="lab-panel__icon">
                <Icon name="search" duotone={false} className="size-4" />
              </span>
              Revisar mis compras · {review}
            </h2>
          </header>
          <p className="gs-hint">
            El emisor puede contabilizar compras cerca del cierre en otro
            resumen.
          </p>
          {!card.archived && (
            <div className="gs-actions">
              <button
                type="button"
                className={historyButton}
                disabled={operation !== null}
                onClick={() =>
                  setOperation({ action: "purchase", currency: review })
                }
              >
                Registrar compra real
              </button>
            </div>
          )}
          {reviewPurchases.length === 0 ? (
            <p className="gs-notice-text">
              No hay compras o cuotas identificadas para revisar.
            </p>
          ) : (
            <ul>
              {reviewPurchases.map((purchase) => (
                <PurchaseAssignment
                  key={`${purchase.id}:${purchase.ordinal}`}
                  cardId={card.id}
                  purchase={purchase}
                />
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="lab-panel" aria-labelledby="fechas-calendario">
        <h2 id="fechas-calendario" className="lab-panel__title">
          <span className="lab-panel__icon">
            <Icon name="calendar" className="size-4.5" />
          </span>
          Fechas, calendario y reintegros
        </h2>
        <div className="gs-accordion">
          <details>
            <summary>Fechas excepcionales del ciclo</summary>
            <div className="gs-accordion__body">
              <p>
                Dejá el campo vacío para volver a la fecha habitual. El
                vencimiento oficial de cada moneda tiene prioridad.
              </p>
              <CycleForm
                label="Guardar fechas del ciclo"
                target={{
                  scope: "dates",
                  cardId: card.id,
                  period,
                  version: dates.version,
                }}
              >
                <DateField
                  label="Cierre excepcional"
                  name="closingOn"
                  value={dates.closingOn}
                  min={`${period}-01`}
                />
                <DateField
                  label="Vencimiento excepcional"
                  name="dueOn"
                  value={dates.dueOn}
                  min={`${period}-01`}
                />
              </CycleForm>
            </div>
          </details>
          <details>
            <summary>Calendario habitual de la tarjeta</summary>
            <div className="gs-accordion__body">
              <p>
                El cierre y vencimiento son opcionales. En meses cortos se usa
                el último día disponible.
              </p>
              <CycleForm
                label="Guardar calendario habitual"
                target={{
                  scope: "schedule",
                  cardId: card.id,
                  version: schedule.version,
                }}
              >
                <DayField
                  label="Día habitual de cierre"
                  name="closingDay"
                  value={schedule.closingDay}
                />
                <DayField
                  label="Día habitual de vencimiento"
                  name="dueDay"
                  value={schedule.dueDay}
                />
                <HistoryField label="Días de anticipación del aviso">
                  <input
                    className={historyControl}
                    name="leadDays"
                    type="number"
                    min="0"
                    max="365"
                    required
                    defaultValue={schedule.leadDays}
                  />
                </HistoryField>
              </CycleForm>
            </div>
          </details>
          {refunds}
        </div>
      </section>
    </>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DayField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: number | null;
}) {
  return (
    <HistoryField label={label}>
      <input
        className={historyControl}
        name={name}
        type="number"
        min="1"
        max="31"
        defaultValue={value ?? ""}
      />
    </HistoryField>
  );
}

function DateField({
  label,
  name,
  value,
  min,
}: {
  label: string;
  name: string;
  value: string | null;
  min: string;
}) {
  return (
    <HistoryField label={label}>
      <DateInput
        className={historyControl}
        name={name}
        min={min}
        max="9999-12-31"
        defaultValue={value ?? ""}
      />
    </HistoryField>
  );
}

function MoneyField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string | null;
}) {
  return (
    <HistoryField label={label}>
      <input
        className={historyControl}
        name={name}
        inputMode="decimal"
        maxLength={22}
        defaultValue={value?.replace(".", ",") ?? ""}
      />
    </HistoryField>
  );
}

function PurchaseAssignment({
  cardId,
  purchase,
}: {
  cardId: string;
  purchase: CyclePurchase;
}) {
  const { id, ordinal, currency, assignment, period, estimatedPeriod } =
    purchase;
  return (
    <li className="gs-purchase">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <a
          className="lab-link font-semibold"
          href={`/historial/movimientos/${id}`}
        >
          {purchase.concept}
        </a>
        <span className="font-semibold tabular-nums">
          {formatBankAmount(purchase)}
        </span>
      </div>
      <p className="lab-muted">
        {ordinal > 0 && `Cuota ${ordinal} · `}
        Compra del {formatBankReference(purchase.effectiveOn)}
      </p>
      <p className="lab-muted">
        {period
          ? `${assignment.assignedPeriod ? "Ciclo elegido" : "Ciclo estimado"} · ${formatInstallmentPeriod(period)}`
          : "Sin ciclo estimado"}
      </p>
      <div className="gs-accordion">
        <details>
          <summary>Cambiar resumen</summary>
          <div className="gs-accordion__body">
            <p>
              Dejá el mes vacío para volver a{" "}
              {estimatedPeriod
                ? `la estimación de ${formatInstallmentPeriod(estimatedPeriod)}`
                : "la regla habitual"}
              .
            </p>
            <CycleForm
              label="Guardar asignación"
              target={{
                scope: "assignment",
                cardId,
                purchaseId: id,
                ordinal,
                currency,
                version: assignment.version,
              }}
            >
              <MonthField
                label="Ciclo informado por el emisor"
                variant="history"
                name="assignedPeriod"
                min="0001-01"
                max="9999-12"
                defaultValue={assignment.assignedPeriod ?? ""}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  name="reviewed"
                  type="checkbox"
                  className="size-5 shrink-0"
                />
                Si ya hay un resumen oficial o pagos, revisé el ciclo y confirmo
                el cambio de estimación.
              </label>
            </CycleForm>
          </div>
        </details>
      </div>
    </li>
  );
}

function CycleForm({
  label,
  target,
  children,
}: {
  label: string;
  target: Record<string, unknown>;
  children: ReactNode;
}) {
  const router = useRouter();
  const { send, error, pending, uncertain } = useFinancialCommand(
    "/api/cards/cycles",
    "POST",
  );
  const [saved, setSaved] = useState(false);
  return (
    <form
      method="post"
      action="/api/cards/cycles"
      aria-label={label}
      className="grid gap-3 text-[color:var(--glaciar-text)]"
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        const input =
          target.scope === "schedule"
            ? {
                closingDay:
                  fields.closingDay === "" ? null : Number(fields.closingDay),
                dueDay: fields.dueDay === "" ? null : Number(fields.dueDay),
                leadDays: Number(fields.leadDays),
              }
            : {
                ...fields,
                ...(target.scope === "assignment" && {
                  reviewed: fields.reviewed === "on",
                }),
              };
        setSaved(false);
        if (await send({ ...target, ...input })) {
          setSaved(true);
          router.refresh();
        }
      }}
    >
      <fieldset
        className="gs-form__grid min-w-0"
        disabled={pending || uncertain}
      >
        {children}
      </fieldset>
      {error && (
        <div role="alert" className="b-notice b-notice--critical">
          <Icon name="alert" className="size-4.5 shrink-0" />
          <p className="gs-notice-text">{error}</p>
        </div>
      )}
      {saved && !error && (
        <div role="status" className="b-notice b-notice--info">
          <Icon name="check" className="size-4.5 shrink-0" />
          <p className="gs-notice-text">Cambios guardados.</p>
        </div>
      )}
      <button
        type="submit"
        className={`${historyPrimary} justify-self-start`}
        disabled={pending}
      >
        {pending ? "Guardando…" : uncertain ? "Reintentar guardado" : label}
      </button>
    </form>
  );
}
