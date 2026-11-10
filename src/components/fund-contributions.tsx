"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBankAmount } from "@/domain/bank-balances";
import {
  contributionPending,
  type ContributionChange,
  type ContributionPeriod,
  type ContributionPlan,
} from "@/domain/contribution-plans";
import { parseFundAmount, type SavingsFund } from "@/domain/savings-funds";
import {
  firstContributionDate,
  isContributionDay,
} from "@/domain/scheduled-contributions";
import { useFinancialCommand } from "./financial-command";

const endpoint = "/api/funds/contributions";
const button =
  "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60";
const input =
  "block min-h-11 w-full rounded-lg border bg-background px-3 text-base";

export function contributionStatus(period: ContributionPeriod) {
  if (contributionPending(period)) return "Pendiente";
  return `${period.status === "completed" ? "Completada" : "Descartada"} el ${period.resolvedOn}`;
}

export function ContributionNotice({ period }: { period: ContributionPeriod }) {
  const reason = {
    insufficient: "No había suficiente dinero disponible.",
    late: "La ejecución automática no se realizó en la fecha programada.",
    fund_limit: "El aporte superaba el máximo admitido para el fondo.",
  };
  return (
    <>
      <p className="font-medium">
        {period.fundName} · {formatBankAmount(period)} · {period.scheduledOn}
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
    <div className="space-y-2">
      <p>
        Disponible actual{" "}
        {available === null
          ? "sin saldo bancario configurado"
          : formatBankAmount({ currency: period.currency, amount: available })}
      </p>
      {action ? (
        <form
          className="space-y-2"
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
              ? `Reservar ${formatBankAmount(period)} para la aportación del ${period.scheduledOn}.`
              : `Descartar la aportación del ${period.scheduledOn}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={button} disabled={pending}>
              {uncertain
                ? "Reintentar envío"
                : action === "complete"
                  ? "Confirmar aportación"
                  : "Confirmar descarte"}
            </button>
            <button
              type="button"
              className={button}
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
        <div className="flex flex-wrap gap-2">
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
            className={button}
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
  const canConfigure = !plan || editing;
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
      setMessage(
        action === "pause" ? "Programación pausada." : "Programación guardada.",
      );
      router.refresh();
    }
  }

  return (
    <div className="grid gap-2">
      {plan?.nextOn && plan.nextAmount && (
        <p>
          Próxima aportación{" "}
          {formatBankAmount({
            currency: fund.currency,
            amount: plan.nextAmount,
          })}{" "}
          el {plan.nextOn}.
        </p>
      )}
      {paused && <p>Programación pausada.</p>}
      {fund.status === "active" &&
        (canConfigure ? (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("configure");
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label>
                Importe mensual ({fund.currency})
                <input
                  className={input}
                  required
                  inputMode="decimal"
                  value={amount}
                  disabled={busy}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Día del mes
                <input
                  className={input}
                  required
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  disabled={busy}
                  onChange={(event) => setDay(event.target.value)}
                />
              </label>
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
                . Primera fecha {preview}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={button}
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
                  className={button}
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
        ) : paused && plan ? (
          <div className="space-y-2">
            <p>
              Al reactivar, el primer aporte será de{" "}
              {formatBankAmount({
                currency: fund.currency,
                amount: plan.amount,
              })}{" "}
              el {firstContributionDate(today, plan.preferredDay)}.
            </p>
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={() => void submit("reactivate")}
            >
              {uncertain ? "Reintentar envío" : "Reactivar aportaciones"}
            </button>
          </div>
        ) : pausing ? (
          <div className="space-y-2">
            <p>Los períodos pendientes seguirán disponibles para resolver.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => void submit("pause")}
              >
                {uncertain ? "Reintentar envío" : "Confirmar pausa"}
              </button>
              <button
                type="button"
                className={button}
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => setEditing(true)}
            >
              Editar programación
            </button>
            <button
              type="button"
              className={button}
              onClick={() => setPausing(true)}
            >
              Pausar aportaciones
            </button>
          </div>
        ))}
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
  if (!plan && fund.status !== "active") return null;
  const pending = periods.filter(contributionPending);
  const resolved = periods.filter((period) => !contributionPending(period));
  return (
    <section
      className="grid gap-3 border-t pt-3 text-sm"
      aria-label={`Aportaciones de ${fund.name}`}
    >
      {pending.length > 0 && (
        <ul className="grid gap-2">
          {pending.map((period) => (
            <li
              key={period.id}
              id={`aporte-${period.id}`}
              className="space-y-2 rounded-lg border border-amber-500/70 p-3"
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
      {fund.status !== "closed" && (
        <details className="space-y-2">
          <summary className="cursor-pointer font-semibold">
            Aportaciones mensuales
            {plan ? (plan.nextOn ? " · Activas" : " · Pausadas") : ""}
          </summary>
          <PlanEditor
            key={plan?.version ?? 0}
            fund={fund}
            plan={plan}
            today={today}
          />
        </details>
      )}
      {(resolved.length > 0 || changes.length > 0) && (
        <details className="space-y-2">
          <summary className="cursor-pointer font-semibold">
            Historial de aportaciones
          </summary>
          {resolved.length > 0 && (
            <ul className="space-y-1">
              {resolved.map((period) => (
                <li id={`aporte-${period.id}`} key={period.id}>
                  {period.scheduledOn} · {formatBankAmount(period)} ·{" "}
                  {contributionStatus(period)}
                </li>
              ))}
            </ul>
          )}
          {changes.length > 0 && (
            <ul className="space-y-1">
              {changes.map((change) => (
                <li key={change.id}>
                  {change.changedOn} ·{" "}
                  {change.action === "pause"
                    ? "Programación pausada"
                    : `${change.action === "reactivate" ? "Programación reactivada" : "Programación guardada"} · ${formatBankAmount({ currency: fund.currency, amount: change.amount })} el día ${change.preferredDay} desde ${change.effectiveOn}`}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}
