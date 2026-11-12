"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { bankCurrencies, formatBankAmount } from "@/domain/bank-balances";
import { loanFrequencies, type Loan, type LoanDirection } from "@/domain/loans";
import { type Currency } from "@/domain/money";
import { useFinancialCommand } from "./financial-command";
import { HistoryField, historyControl, historyPrimary } from "./history-fields";

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
    <HistoryField label={label}>
      <input
        className={historyControl}
        name={name}
        inputMode="decimal"
        maxLength={22}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </HistoryField>
  );
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

  return (
    <form method="post" onSubmit={submit} className="grid gap-3">
      <fieldset
        disabled={!hydrated || command.pending || command.uncertain}
        className="grid min-w-0 gap-3"
      >
        {loan ? (
          <HistoryField label="Acción">
            <select
              className={historyControl}
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
            </select>
          </HistoryField>
        ) : (
          <HistoryField label="Operación">
            <select
              className={historyControl}
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
            </select>
          </HistoryField>
        )}
        {!loan && (
          <HistoryField label="Persona, entidad o descripción">
            <input
              className={historyControl}
              name="concept"
              maxLength={200}
              required
            />
          </HistoryField>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {!loan && (
            <HistoryField label="Moneda">
              <select
                key={existing ? "all" : "bank"}
                className={historyControl}
                name="currency"
                required
              >
                {(existing ? bankCurrencies : currencies).map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </HistoryField>
          )}
          {loan && cash && !bankMissing && (
            <HistoryField label="Moneda bancaria">
              <select
                className={historyControl}
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
              </select>
            </HistoryField>
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
          <HistoryField label={cash ? "Fecha efectiva" : "Fecha del registro"}>
            <input
              className={historyControl}
              type="date"
              name="effectiveOn"
              min={loan?.effectiveOn}
              max={today}
              defaultValue={today}
              required
            />
          </HistoryField>
          {!loan && (
            <>
              <HistoryField label="Vencimiento conocido (opcional)">
                <input
                  className={historyControl}
                  type="date"
                  name="dueOn"
                  max="9999-12-31"
                />
              </HistoryField>
              <HistoryField label="Avisar con esta antelación (días)">
                <input
                  className={historyControl}
                  type="number"
                  name="noticeLeadDays"
                  min={0}
                  max={365}
                  defaultValue={3}
                />
              </HistoryField>
            </>
          )}
        </div>
        {!loan && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={installments}
                onChange={(event) => setInstallments(event.target.checked)}
              />
              Préstamo con cuotas
            </label>
            {installments && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AmountField
                  label="Cuota habitual (opcional)"
                  name="installmentAmount"
                />
                <HistoryField label="Frecuencia (opcional)">
                  <select className={historyControl} name="frequency">
                    <option value="">Sin especificar</option>
                    {Object.entries(loanFrequencies).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </HistoryField>
              </div>
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
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={breakdown}
                  onChange={(event) => setBreakdown(event.target.checked)}
                />
                Conozco el desglose completo de la cuota
              </label>
              {breakdown && (
                <div className="grid gap-3 sm:grid-cols-2">
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
                </div>
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
        <HistoryField label="Nota (opcional)">
          <input className={historyControl} name="note" maxLength={500} />
        </HistoryField>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {bankMissing
          ? "Registrá primero un saldo bancario en Resumen."
          : exchange
            ? `Pendiente registrado: ${formatBankAmount({ currency: loan.currency, amount: loan.outstanding })}. Ingresá ambos importes tal como se acordaron.`
            : loan && cash
              ? `Confirmá un ${payable ? "pago" : "cobro"} realizado en Bancos ${loan.currency}. ${payable && loan.installmentLoan && !breakdown ? "El pendiente queda sin cambios hasta conciliarlo." : ""}`
              : loan && action === "interest"
                ? "Aumenta el pendiente y registra el gasto financiero. Bancos cambia cuando registres el pago."
                : loan && action === "adjust"
                  ? `Pendiente registrado: ${formatBankAmount({ currency: loan.currency, amount: loan.outstanding })}. El ajuste solo actualiza la obligación.`
                  : cash
                    ? "Confirmá una entrega o recepción de capital que ya ocurrió en Bancos."
                    : "El alta registra el saldo existente de la obligación."}
      </p>
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
      <button
        className={`${historyPrimary} justify-self-start`}
        disabled={!hydrated || command.pending || bankMissing}
      >
        {command.uncertain ? "Reintentar el mismo envío" : submitLabel}
      </button>
    </form>
  );
}
