"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBankAmount, formatBankReference } from "@/domain/bank-balances";
import {
  contributionPending,
  type ContributionChange,
  type ContributionPeriod,
  type ContributionPlan,
} from "@/domain/contribution-plans";
import {
  contributionTowardTarget,
  fundTargetNotices,
  parseFundAmount,
  type SavingsFund,
} from "@/domain/savings-funds";
import {
  firstContributionDate,
  isContributionDay,
} from "@/domain/scheduled-contributions";
import { useFinancialCommand } from "./financial-command";
import { buttonClass } from "./ui/button";
import { Field, Input } from "./ui/field";

const endpoint = "/api/funds/contributions";
const button = buttonClass("outline");
const quiet = buttonClass("ghost");

export function contributionStatus(period: ContributionPeriod) {
  if (contributionPending(period)) return "Pendiente";
  const date = period.resolvedOn
    ? ` el ${formatBankReference(period.resolvedOn)}`
    : "";
  if (period.resolution === "target_final")
    return `Aportación final para completar meta · Completada${date}`;
  if (period.resolution === "fund_closed")
    return `Descartada por cierre del fondo${date}`;
  return `${period.status === "completed" ? "Completada" : "Descartada"}${date}`;
}

export function ContributionNotice({ period }: { period: ContributionPeriod }) {
  const reason = {
    insufficient: "No había suficiente dinero disponible.",
    late: "La ejecución automática no se realizó en la fecha programada.",
    fund_limit: "El aporte superaba el máximo admitido para el fondo.",
  };
  return (
    <>
      <p className="font-semibold">
        {period.fundName} · {formatBankAmount(period)} ·{" "}
        {formatBankReference(period.scheduledOn)}
      </p>
      {period.reason && <p>{reason[period.reason]}</p>}
      <p>
        {contributionStatus(period)}
        {contributionPending(period) && ". Requiere resolución manual."}
      </p>
    </>
  );
}

function PeriodResolution({
  period,
  available,
  closed,
}: {
  period: ContributionPeriod;
  available: string | null;
  closed: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"complete" | "discard" | null>(null);
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    endpoint,
    "POST",
  );
  const busy = pending || uncertain;
  return (
    <div className="gs-contrib__form">
      <p>
        Disponible actual{" "}
        {available === null
          ? "sin saldo bancario configurado"
          : formatBankAmount({ currency: period.currency, amount: available })}
      </p>
      {action ? (
        <form
          className="gs-contrib__form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await send({ action, periodId: period.id })) {
              setAction(null);
              router.refresh();
            }
          }}
        >
          <p>
            {action === "complete"
              ? `Reservar ${formatBankAmount(period)} para la aportación del ${formatBankReference(period.scheduledOn)}.`
              : `Descartar la aportación del ${formatBankReference(period.scheduledOn)}.`}
          </p>
          <div className="gs-actions">
            <button
              type="submit"
              className={buttonClass("primary")}
              disabled={pending}
            >
              {uncertain
                ? "Reintentar envío"
                : action === "complete"
                  ? "Confirmar aportación"
                  : "Confirmar descarte"}
            </button>
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => {
                setAction(null);
                clearError();
              }}
            >
              Posponer
            </button>
          </div>
        </form>
      ) : (
        <div className="gs-actions">
          {!closed && (
            <button
              type="button"
              className={button}
              onClick={() => setAction("complete")}
            >
              Completar aportación
            </button>
          )}
          <button
            type="button"
            className={quiet}
            onClick={() => setAction("discard")}
          >
            Descartar aportación
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function PlanEditor({
  fund,
  plan,
  today,
}: {
  fund: SavingsFund;
  plan?: ContributionPlan;
  today: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(plan?.amount ?? "");
  const [day, setDay] = useState(String(plan?.preferredDay ?? ""));
  const [editing, setEditing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [message, setMessage] = useState("");
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    endpoint,
    "POST",
  );
  const decimal = parseFundAmount(amount);
  const preferredDay = Number(day);
  const preview =
    decimal && isContributionDay(preferredDay)
      ? firstContributionDate(today, preferredDay)
      : null;
  const paused = !!plan && !plan.nextOn;
  const { reached, pausedByTarget } = fundTargetNotices(fund, today);
  const canConfigure =
    (!plan || editing) && (fund.status === "active" || pausedByTarget);
  const nextAfterReactivation = plan
    ? contributionTowardTarget(plan.amount, fund).amount
    : null;
  const displayedNextAmount = plan?.nextAmount
    ? contributionTowardTarget(plan.nextAmount, fund).amount
    : null;
  const busy = pending || uncertain;

  async function submit(action: "configure" | "pause" | "reactivate") {
    const fields = { action, fundId: fund.id, version: plan?.version ?? 0 };
    if (action === "configure" && !preview) return;
    if (
      await send(
        action === "configure"
          ? { ...fields, amount: decimal, preferredDay }
          : fields,
      )
    ) {
      setEditing(false);
      setPausing(false);
      setReactivating(false);
      setMessage(
        action === "pause" ? "Programación pausada." : "Programación guardada.",
      );
      router.refresh();
    }
  }

  return (
    <div className="gs-contrib__form">
      {plan?.nextOn && displayedNextAmount && (
        <p>
          Próxima aportación{" "}
          {formatBankAmount({
            currency: fund.currency,
            amount: displayedNextAmount,
          })}{" "}
          el {formatBankReference(plan.nextOn)}.
        </p>
      )}
      {paused && <p>Programación pausada.</p>}
      {reached ? (
        <p>Aumentá o quitá la meta para programar nuevos aportes.</p>
      ) : (
        (fund.status === "active" || pausedByTarget || paused) &&
        (canConfigure ? (
          <form
            className="gs-contrib__form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("configure");
            }}
          >
            <div className="gs-form__grid">
              <Field label={`Importe mensual (${fund.currency})`}>
                <Input
                  required
                  inputMode="decimal"
                  value={amount}
                  disabled={busy}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Día del mes">
                <Input
                  required
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  disabled={busy}
                  onChange={(event) => setDay(event.target.value)}
                />
              </Field>
            </div>
            {editing && plan && (
              <p>
                Antes{" "}
                {formatBankAmount({
                  currency: fund.currency,
                  amount: plan.amount,
                })}{" "}
                el día {plan.preferredDay}.
              </p>
            )}
            {preview && decimal && (
              <p>
                Desde el próximo mes{" "}
                {formatBankAmount({ currency: fund.currency, amount: decimal })}
                . Primera fecha {formatBankReference(preview)}.
              </p>
            )}
            <div className="gs-actions">
              <button
                type="submit"
                className={buttonClass("primary")}
                disabled={pending || !preview}
              >
                {uncertain
                  ? "Reintentar envío"
                  : plan
                    ? "Guardar programación"
                    : "Activar aportaciones"}
              </button>
              {editing && (
                <button
                  type="button"
                  className={quiet}
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setAmount(plan?.amount ?? "");
                    setDay(String(plan?.preferredDay ?? ""));
                    clearError();
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : paused && plan && nextAfterReactivation ? (
          <div className="gs-contrib__form">
            {reactivating ? (
              <>
                <p>
                  Primera aportación prevista:{" "}
                  {formatBankAmount({
                    currency: fund.currency,
                    amount: nextAfterReactivation,
                  })}{" "}
                  el {firstContributionDate(today, plan.preferredDay)}.
                </p>
                <p>
                  Se conservan las aportaciones pendientes. No se hará ninguna
                  reserva ahora.
                </p>
                <div className="gs-actions">
                  <button
                    type="button"
                    className={buttonClass("primary")}
                    disabled={pending}
                    onClick={() => void submit("reactivate")}
                  >
                    {uncertain ? "Reintentar envío" : "Confirmar reactivación"}
                  </button>
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => {
                      setReactivating(false);
                      clearError();
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className={button}
                onClick={() => setReactivating(true)}
              >
                Reactivar aportaciones
              </button>
            )}
          </div>
        ) : pausing ? (
          <div className="gs-contrib__form">
            <p>Los períodos pendientes seguirán disponibles para resolver.</p>
            <div className="gs-actions">
              <button
                type="button"
                className={buttonClass("primary")}
                disabled={pending}
                onClick={() => void submit("pause")}
              >
                {uncertain ? "Reintentar envío" : "Confirmar pausa"}
              </button>
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => {
                  setPausing(false);
                  clearError();
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="gs-actions">
            <button
              type="button"
              className={button}
              onClick={() => setEditing(true)}
            >
              Editar programación
            </button>
            <button
              type="button"
              className={quiet}
              onClick={() => setPausing(true)}
            >
              Pausar aportaciones
            </button>
          </div>
        ))
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function FundContributions({
  fund,
  plan,
  periods,
  changes,
  available,
  today,
}: {
  fund: SavingsFund;
  plan?: ContributionPlan;
  periods: ContributionPeriod[];
  changes: ContributionChange[];
  available: string | null;
  today: string;
}) {
  if (
    !plan &&
    fund.status !== "active" &&
    fund.status !== "paused_target_reached"
  )
    return null;
  const pending = periods.filter(contributionPending);
  const resolved = periods.filter((period) => !contributionPending(period));
  return (
    <section className="gs-contrib" aria-label={`Aportaciones de ${fund.name}`}>
      {pending.length > 0 && (
        <ul className="grid gap-2">
          {pending.map((period) => (
            <li
              key={period.id}
              id={`aporte-${period.id}`}
              className="gs-contrib__pending"
            >
              <ContributionNotice period={period} />
              <PeriodResolution
                period={period}
                available={available}
                closed={fund.status === "closed"}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="gs-accordion">
        {fund.status !== "closed" && (
          <details
            id={`plan-${fund.id}`}
            open={fund.status === "paused_target_reached" ? true : undefined}
            className="scroll-mt-4"
          >
            <summary>
              Aportaciones mensuales
              {plan ? (plan.nextOn ? " · Activas" : " · Pausadas") : ""}
            </summary>
            <div className="gs-accordion__body">
              <PlanEditor
                key={plan?.version ?? 0}
                fund={fund}
                plan={plan}
                today={today}
              />
            </div>
          </details>
        )}
        {(resolved.length > 0 || changes.length > 0) && (
          <details>
            <summary>Historial de aportaciones</summary>
            <div className="gs-accordion__body">
              {resolved.length > 0 && (
                <ul className="gs-contrib__list">
                  {resolved.map((period) => (
                    <li id={`aporte-${period.id}`} key={period.id}>
                      {formatBankReference(period.scheduledOn)} ·{" "}
                      {formatBankAmount(period)} · {contributionStatus(period)}
                    </li>
                  ))}
                </ul>
              )}
              {changes.length > 0 && (
                <ul className="gs-contrib__list">
                  {changes.map((change) => (
                    <li key={change.id}>
                      {formatBankReference(change.changedOn)} ·{" "}
                      {change.action === "pause"
                        ? "Programación pausada"
                        : `${change.action === "reactivate" ? "Programación reactivada" : "Programación guardada"} · ${formatBankAmount({ currency: fund.currency, amount: change.amount })} el día ${change.preferredDay} desde ${change.effectiveOn ? formatBankReference(change.effectiveOn) : "—"}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
