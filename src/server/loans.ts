import "server-only";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Loan, LoanCommand, LoanOperation } from "../domain/loans.ts";
import { Money, type Currency } from "../domain/money.ts";
import { listBankBalances, lockBankWrites } from "./bank-balances.ts";
import { commandHash, findReplay } from "./movements.ts";

const zero = "0.0000";
const units = (amount: string) => BigInt(amount.replace(".", ""));
const conflict = (message: string) =>
  ({ status: "conflict", message }) as const;

const loanFields = `l.id, f.concept, l.direction, l.currency,
  l.installment_loan AS "installmentLoan", l.installment_amount::text AS "installmentAmount",
  l.frequency, to_char(l.due_on, 'YYYY-MM-DD') AS "dueOn",
  o.outstanding::text, o.accrued_interest::text AS "accruedInterest",
  o.needs_reconciliation AS "needsReconciliation", o.version,
  to_char(latest.effective_on, 'YYYY-MM-DD') AS "effectiveOn"`;
const loanSource = `FROM finance.loans l
  JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.id)
  JOIN LATERAL (
    SELECT * FROM finance.loan_operations WHERE (owner_id, loan_id) = (l.owner_id, l.id)
     ORDER BY version DESC LIMIT 1
  ) o ON true
  JOIN finance.financial_events latest ON (latest.owner_id, latest.id) = (o.owner_id, o.event_id)`;

export async function listLoans(
  client: pg.PoolClient,
  ownerId: string,
  expenseId?: string,
) {
  const { rows } = await client.query<Loan>(
    `SELECT ${loanFields} ${loanSource} WHERE l.owner_id = $1
      ${expenseId ? "AND l.source_expense_id = $2" : ""}
      ORDER BY (o.outstanding = 0 AND NOT o.needs_reconciliation), l.due_on NULLS LAST, lower(f.concept), l.id`,
    expenseId ? [ownerId, expenseId] : [ownerId],
  );
  return rows;
}

export async function findLoan(
  client: pg.PoolClient,
  ownerId: string,
  loanId: string,
) {
  const { rows } = await client.query<Loan>(
    `SELECT ${loanFields} ${loanSource} WHERE l.owner_id = $1 AND l.id = $2`,
    [ownerId, loanId],
  );
  return rows[0];
}

export async function listLoanOperations(
  client: pg.PoolClient,
  ownerId: string,
  lookup: { loanId: string } | { eventId: string },
) {
  const { rows } = await client.query<LoanOperation>(
    `SELECT o.event_id AS id, o.loan_id AS "loanId", o.action, l.direction, o.currency, o.amount::text,
            b.amount_signed::text AS "bankDelta", b.currency AS "bankCurrency",
            CASE WHEN b.currency <> o.currency
              THEN trim_scale(round(abs(b.amount_signed)::numeric(60,32) / nullif(o.amount, 0), 8))::text END AS "effectiveRate",
            o.outstanding::text, prev.outstanding::text AS "previousOutstanding",
            o.accrued_interest::text AS "accruedInterest", o.principal_paid::text AS "principalPaid",
            o.accrued_paid::text AS "accruedPaid", o.expense::text, o.needs_reconciliation AS "needsReconciliation",
            to_char(f.effective_on, 'YYYY-MM-DD') AS "effectiveOn", o.note
       FROM finance.loan_operations o
       JOIN finance.loans l ON (l.owner_id, l.id) = (o.owner_id, o.loan_id)
       JOIN finance.financial_events f ON (f.owner_id, f.id) = (o.owner_id, o.event_id)
       LEFT JOIN finance.bank_effects b ON (b.owner_id, b.event_id, b.id) = (o.owner_id, o.event_id, o.event_id)
       LEFT JOIN finance.loan_operations prev
         ON (prev.owner_id, prev.loan_id, prev.version) = (o.owner_id, o.loan_id, o.version - 1)
      WHERE o.owner_id = $1 AND o.${"loanId" in lookup ? "loan_id" : "event_id"} = $2
      ORDER BY o.version DESC`,
    [ownerId, "loanId" in lookup ? lookup.loanId : lookup.eventId],
  );
  return rows;
}

type Effects = {
  outstanding: string;
  accruedInterest: string;
  needsReconciliation: boolean;
  bankDelta?: string;
  expense?: string;
  principalPaid?: string;
  accruedPaid?: string;
};

function settle(
  command: Extract<LoanCommand, { action: "settle" }>,
  loan: Loan,
): Effects | { error: string } {
  const { principal, financialCharges, accruedPaid, exchange } = command;
  const amount = exchange?.appliedAmount ?? command.amount;
  const money = (value: string) => Money.parse(value, loan.currency);
  const bankDelta =
    loan.direction === "payable" ? `-${command.amount}` : command.amount;
  const base = {
    outstanding: loan.outstanding,
    accruedInterest: loan.accruedInterest,
    needsReconciliation: loan.needsReconciliation,
    bankDelta,
  };
  if (loan.outstanding === zero)
    return { error: "La obligación ya está saldada." };
  if (exchange?.bankCurrency === loan.currency)
    return { error: "Para usar dos importes elegí otra moneda bancaria." };
  if (exchange && units(amount) > units(loan.outstanding))
    return { error: "El importe acordado supera el saldo pendiente." };
  if (
    !exchange &&
    loan.direction === "payable" &&
    loan.installmentLoan &&
    principal === null &&
    financialCharges === null &&
    accruedPaid === null
  )
    return { ...base, needsReconciliation: true };

  let principalPaid: string;
  let interestPaid = zero;
  let expense = zero;
  if (!exchange && loan.direction === "payable" && loan.installmentLoan) {
    if (
      principal === null ||
      financialCharges === null ||
      accruedPaid !== null ||
      units(principal) + units(financialCharges) !== units(amount)
    )
      return {
        error:
          "El capital y los cargos financieros confirmados deben sumar el importe pagado.",
      };
    principalPaid = principal;
    expense = financialCharges;
  } else {
    if (
      principal !== null ||
      financialCharges !== null ||
      (accruedPaid !== null && loan.direction === "receivable")
    )
      return { error: "El desglose no corresponde a esta obligación." };
    if (
      loan.accruedInterest !== zero &&
      amount !== loan.outstanding &&
      accruedPaid === null
    )
      return {
        error:
          "Indicá cuánto del pago corresponde a intereses ya registrados, incluso si es cero.",
      };
    interestPaid =
      accruedPaid ??
      (amount === loan.outstanding ? loan.accruedInterest : zero);
    if (
      units(interestPaid) > units(amount) ||
      units(interestPaid) > units(loan.accruedInterest)
    )
      return {
        error: "El interés abonado supera el pago o el interés pendiente.",
      };
    principalPaid = money(amount).add(money(interestPaid).negate()).toDecimal();
  }
  if (
    units(principalPaid) >
    units(loan.outstanding) - units(loan.accruedInterest)
  )
    return { error: "El capital abonado supera el capital pendiente." };

  return {
    ...base,
    outstanding: money(loan.outstanding)
      .add(money(principalPaid).negate())
      .add(money(interestPaid).negate())
      .toDecimal(),
    accruedInterest: money(loan.accruedInterest)
      .add(money(interestPaid).negate())
      .toDecimal(),
    principalPaid,
    accruedPaid: interestPaid,
    expense,
  };
}

function changeEffects(
  command: Extract<LoanCommand, { loanId: string }>,
  loan: Loan,
): Effects | { error: string } {
  if (command.action === "settle") return settle(command, loan);
  if (command.action === "adjust") {
    const accruedInterest = command.accruedInterest ?? loan.accruedInterest;
    if (
      units(accruedInterest) > units(loan.accruedInterest) ||
      units(accruedInterest) > units(command.amount)
    )
      return {
        error:
          "Indicá el interés pendiente real. Para registrar un interés nuevo usá Registrar intereses.",
      };
    return {
      outstanding: command.amount,
      accruedInterest,
      needsReconciliation: false,
    };
  }
  if (
    loan.direction !== "payable" ||
    loan.installmentLoan ||
    loan.outstanding === zero
  )
    return {
      error:
        "Los intereses devengados corresponden a una deuda simple por pagar.",
    };
  const amount = Money.parse(command.amount, loan.currency);
  try {
    return {
      outstanding: amount
        .add(Money.parse(loan.outstanding, loan.currency))
        .toDecimal(),
      accruedInterest: amount
        .add(Money.parse(loan.accruedInterest, loan.currency))
        .toDecimal(),
      expense: command.amount,
      needsReconciliation: loan.needsReconciliation,
    };
  } catch {
    return { error: "El saldo resultante supera el importe admitido." };
  }
}

function openingEffects(
  command: Exclude<LoanCommand, { loanId: string }>,
): Effects {
  return {
    outstanding: command.agreedTotal ?? command.amount,
    accruedInterest: zero,
    needsReconciliation: false,
    bankDelta:
      command.action === "lend"
        ? `-${command.amount}`
        : command.action === "borrow"
          ? command.amount
          : undefined,
  };
}

export async function saveLoanOperation(
  client: pg.PoolClient,
  ownerId: string,
  command: LoanCommand,
) {
  await lockBankWrites(client, ownerId);
  const { idempotencyKey, effectiveOn, action, amount, note } = command;
  const hash = commandHash(["loan-operation", JSON.stringify(command)]);
  const replay = await findReplay(client, ownerId, idempotencyKey, hash);
  if (replay?.status === "conflict")
    return conflict("La clave ya se usó para otro registro.");
  if (replay) return replay;

  const id = randomUUID();
  let loanId: string = id;
  let version = 1;
  let currency: Currency;
  let concept: string;
  let effects: Effects | { error: string };
  if ("loanId" in command) {
    const loan = await findLoan(client, ownerId, command.loanId);
    if (!loan) return { status: "not-found" } as const;
    if (loan.version !== command.expectedVersion)
      return conflict(
        "La obligación cambió. Actualizá la página y revisá el saldo.",
      );
    if (effectiveOn < loan.effectiveOn)
      return conflict(
        "La fecha debe ser igual o posterior al último registro de esta obligación.",
      );
    ({ id: loanId, currency, concept } = loan);
    version = loan.version + 1;
    effects = changeEffects(command, loan);
  } else {
    ({ currency, concept } = command);
    effects = openingEffects(command);
  }
  if ("error" in effects) return conflict(effects.error);
  const exchange = action === "settle" ? command.exchange : undefined;
  const bankCurrency = exchange?.bankCurrency ?? currency;
  if (effects.bankDelta) {
    const [bank] = await listBankBalances(client, ownerId, [bankCurrency]);
    if (!bank)
      return conflict("Registrá primero un saldo de Bancos en esa moneda.");
    if (
      effects.bankDelta.startsWith("-") &&
      units(bank.calculatedAmount ?? bank.amount) < units(amount)
    )
      return conflict("El saldo de Bancos en esa moneda es insuficiente.");
  }

  await client.query(
    `INSERT INTO finance.financial_events
      (owner_id, id, kind, concept, effective_on, idempotency_key, command_hash, created_at)
      VALUES ($1, $2, 'loan_operation', $3, $4, $5, $6, clock_timestamp())`,
    [ownerId, id, concept, effectiveOn, idempotencyKey, hash],
  );
  if (!("loanId" in command)) {
    await client.query(
      `INSERT INTO finance.loans (owner_id, id, direction, currency, installment_loan, installment_amount, frequency, due_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        ownerId,
        id,
        command.direction,
        currency,
        command.installmentLoan,
        command.installmentAmount,
        command.frequency,
        command.dueOn,
      ],
    );
  }
  await client.query(
    `INSERT INTO finance.loan_operations (owner_id, event_id, loan_id, currency, version, action, amount,
       outstanding, accrued_interest, principal_paid, accrued_paid, expense, needs_reconciliation, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      ownerId,
      id,
      loanId,
      currency,
      version,
      action,
      // The loan row is always in the obligation currency. The linked bank
      // effect holds the other amount and currency for a cross-currency settlement.
      exchange?.appliedAmount ?? amount,
      effects.outstanding,
      effects.accruedInterest,
      effects.principalPaid ?? null,
      effects.accruedPaid ?? zero,
      effects.expense ?? zero,
      effects.needsReconciliation,
      note,
    ],
  );
  if (effects.bankDelta)
    await client.query(
      `INSERT INTO finance.bank_effects (owner_id, id, event_id, currency, amount_signed, effective_on)
       VALUES ($1, $2, $2, $3, $4, $5)`,
      [ownerId, id, bankCurrency, effects.bankDelta, effectiveOn],
    );
  await client.query(
    "INSERT INTO finance.audit_changes (owner_id, id, event_id, change_type) VALUES ($1, $2, $2, 'created')",
    [ownerId, id],
  );
  return { status: "created", id } as const;
}
