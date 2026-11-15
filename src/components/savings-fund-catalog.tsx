"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import {
  contributionPending,
  type ContributionChange,
  type ContributionPeriod,
  type ContributionPlan,
} from "@/domain/contribution-plans";
import {
  fundStatuses,
  fundTargetNotices,
  monthsUntil,
  orientativeMonthlySaving,
  parseFundAmount,
  parseFundDate,
  pendingContributionToken,
  targetRemainder,
  type EditableFundStatus,
  type FundAvailability,
  type FundClosureRecord,
  type FundMovement,
  type SavingsFund,
} from "@/domain/savings-funds";
import { useFinancialCommand } from "./financial-command";
import { coverageDecimal, coverageUnits } from "@/domain/fund-coverage";
import { FundContributions } from "./fund-contributions";
import { FundTargetMessage } from "./fund-target-notice";
import {
  EmptyState,
  FormFoot,
  FormPanel,
  PageHead,
  StateTag,
} from "./glaciar/screen";
import { ProgressRing } from "./glaciar-summary/charts";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Icon } from "./ui/icon";

type FundAction = FundMovement["action"];
type Editor =
  | { action: "edit"; fund?: SavingsFund }
  | { action: "close"; fund: SavingsFund; periods: ContributionPeriod[] }
  | { action: FundAction; fund: SavingsFund };

const movementLabels = {
  reserve: { action: "Reservar", origin: "en", confirmed: "Reserva guardada." },
  release: { action: "Liberar", origin: "de", confirmed: "Reserva liberada." },
  transfer: {
    action: "Traspasar",
    origin: "desde",
    confirmed: "Traspaso guardado.",
  },
};

function movementEffects(action: FundAction, currency: string) {
  const effects = {
    reserve: `Baja el disponible libre en ${currency} y sube lo reservado en el fondo.`,
    release: `Sube el disponible libre en ${currency} y baja lo reservado en el fondo.`,
    transfer: `Mueve lo reservado de un fondo a otro en ${currency}; el disponible libre no cambia.`,
  };
  return [
    effects[action],
    "Tu saldo en Bancos no cambia.",
    "No se registra como gasto ni ingreso.",
  ];
}

function formatFundAmount(fund: SavingsFund, amount: string) {
  return formatBankAmount({ currency: fund.currency, amount });
}

/** Exact percent on the four-digit transport scale, or null without target. */
function targetPercent(fund: SavingsFund) {
  const target = fund.targetAmount;
  if (!target) return null;
  const units = (amount: string) => BigInt(amount.replace(".", ""));
  return Number((units(fund.reservedAmount) * BigInt(100)) / units(target));
}

function statusTone(fund: SavingsFund, today: string) {
  if (fund.status === "active") return "good" as const;
  if (fund.status === "paused_target_reached")
    return fundTargetNotices(fund, today).reached
      ? ("good" as const)
      : ("warning" as const);
  return "neutral" as const;
}

/** Exact remainders computed on the four-digit transport scale. */
function TargetProgress({ fund, today }: { fund: SavingsFund; today: string }) {
  const target = fund.targetAmount;
  const remaining = targetRemainder(fund);
  if (!target || remaining === null) return null;
  const reached = BigInt(remaining.replace(".", "")) <= BigInt(0);
  return (
    <div className="gs-fund__text">
      {reached ? (
        <p className="font-medium">Meta alcanzada.</p>
      ) : (
        <p>
          Te faltan {formatFundAmount(fund, remaining)} de{" "}
          {formatFundAmount(fund, target)}.
        </p>
      )}
      {fund.targetDate &&
        !reached &&
        (fund.targetDate < today ? (
          <FundTargetMessage fund={fund} today={today} kind="deadline" />
        ) : (
          (() => {
            const saving = orientativeMonthlySaving(
              remaining,
              monthsUntil(today, fund.targetDate),
            );
            return (
              saving && (
                <p className="lab-muted">
                  Ahorro mensual orientativo: {formatFundAmount(fund, saving)}{" "}
                  hasta {fund.targetDate}.
                </p>
              )
            );
          })()
        ))}
    </div>
  );
}

export function SavingsFundCatalog({
  funds,
  closures,
  availability,
  contributions,
  lifecycleReady,
  today,
  kpis,
}: {
  funds: SavingsFund[];
  closures: FundClosureRecord[];
  availability: FundAvailability[] | null;
  contributions: {
    plans: ContributionPlan[];
    periods: ContributionPeriod[];
    changes: ContributionChange[];
  } | null;
  lifecycleReady: boolean;
  today: string;
  kpis?: ReactNode;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const open = funds.filter(({ status }) => status !== "closed");
  const closed = funds.filter(({ status }) => status === "closed");

  function fundContributions(fund: SavingsFund) {
    if (!contributions) return null;
    return (
      <FundContributions
        fund={fund}
        plan={contributions.plans.find(({ fundId }) => fundId === fund.id)}
        periods={contributions.periods.filter(
          ({ fundId }) => fundId === fund.id,
        )}
        changes={contributions.changes.filter(
          ({ fundId }) => fundId === fund.id,
        )}
        today={today}
        available={
          availability?.find(({ currency }) => currency === fund.currency)
            ?.amount ?? null
        }
      />
    );
  }

  function openEditor(next: Editor, from: HTMLButtonElement) {
    trigger.current = from;
    setMessage("");
    setEditor(next);
  }

  function destinations(source: SavingsFund) {
    return open.filter(
      ({ id, currency }) => id !== source.id && currency === source.currency,
    );
  }

  function close(result?: string) {
    setEditor(null);
    if (result) {
      setMessage(result);
      router.refresh();
    }
    requestAnimationFrame(() => {
      const target = result ? add.current : trigger.current;
      target?.focus();
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Planificación"
        title="Fondos de ahorro"
        description="Organizá reservas virtuales por moneda sin mover el saldo bancario."
        actions={
          <Button
            ref={add}
            variant="primary"
            disabled={editor !== null}
            onClick={(event) =>
              openEditor({ action: "edit" }, event.currentTarget)
            }
          >
            <Icon name="plus" duotone={false} className="size-4" />
            Agregar fondo
          </Button>
        }
      />
      {kpis}
      <p role="status" className={message ? "text-sm" : "sr-only"}>
        {message}
      </p>
      {!availability && (
        <p className="lab-muted text-sm">
          Las operaciones de reserva estarán disponibles cuando se actualice la
          base de datos.
        </p>
      )}
      {editor?.action === "edit" && (
        <FundEditor
          fund={editor.fund}
          close={close}
          lifecycleReady={lifecycleReady}
        />
      )}
      {editor?.action === "close" && (
        <FundClosure
          fund={editor.fund}
          periods={editor.periods}
          close={close}
        />
      )}
      {editor && editor.action !== "edit" && editor.action !== "close" && (
        <FundMovementEditor
          action={editor.action}
          fund={editor.fund}
          destinations={destinations(editor.fund)}
          close={close}
        />
      )}
      <section aria-labelledby="fondos-abiertos" className="gs-stack">
        <h2 id="fondos-abiertos" className="lab-panel__title">
          Tus fondos
          <span className="lab-tag lab-tag--neutral">{open.length}</span>
        </h2>
        <p className="gs-hint">
          Una reserva virtual no mueve Bancos ni crea gastos o ingresos.
        </p>
        {open.length === 0 ? (
          <EmptyState icon="funds" title="Sin fondos de ahorro todavía">
            Todavía no tenés fondos de ahorro. Un fondo separa una parte de tu
            disponible para una meta; es una reserva virtual que no mueve Bancos
            ni crea gastos o ingresos.
          </EmptyState>
        ) : (
          <ul className="gs-fund-list">
            {open.map((fund) => (
              <FundEntry
                key={fund.id}
                fund={fund}
                today={today}
                editDisabled={editor !== null}
                edit={(from) => openEditor({ action: "edit", fund }, from)}
                move={
                  availability
                    ? (action, from) => openEditor({ action, fund }, from)
                    : undefined
                }
                canTransfer={destinations(fund).length > 0}
                closeFund={
                  lifecycleReady && availability
                    ? (from) =>
                        openEditor(
                          {
                            action: "close",
                            fund,
                            periods:
                              contributions?.periods.filter(
                                (period) =>
                                  period.fundId === fund.id &&
                                  contributionPending(period),
                              ) ?? [],
                          },
                          from,
                        )
                    : undefined
                }
              >
                {fundContributions(fund)}
              </FundEntry>
            ))}
          </ul>
        )}
      </section>
      {closed.length > 0 && (
        <details className="lab-panel">
          <summary className="lab-panel__title cursor-pointer">
            Fondos cerrados ({closed.length})
          </summary>
          <ul className="gs-fund-list">
            {closed.map((fund) => (
              <FundEntry
                key={fund.id}
                fund={fund}
                today={today}
                closure={closures.find(({ fundId }) => fundId === fund.id)}
              >
                {fundContributions(fund)}
              </FundEntry>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function FundEntry({
  fund,
  today,
  edit,
  editDisabled,
  move,
  canTransfer,
  closeFund,
  closure,
  children,
}: {
  fund: SavingsFund;
  today: string;
  edit?: (from: HTMLButtonElement) => void;
  editDisabled?: boolean;
  move?: (action: FundAction, from: HTMLButtonElement) => void;
  canTransfer?: boolean;
  closeFund?: (from: HTMLButtonElement) => void;
  closure?: FundClosureRecord;
  children?: ReactNode;
}) {
  const { pausedByTarget, reached, overdue } = fundTargetNotices(fund, today);
  const percent = targetPercent(fund);
  const editable =
    !!edit &&
    (fund.status === "active" ||
      fund.status === "paused_manual" ||
      fund.status === "paused_target_reached");
  const isClosed = fund.status === "closed";
  return (
    <li
      id={`fondo-${fund.id}`}
      className={`lab-panel gs-fund ${isClosed ? "gs-fund--closed" : ""}`}
    >
      <div className="gs-fund__head">
        <div className="min-w-0">
          <h3 className="gs-fund__name">{fund.name}</h3>
          <p className="lab-muted text-xs">{fund.currency}</p>
        </div>
        <StateTag tone={isClosed ? "neutral" : statusTone(fund, today)}>
          {fundStatuses[fund.status]}
        </StateTag>
      </div>
      <div className="gs-fund__body">
        {percent !== null ? (
          <ProgressRing
            value={Math.min(100, percent) / 100}
            color={reached ? "var(--lab-good)" : "var(--lab-accent)"}
            size={76}
            stroke={7}
          >
            <span className="sr-only">Progreso </span>
            {percent} %
          </ProgressRing>
        ) : (
          <span className="gs-fund__ring-empty" aria-hidden="true">
            <Icon name="funds" className="size-6" />
          </span>
        )}
        <div className="min-w-0">
          <p className="lab-muted text-xs font-semibold">Reservado</p>
          <p className="gs-fund__amount">
            {formatBankAmount({
              currency: fund.currency,
              amount: fund.reservedAmount,
            })}
          </p>
          <p className="gs-fund__meta">
            {fund.targetAmount
              ? `Meta ${formatFundAmount(fund, fund.targetAmount)}`
              : "Sin meta"}
            {fund.targetDate && ` · Fecha objetivo ${fund.targetDate}`}
          </p>
        </div>
      </div>
      {fund.committedAmount &&
        coverageUnits(fund.committedAmount) > BigInt(0) && (
          <dl className="gs-review">
            <div>
              <dt>Comprometido con tarjeta</dt>
              <dd>
                {formatBankAmount({
                  currency: fund.currency,
                  amount: fund.committedAmount,
                })}
              </dd>
            </div>
            <div>
              <dt>Reserva sin comprometer</dt>
              <dd>
                {formatBankAmount({
                  currency: fund.currency,
                  amount: coverageDecimal(
                    coverageUnits(fund.reservedAmount) -
                      coverageUnits(fund.committedAmount),
                  ),
                })}
              </dd>
            </div>
          </dl>
        )}
      {!isClosed && (
        <>
          <TargetProgress fund={fund} today={today} />
          {pausedByTarget && (
            <div className="gs-fund__text">
              <FundTargetMessage fund={fund} today={today} kind="pause" />
            </div>
          )}
          {edit && (reached || overdue) && (
            <Button
              variant={reached ? "primary" : "outline"}
              className="self-start"
              disabled={editDisabled}
              onClick={(event) => edit(event.currentTarget)}
            >
              {reached ? "Aumentar meta" : "Revisar meta y fecha"}
            </Button>
          )}
        </>
      )}
      {fund.reservedAmount === "0.0000" && !isClosed && (
        <p className="lab-muted text-sm">Sin dinero reservado todavía.</p>
      )}
      {closure && (
        <p className="gs-fund__text">
          Cerrado el {closure.closedOn}. Se liberaron{" "}
          {formatFundAmount(fund, closure.amount)} al disponible libre.
        </p>
      )}
      {children}
      {(move || editable) && (
        <div className="gs-fund__actions">
          {move &&
            (["reserve", "release", "transfer"] as const).map((action) => {
              const { action: label, origin } = movementLabels[action];
              return (
                <Button
                  key={action}
                  variant={action === "reserve" ? "outline" : "ghost"}
                  aria-label={`${label} ${origin} ${fund.name}`}
                  disabled={
                    editDisabled ||
                    (action !== "reserve" &&
                      fund.reservedAmount === "0.0000") ||
                    (action === "transfer" && !canTransfer)
                  }
                  onClick={(event) => move(action, event.currentTarget)}
                >
                  {label}
                </Button>
              );
            })}
          {editable && (
            <Button
              variant="ghost"
              className="gs-fund__spacer"
              disabled={editDisabled}
              aria-label={`Editar ${fund.name}`}
              onClick={(event) => edit(event.currentTarget)}
            >
              Editar
            </Button>
          )}
          {move && closeFund && (
            <Button
              variant="ghost"
              disabled={editDisabled}
              onClick={(event) => closeFund(event.currentTarget)}
            >
              Cerrar fondo
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function FundClosure({
  fund,
  periods,
  close,
}: {
  fund: SavingsFund;
  periods: ContributionPeriod[];
  close: (message?: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/funds",
    "POST",
  );
  return (
    <FormPanel
      labelId="titulo-cierre-fondo"
      headingRef={heading}
      title={`Cerrar fondo · ${fund.name}`}
    >
      <form
        className="gs-confirm"
        aria-labelledby="titulo-cierre-fondo"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await send({
              action: "close",
              fundId: fund.id,
              version: fund.version,
              pendingToken: await pendingContributionToken(
                periods.map(({ id }) => id),
              ),
            })
          )
            close("Fondo cerrado.");
        }}
      >
        <p>
          Volverán {formatFundAmount(fund, fund.reservedAmount)} al disponible
          libre.
        </p>
        <p>
          Se detendrán las nuevas aportaciones. El historial quedará
          consultable.
        </p>
        <p>Aportaciones pendientes que se descartarán: {periods.length}.</p>
        {periods.length > 0 && (
          <ul className="gs-effects">
            {periods.map((period) => (
              <li key={period.id}>
                {period.scheduledOn} · {formatBankAmount(period)}
              </li>
            ))}
          </ul>
        )}
        <ul className="gs-effects">
          <li>Tu saldo en Bancos no cambia.</li>
          <li>No se registra como gasto ni ingreso.</li>
        </ul>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <FormFoot>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {uncertain ? "Reintentar guardado" : "Confirmar cierre"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
  );
}

function FundMovementEditor({
  action,
  fund,
  destinations,
  close,
}: {
  action: FundAction;
  fund: SavingsFund;
  destinations: SavingsFund[];
  close: (message?: string) => void;
}) {
  const { action: label, origin, confirmed } = movementLabels[action];
  const [review, setReview] = useState<{
    amount: string;
    destination?: SavingsFund;
  }>();
  const [validation, setValidation] = useState("");
  const { send, pending, uncertain, error, clearError } = useFinancialCommand(
    "/api/funds",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewing = review !== undefined;
  useEffect(() => {
    heading.current?.focus();
  }, [reviewing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (review) {
      const saved = await send({
        action,
        fundId: fund.id,
        version: fund.version,
        amount: review.amount,
        ...(review.destination && {
          destinationFundId: review.destination.id,
          destinationVersion: review.destination.version,
        }),
      });
      if (saved) close(confirmed);
      return;
    }
    const form = new FormData(event.currentTarget);
    const amount = parseFundAmount(form.get("amount"));
    if (!amount) {
      setValidation("Ingresá un importe positivo con hasta cuatro decimales.");
      return;
    }
    const destination = destinations.find(
      ({ id }) => id === form.get("destination"),
    );
    if (action === "transfer" && !destination) {
      setValidation("Elegí el fondo de destino.");
      return;
    }
    setValidation("");
    setReview({ amount, destination });
  }

  return (
    <FormPanel
      labelId="titulo-operacion-fondo"
      headingRef={heading}
      title={
        reviewing
          ? `Confirmar ${label.toLowerCase()}`
          : `${label} · ${fund.name}`
      }
      description="Una reserva virtual no mueve Bancos ni crea gastos o ingresos."
    >
      <form
        method="post"
        action="/api/funds"
        aria-labelledby="titulo-operacion-fondo"
        onSubmit={submit}
        className="grid gap-4"
      >
        <fieldset
          hidden={reviewing}
          disabled={reviewing}
          className={reviewing ? "hidden" : "gs-form__grid min-w-0"}
        >
          <Field label={`Importe (${fund.currency})`}>
            <Input name="amount" inputMode="decimal" maxLength={21} required />
          </Field>
          {action === "transfer" && (
            <Field label="Fondo de destino">
              <Select name="destination" required defaultValue="">
                <option value="" disabled>
                  Elegí un fondo
                </option>
                {destinations.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </fieldset>
        {review && (
          <div className="gs-confirm">
            <p className="wrap-anywhere">
              {label}{" "}
              <strong>
                {formatBankAmount({
                  amount: review.amount,
                  currency: fund.currency,
                })}
              </strong>
              {` ${origin} `}
              <strong>{fund.name}</strong>
              {review.destination && (
                <>
                  {" "}
                  hacia <strong>{review.destination.name}</strong>
                </>
              )}
              .
            </p>
            <ul className="gs-effects">
              {movementEffects(action, fund.currency).map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
          </div>
        )}
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <FormFoot>
          <span className="gs-hint">
            {review ? "Paso 2 de 2 · Confirmar" : "Paso 1 de 2 · Revisar"}
          </span>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </Button>
          {review && (
            <Button
              variant="ghost"
              disabled={pending || uncertain}
              onClick={() => {
                clearError();
                setReview(undefined);
              }}
            >
              Modificar
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : review
                  ? "Confirmar operación"
                  : "Revisar operación"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
  );
}

function FundEditor({
  fund,
  close,
  lifecycleReady,
}: {
  fund?: SavingsFund;
  close: (message?: string) => void;
  lifecycleReady: boolean;
}) {
  const reached = fund?.status === "paused_target_reached";
  const [status, setStatus] = useState<EditableFundStatus>(
    fund?.status === "paused_manual" ? "paused_manual" : "active",
  );
  const [validation, setValidation] = useState("");
  const { send, pending, uncertain, error } = useFinancialCommand(
    "/api/funds",
    "POST",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = { name: form.get("name") };
    const meta = String(form.get("targetAmount") ?? "").trim();
    const targetAmount = meta ? parseFundAmount(meta) : null;
    if (meta && !targetAmount) {
      setValidation(
        "Ingresá una meta positiva con hasta cuatro decimales, o quitala.",
      );
      return;
    }
    const deadline = String(form.get("targetDate") ?? "");
    const targetDate = deadline ? parseFundDate(deadline) : null;
    if (deadline && !targetDate) {
      setValidation("Ingresá una fecha válida para la meta, o quitála.");
      return;
    }
    setValidation("");
    const saved = await send(
      fund
        ? {
            action: "update",
            fundId: fund.id,
            version: fund.version,
            ...fields,
            ...(reached ? {} : { status }),
            ...(lifecycleReady ? { targetAmount, targetDate } : {}),
          }
        : { action: "create", currency: form.get("currency"), ...fields },
    );
    if (saved) close(fund ? "Fondo guardado." : "Fondo creado.");
  }

  return (
    <FormPanel
      labelId="titulo-editor-fondo"
      headingRef={heading}
      title={fund ? "Editar fondo" : "Agregar fondo"}
      description={
        fund
          ? undefined
          : "Cada fondo tiene una sola moneda. Podés agregar una meta y una fecha objetivo cuando quieras."
      }
    >
      <form
        method="post"
        action="/api/funds"
        aria-labelledby="titulo-editor-fondo"
        onSubmit={submit}
        className="grid gap-4"
      >
        <fieldset
          disabled={pending || uncertain}
          className="gs-form__grid min-w-0"
        >
          <Field label="Nombre">
            <Input
              name="name"
              required
              maxLength={100}
              defaultValue={fund?.name}
            />
          </Field>
          {fund ? (
            <p className="self-end text-sm">
              Moneda · {fund.currency} (no se modifica)
            </p>
          ) : (
            <Field label="Moneda">
              <Select name="currency" defaultValue="UYU">
                {bankCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {fund &&
            (reached ? (
              <p className="gs-form__full text-sm">
                {fundStatuses[fund.status]}. Reactivar las aportaciones
                automáticas es una decisión expresa desde el aviso.
              </p>
            ) : (
              <Field label="Estado" className="gs-form__full">
                <Select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as EditableFundStatus)
                  }
                >
                  <option value="active">Activo</option>
                  <option value="paused_manual">Pausado</option>
                </Select>
              </Field>
            ))}
          {fund && lifecycleReady && (
            <>
              <Field label={`Meta (${fund.currency}, opcional)`}>
                <Input
                  name="targetAmount"
                  inputMode="decimal"
                  maxLength={21}
                  defaultValue={fund.targetAmount ?? ""}
                  placeholder="Sin meta"
                />
              </Field>
              <Field label="Fecha objetivo (opcional)">
                <Input
                  name="targetDate"
                  type="date"
                  defaultValue={fund.targetDate ?? ""}
                />
              </Field>
              <p className="gs-hint gs-form__full">
                Dejalos vacíos para quitar la meta o la fecha. Cambiarlos no
                mueve dinero ni altera las reservas.
              </p>
            </>
          )}
        </fieldset>
        <p role="alert" className={validation || error ? "text-sm" : "sr-only"}>
          {validation || error}
        </p>
        <FormFoot>
          <Button
            variant="ghost"
            disabled={pending || uncertain}
            onClick={() => close()}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? "Guardando…"
              : uncertain
                ? "Reintentar guardado"
                : fund
                  ? "Guardar fondo"
                  : "Crear fondo"}
          </Button>
        </FormFoot>
      </form>
    </FormPanel>
  );
}
