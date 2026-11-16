"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import { loanFrequencies, type Loan, type LoanDirection } from "@/domain/loans";
import { type Currency } from "@/domain/money";
import { useFinancialCommand } from "./financial-command";
import { NameAutocomplete } from "./name-autocomplete";
import { personNameLimit } from "@/domain/catalog";
import { historyControl } from "./history-fields";
import { buttonClass } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { FormFoot } from "./glaciar/screen";

function AmountField({
  label,
  name,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        inputMode="decimal"
        maxLength={22}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </Field>
  );
}

// UI-05F — «Qué cambia al confirmar»: describe los efectos que ya produce el
// comando (sin cambiarlos). Solo texto; no hay una segunda ejecución.
function loanEffects({
  loan,
  action,
  origin,
  existing,
  exchange,
  breakdown,
}: {
  loan?: Loan;
  action: "settle" | "adjust" | "interest";
  origin: string;
  existing: boolean;
  exchange: boolean;
  breakdown: boolean;
}): string[] {
  if (!loan) {
    if (existing)
      return [
        "No mueve Bancos: registra un saldo que ya existía.",
        "El importe no se cuenta como ingreso ni como gasto.",
      ];
    return origin === "lend"
      ? [
          "Baja Bancos por el capital entregado.",
          "El capital no es un gasto: queda como dinero por cobrar.",
        ]
      : [
          "Sube Bancos por el capital recibido.",
          "El capital no es un ingreso: queda como deuda por pagar.",
        ];
  }
  if (action === "adjust")
    return [
      "Solo actualiza el pendiente de la obligación.",
      "No mueve Bancos ni registra ingresos o gastos.",
      ...(loan.needsReconciliation
        ? ["Concilia los pagos registrados sin desglose."]
        : []),
    ];
  if (action === "interest")
    return [
      "Aumenta el pendiente y registra el gasto financiero.",
      "Bancos cambia cuando registres el pago.",
    ];
  if (loan.direction === "receivable")
    return exchange
      ? [
          "Sube Bancos por el importe cobrado en su moneda.",
          "Lo que te deben baja por el importe acordado.",
          "El cobro no se cuenta como ingreso.",
        ]
      : [
          "Sube Bancos por el importe cobrado.",
          "Lo que te deben baja por ese importe; el cobro no se cuenta como ingreso.",
        ];
  if (exchange)
    return [
      "Bancos baja por el importe pagado en su moneda.",
      "El pendiente baja por el importe acordado.",
      "El pago no se registra como gasto.",
    ];
  if (loan.installmentLoan)
    return breakdown
      ? [
          "Baja Bancos por el total de la cuota.",
          "El capital reduce la deuda; no es un gasto.",
          "Solo los intereses y cargos se registran como gasto financiero.",
        ]
      : [
          "Baja Bancos por el importe pagado.",
          "El pendiente queda sin cambios y no se registra gasto financiero hasta conciliarlo con el desglose.",
        ];
  return [
    "Baja Bancos por el importe pagado y reduce el pendiente.",
    "El pago no se registra como gasto.",
  ];
}

type FormProps = {
  today: string;
  loan?: Loan;
  currencies: Currency[];
  linkedExpense?: boolean;
};

const subscribeToHydration = () => () => {};

export function LoanForm({
  today,
  loan,
  currencies,
  linkedExpense,
}: FormProps) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [origin, setOrigin] = useState("existing-payable");
  const [selectedAction, setAction] = useState<
    "settle" | "adjust" | "interest"
  >("settle");
  const [installments, setInstallments] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [selectedBankCurrency, setBankCurrency] = useState<Currency>();
  const [saved, setSaved] = useState(false);
  const command = useFinancialCommand("/api/loans", "POST");
  const payable = loan?.direction === "payable";
  const existing = origin.startsWith("existing-");
  const canAccrue =
    payable && !loan.installmentLoan && loan.outstanding !== "0.0000";
  const action = loan?.outstanding === "0.0000" ? "adjust" : selectedAction;
  const cash = loan ? action === "settle" : !existing;
  const bankCurrency =
    selectedBankCurrency && currencies.includes(selectedBankCurrency)
      ? selectedBankCurrency
      : loan && currencies.includes(loan.currency)
        ? loan.currency
        : currencies[0];
  const exchange =
    loan && cash && bankCurrency && bankCurrency !== loan.currency;
  const bankMissing = cash && currencies.length === 0;
  const amountLabel = !loan
    ? existing
      ? "Importe pendiente"
      : "Capital"
    : action === "adjust"
      ? "Nuevo pendiente total"
      : action === "interest"
        ? "Interés real devengado"
        : `Importe ${payable ? "pagado" : "cobrado"}${bankCurrency ? ` en Bancos (${bankCurrency})` : ""}`;
  const submitLabel = !loan
    ? "Registrar obligación"
    : action === "adjust"
      ? "Guardar pendiente"
      : action === "interest"
        ? "Registrar intereses"
        : payable
          ? "Confirmar pago"
          : "Confirmar cobro";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = Object.fromEntries(data);
    setSaved(false);
    const fields = loan
      ? { ...values, action, loanId: loan.id, expectedVersion: loan.version }
      : {
          ...values,
          action: existing ? "existing" : origin,
          direction: (origin === "lend" || origin === "existing-receivable"
            ? "receivable"
            : "payable") satisfies LoanDirection,
          installmentLoan: installments,
        };
    if (await command.send(fields)) {
      form.reset();
      setBreakdown(false);
      setSaved(true);
      router.refresh();
    }
  }

  const effects = bankMissing
    ? []
    : loanEffects({
        loan,
        action,
        origin,
        existing,
        exchange: !!exchange,
        breakdown,
      });
  const context = bankMissing
    ? "Registrá primero un saldo bancario en Resumen."
    : exchange
      ? `Pendiente registrado: ${formatBankAmount({ currency: loan.currency, amount: loan.outstanding })}. Ingresá ambos importes tal como se acordaron.`
      : loan && cash
        ? `Confirmá un ${payable ? "pago" : "cobro"} realizado en Bancos ${loan.currency}.`
        : loan && action === "adjust"
          ? `Pendiente registrado: ${formatBankAmount({ currency: loan.currency, amount: loan.outstanding })}.`
          : !loan && cash
            ? "Confirmá una entrega o recepción de capital que ya ocurrió en Bancos."
            : "";

  return (
    <form method="post" onSubmit={submit} className="grid gap-4">
      <fieldset
        disabled={!hydrated || command.pending || command.uncertain}
        className="gs-form__grid min-w-0 border-0 p-0"
      >
        {loan ? (
          <Field label="Acción">
            <Select
              value={action}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "settle" ||
                  value === "adjust" ||
                  value === "interest"
                )
                  setAction(value);
                setBreakdown(false);
                setSaved(false);
                command.clearError();
              }}
            >
              {loan.outstanding !== "0.0000" && (
                <option value="settle">
                  {payable ? "Registrar pago" : "Registrar cobro"}
                </option>
              )}
              <option value="adjust">Actualizar importe pendiente</option>
              {canAccrue && (
                <option value="interest">Registrar intereses</option>
              )}
            </Select>
          </Field>
        ) : (
          <Field label="Operación" className="gs-form__full">
            <Select
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value);
                setSaved(false);
                command.clearError();
              }}
            >
              <option value="existing-payable">
                Registrar deuda existente
              </option>
              <option value="existing-receivable">
                Registrar dinero por cobrar existente
              </option>
              <option value="borrow">Recibir préstamo</option>
              <option value="lend">Prestar dinero</option>
            </Select>
          </Field>
        )}
        {!loan && (
          <>
            <Field label="Persona, entidad o descripción">
              <Input name="concept" maxLength={200} required />
            </Field>
            <NameAutocomplete
              kind="person"
              name="personName"
              label="Contacto (opcional)"
              maxLength={personNameLimit}
              className={historyControl}
            />
          </>
        )}
        {!loan && (
          <Field label="Moneda">
            <Select key={existing ? "all" : "bank"} name="currency" required>
              {(existing ? bankCurrencies : currencies).map((code) => (
                <option key={code}>{code}</option>
              ))}
            </Select>
          </Field>
        )}
        {loan && cash && !bankMissing && (
          <Field label="Moneda bancaria">
            <Select
              name={exchange ? "bankCurrency" : undefined}
              value={bankCurrency}
              onChange={(event) => {
                setBankCurrency(
                  currencies.find((code) => code === event.target.value),
                );
                setBreakdown(false);
                setSaved(false);
                command.clearError();
              }}
            >
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </Select>
          </Field>
        )}
        <AmountField
          key={amountLabel}
          defaultValue={
            linkedExpense && loan && action === "settle" && !exchange
              ? loan.outstanding
              : undefined
          }
          label={amountLabel}
          name="amount"
          required
        />
        {exchange && (
          <AmountField
            name="appliedAmount"
            label={`Importe acordado que reduce el pendiente (${loan.currency})`}
            defaultValue={linkedExpense ? loan.outstanding : undefined}
            required
          />
        )}
        <Field label={cash ? "Fecha efectiva" : "Fecha del registro"}>
          <Input
            type="date"
            name="effectiveOn"
            min={loan?.effectiveOn}
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        {!loan && (
          <>
            <Field label="Vencimiento conocido (opcional)">
              <Input type="date" name="dueOn" max="9999-12-31" />
            </Field>
            <Field label="Avisar con esta antelación (días)">
              <Input
                type="number"
                name="noticeLeadDays"
                min={0}
                max={365}
                defaultValue={3}
              />
            </Field>
            <label className="gs-check gs-form__full">
              <input
                type="checkbox"
                checked={installments}
                onChange={(event) => setInstallments(event.target.checked)}
              />
              Préstamo con cuotas
            </label>
            {installments && (
              <>
                <AmountField
                  label="Cuota habitual (opcional)"
                  name="installmentAmount"
                />
                <Field label="Frecuencia (opcional)">
                  <Select name="frequency">
                    <option value="">Sin especificar</option>
                    {Object.entries(loanFrequencies).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
            {!installments && origin === "lend" && (
              <AmountField
                label="Total acordado por cobrar (opcional)"
                name="agreedTotal"
              />
            )}
          </>
        )}
        {loan &&
          payable &&
          loan.installmentLoan &&
          action === "settle" &&
          !exchange && (
            <>
              <label className="gs-check gs-form__full">
                <input
                  type="checkbox"
                  checked={breakdown}
                  onChange={(event) => setBreakdown(event.target.checked)}
                />
                Conozco el desglose completo de la cuota
              </label>
              {breakdown && (
                <>
                  <AmountField
                    name="principal"
                    label="Capital amortizado"
                    required
                  />
                  <AmountField
                    name="financialCharges"
                    label="Intereses y cargos pagados"
                    required
                  />
                </>
              )}
            </>
          )}
        {loan && loan.accruedInterest !== "0.0000" && action === "settle" && (
          <AmountField
            name="accruedPaid"
            label={`Interés ya registrado incluido en el pago (${loan.currency})`}
            placeholder="Opcional si saldás toda la deuda"
          />
        )}
        {loan && loan.accruedInterest !== "0.0000" && action === "adjust" && (
          <AmountField
            name="accruedInterest"
            label="Interés devengado que sigue pendiente (opcional)"
            placeholder={loan.accruedInterest}
          />
        )}
        <Field label="Nota (opcional)" className="gs-form__full">
          <Input name="note" maxLength={500} />
        </Field>
      </fieldset>
      <div className="gs-confirm">
        {context && <p className="gs-hint">{context}</p>}
        {effects.length > 0 && (
          <>
            <p className="gs-form__section-title">Qué cambia al confirmar</p>
            <ul className="gs-effects" aria-label="Qué cambia al confirmar">
              {effects.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {command.error && (
        <p role="alert" className="text-sm">
          {command.error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Operación registrada.
        </p>
      )}
      <FormFoot>
        <button
          className={buttonClass("primary")}
          disabled={!hydrated || command.pending || bankMissing}
        >
          {command.uncertain ? "Reintentar el mismo envío" : submitLabel}
        </button>
      </FormFoot>
    </form>
  );
}
