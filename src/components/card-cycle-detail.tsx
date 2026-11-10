"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import type { CatalogCard } from "@/domain/cards";
import type {
  CreditAction,
  CreditPurchaseOption,
} from "@/domain/credit-operations";
import { formatInstallmentPeriod } from "@/domain/installments";
import type { Currency } from "@/domain/money";
import type { MovementCategory } from "@/domain/movements";
import type { loadCardCycle } from "@/server/card-cycles";
import { CreditOperationForm } from "./credit-operation-form";
import { useFinancialCommand } from "./financial-command";
import {
  HistoryField,
  historyButton,
  historyControl,
  historyPrimary,
} from "./history-fields";
import { Card } from "./ui/card";

type Cycle = Awaited<ReturnType<typeof loadCardCycle>>;
type CyclePurchase = Cycle["purchases"][number];

export function CardCycleDetail({
  card,
  cycle,
  period,
  today,
  banks,
  categories,
  purchases,
  openPayment,
}: {
  card: CatalogCard;
  cycle: Cycle;
  period: string;
  today: string;
  banks: Currency[];
  categories: MovementCategory[];
  purchases: CreditPurchaseOption[];
  openPayment: boolean;
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

  return (
    <>
      <p role="status" className={message ? "text-sm" : "sr-only"}>
        {message}
      </p>
      {operation && (
        <Card className="gap-3 p-4 sm:p-5">
          {operation.action === "payment" &&
            summaries
              .filter(({ currency }) => suggestions[currency])
              .map(({ currency, statement }) => (
                <p key={currency} className="text-sm">
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
        </Card>
      )}
      <button
        type="button"
        className={`${historyButton} justify-self-start`}
        disabled={operation !== null}
        onClick={() => setOperation({ action: "payment" })}
      >
        Registrar pago del ciclo
      </button>
      <div className="grid items-start gap-3 xl:grid-cols-2">
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
            const position = card.currencies.find(
              (row) => row.currency === currency,
            );
            const amount = (value: string | null | undefined) =>
              value == null
                ? "Sin datos"
                : formatBankAmount({ amount: value, currency });
            return (
              <Card key={currency} className="gap-3 p-4 sm:p-5">
                <h2 className="font-semibold">Resumen en {currency}</h2>
                <dl className="grid gap-2 text-sm">
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
                        ? `${formatBankReference(dueOn)} (${dueSource === "official" ? "oficial" : dueSource === "exception" ? "informado para el ciclo" : "estimado"})`
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
                  {remaining !== null && (
                    <Fact
                      label={
                        statement.officialAmount === null
                          ? "Remanente estimado"
                          : "Remanente del resumen"
                      }
                      value={amount(remaining)}
                    />
                  )}
                </dl>
                {minimumCovered && (
                  <p className="text-sm font-medium">
                    Mínimo cubierto según tus pagos registrados. El emisor puede
                    aplicar cargos sobre el remanente.
                  </p>
                )}
                {different && (
                  <p className="rounded-lg border p-3 text-sm">
                    Diferencia pendiente de revisión ·{" "}
                    {difference.startsWith("-") ? "" : "+"}
                    {amount(difference)}. Compará tus compras con el resumen del
                    emisor.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={historyButton}
                    aria-expanded={review === currency}
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
                      className={historyButton}
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
                {review === currency && (
                  <section
                    aria-label={`Compras del ciclo en ${currency}`}
                    className="grid gap-2 border-t pt-3"
                  >
                    <p className="text-sm text-muted-foreground">
                      El emisor puede contabilizar compras cerca del cierre en
                      otro resumen.
                    </p>
                    {!card.archived && (
                      <button
                        type="button"
                        className={`${historyButton} justify-self-start`}
                        disabled={operation !== null}
                        onClick={() =>
                          setOperation({ action: "purchase", currency })
                        }
                      >
                        Registrar compra real
                      </button>
                    )}
                    {cycle.purchases.filter(
                      (purchase) => purchase.currency === currency,
                    ).length === 0 ? (
                      <p className="text-sm">
                        No hay compras o cuotas identificadas para revisar.
                      </p>
                    ) : (
                      <ul className="grid gap-2">
                        {cycle.purchases
                          .filter((purchase) => purchase.currency === currency)
                          .map((purchase) => (
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
                <details className="rounded-lg border p-3">
                  <summary className="min-h-8 cursor-pointer text-sm font-semibold">
                    Editar resumen oficial
                  </summary>
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
                </details>
              </Card>
            );
          },
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Los importes estimados pueden omitir cargos o compras del emisor. Cada
        cuota parte de su mes de registro en el plan.
      </p>
      <Card className="gap-3 p-4 sm:p-5">
        <details>
          <summary className="min-h-8 cursor-pointer font-semibold">
            Fechas excepcionales del ciclo
          </summary>
          <p className="text-sm text-muted-foreground">
            Dejá el campo vacío para volver a la fecha habitual. El vencimiento
            oficial de cada moneda tiene prioridad.
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
        </details>
        <details>
          <summary className="min-h-8 cursor-pointer font-semibold">
            Calendario habitual de la tarjeta
          </summary>
          <p className="text-sm text-muted-foreground">
            El cierre y vencimiento son opcionales. En meses cortos se usa el
            último día disponible.
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
        </details>
      </Card>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
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
      <input
        className={historyControl}
        name={name}
        type="date"
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
    <li className="rounded-lg border p-3 text-sm wrap-anywhere">
      <a
        className="font-semibold underline"
        href={`/historial/movimientos/${id}`}
      >
        {purchase.concept}
      </a>
      <p>
        {ordinal > 0 && `Cuota ${ordinal} · `}
        {formatBankAmount(purchase)} · Compra del{" "}
        {formatBankReference(purchase.effectiveOn)}
      </p>
      <p>
        {period
          ? `${assignment.assignedPeriod ? "Ciclo elegido" : "Ciclo estimado"} · ${formatInstallmentPeriod(period)}`
          : "Sin ciclo estimado"}
      </p>
      <details className="mt-2">
        <summary className="min-h-8 cursor-pointer font-medium">
          Cambiar resumen
        </summary>
        <p className="text-muted-foreground">
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
          <HistoryField label="Ciclo informado por el emisor">
            <input
              className={historyControl}
              name="assignedPeriod"
              type="month"
              min="0001-01"
              max="9999-12"
              defaultValue={assignment.assignedPeriod ?? ""}
            />
          </HistoryField>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              name="reviewed"
              type="checkbox"
              className="size-5 shrink-0"
            />
            Si ya hay un resumen oficial o pagos, revisé el ciclo y confirmo el
            cambio de estimación.
          </label>
        </CycleForm>
      </details>
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
      className="mt-2 grid gap-2"
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
        className="grid min-w-0 gap-2 sm:grid-cols-2"
        disabled={pending || uncertain}
      >
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-sm">
          Cambios guardados.
        </p>
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
