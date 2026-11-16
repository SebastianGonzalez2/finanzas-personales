import { randomUUID } from "node:crypto";
import { parseBankBenefitCommand } from "../../src/domain/bank-benefits.ts";
import { parseBudgetCommand } from "../../src/domain/budgets.ts";
import { parseCreditCommand } from "../../src/domain/credit-operations.ts";
import { parseLoanCommand } from "../../src/domain/loans.ts";
import { parseMovement } from "../../src/domain/movements.ts";
import { parseRecurrence } from "../../src/domain/recurrence-definition.ts";
import { parseSettlement } from "../../src/domain/recurrence-settlements.ts";
import { parseRefundCommand } from "../../src/domain/refunds.ts";
import { parseSharedExpense } from "../../src/domain/shared-expenses.ts";
import { saveOpeningBalance } from "../../src/server/bank-balances.ts";
import { saveBankBenefit } from "../../src/server/bank-benefits.ts";
import { saveManualFx } from "../../src/server/exchange-rates.ts";
import { saveBudget } from "../../src/server/budgets.ts";
import { parseCycleCommand } from "../../src/domain/card-cycles.ts";
import { saveCard } from "../../src/server/cards.ts";
import { saveCardCycle } from "../../src/server/card-cycles.ts";
import { saveSavedFilterCommand } from "../../src/server/history-filters.ts";
import { createCatalogCategory } from "../../src/server/categories.ts";
import { saveTag } from "../../src/server/classification.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { saveLoanOperation } from "../../src/server/loans.ts";
import { saveMovement } from "../../src/server/movements.ts";
import {
  applySettlement,
  trackedPeriods,
} from "../../src/server/recurrence-settlements.ts";
import { createRecurrence } from "../../src/server/recurrences.ts";
import { saveDisplayCurrency } from "../../src/server/exchange-rates.ts";
import { saveRefund } from "../../src/server/refunds.ts";
import { saveSavingsFund } from "../../src/server/savings-funds.ts";
import { saveSharedExpense } from "../../src/server/shared-expenses.ts";
import {
  cardCommand,
  creditPayment,
  creditPurchase,
  loanLend,
  loanSettle,
  openingBalance,
  sharedExpense,
} from "./f2-10-fixtures.mjs";

const today = "2026-01-15";

function parsed(result) {
  if ("error" in result) throw new Error(result.error);
  return result;
}

function created(result) {
  if (result.status !== "created" && result.status !== "saved")
    throw new Error(`Alta sintética rechazada: ${JSON.stringify(result)}`);
  return result;
}

// F6-04: sintetic-only dataset that touches the financial domain broadly
// (bank, cards, loans, shared expenses, refunds, funds, budgets, recurrences,
// classification and benefits) using the real services, so a disaster-recovery
// test replays rows produced by production code paths rather than hand SQL.
export async function seedFinancialDomain(
  client,
  ownerId,
  { rich = true } = {},
) {
  await saveOpeningBalance(client, ownerId, openingBalance());
  await saveOpeningBalance(
    client,
    ownerId,
    openingBalance({ currency: "USD", amount: "9999999999999.9999" }),
  );
  await saveDisplayCurrency(client, ownerId, "UYU");
  const food = created(
    await createCatalogCategory(client, ownerId, {
      kind: "expense",
      name: "Comida sintética",
      parentId: null,
    }),
  );
  const tagId = randomUUID();
  await saveTag(client, ownerId, {
    action: "create",
    id: tagId,
    name: "Etiqueta sintética",
  });
  await saveMovement(
    client,
    ownerId,
    parsed(
      parseMovement(
        {
          kind: "expense",
          currency: "UYU",
          amount: "1234.5678",
          effectiveOn: "2026-01-05",
          method: "debit",
          concept: "Almuerzo sintético",
          note: "Nota de prueba",
          merchantName: "Comercio sintético",
          tagIds: [tagId],
          allocations: [
            { categoryId: food.id, amount: "1000.0000" },
            { categoryId: null, amount: "234.5678" },
          ],
          idempotencyKey: randomUUID(),
        },
        today,
      ),
    ),
  );
  if (!rich) return {};

  await createCatalogCategory(client, ownerId, {
    kind: "expense",
    name: "Panadería sintética",
    parentId: food.id,
  });
  await saveBudget(
    client,
    ownerId,
    parsed(
      parseBudgetCommand(
        {
          idempotencyKey: randomUUID(),
          action: "save",
          categoryId: food.id,
          currency: "UYU",
          amount: "5000",
        },
        today,
      ),
    ),
    today,
  );
  const fund = created(
    await saveSavingsFund(client, ownerId, {
      action: "create",
      name: "Fondo sintético",
      currency: "UYU",
      idempotencyKey: randomUUID(),
    }),
  );
  created(
    await saveSavingsFund(client, ownerId, {
      action: "reserve",
      fundId: fund.id,
      amount: "700.0001",
      version: 1,
      idempotencyKey: randomUUID(),
    }),
  );

  const { id: cardId } = await saveCard(
    client,
    ownerId,
    cardCommand({ name: "Tarjeta sintética F6-04" }),
  );
  const savedFilter = await saveSavedFilterCommand(client, ownerId, {
    action: "create",
    name: "Filtro sintético",
    criteria: { period: "mes-actual", category: food.id },
    idempotencyKey: randomUUID(),
  });
  created(savedFilter);
  created(
    await saveCardCycle(
      client,
      ownerId,
      parsed(
        parseCycleCommand({
          cardId,
          version: 0,
          idempotencyKey: randomUUID(),
          scope: "schedule",
          closingDay: 25,
          dueDay: 10,
          leadDays: 3,
        }),
      ),
    ),
  );
  const { id: debitCardId } = await saveCard(client, ownerId, {
    ...cardCommand({ name: "Débito sintético" }),
    kind: "debit",
  });
  created(
    await saveCreditOperation(
      client,
      ownerId,
      parsed(
        parseCreditCommand(
          {
            ...creditPurchase({ cardId, concept: "Compra mixta sintética" }),
            amount: "1000",
            mixed: {
              total: "3000",
              debitAmount: "2000",
              debitCardId,
              categories: [],
            },
          },
          today,
        ),
      ),
    ),
  );
  // Preserve both rate formats in the restore rehearsal.
  const { id: usdCardId } = await saveCard(
    client,
    ownerId,
    cardCommand({ name: "Tarjeta USD sintética", currency: "USD" }),
  );
  await saveBudget(
    client,
    ownerId,
    parsed(
      parseBudgetCommand(
        {
          idempotencyKey: randomUUID(),
          action: "quote",
          fromCurrency: "USD",
          toCurrency: "UYU",
          rate: "40.1234",
          effectiveOn: "2026-01-10",
        },
        today,
      ),
    ),
    today,
  );
  created(
    await saveCreditOperation(
      client,
      ownerId,
      parsed(
        parseCreditCommand(
          {
            ...creditPurchase({
              cardId: usdCardId,
              currency: "USD",
              amount: "300",
              concept: "Compra en cuotas sintética",
            }),
            plan: {
              installmentAmount: "100",
              count: 3,
              firstPeriod: "2026-02",
            },
          },
          today,
        ),
      ),
    ),
  );
  const legacyPlan = created(
    await saveCreditOperation(
      client,
      ownerId,
      parsed(
        parseCreditCommand(
          creditPurchase({
            cardId: usdCardId,
            currency: "USD",
            amount: "300",
            concept: "Plan anterior sintético",
          }),
          today,
        ),
      ),
    ),
  );
  // Older writers omit the monthly policy indicator and capture a budget rate.
  await client.query(
    `INSERT INTO finance.installment_plans
       (owner_id,event_id,currency,version,installment_amount,installment_count,active_count,first_period,change_type)
     VALUES ($1,$2,'USD',1,100,3,3,'2026-02-01','created')`,
    [ownerId, legacyPlan.id],
  );
  if (
    !(await saveManualFx(client, ownerId, {
      date: "2026-02-01",
      base: "USD",
      target: "UYU",
      rate: "39.321",
    }))
  )
    throw new Error("No se pudo preparar la referencia mensual sintética");
  const purchase = created(
    await saveCreditOperation(
      client,
      ownerId,
      parsed(parseCreditCommand(creditPurchase({ cardId }), today)),
    ),
  );
  created(
    await saveCreditOperation(
      client,
      ownerId,
      parsed(
        parseCreditCommand(
          creditPayment({
            cardId,
            allocations: [{ purchaseId: purchase.id, amount: "400.0000" }],
          }),
          today,
        ),
      ),
    ),
  );
  const february = "2026-02-01";
  created(
    await saveRefund(
      client,
      ownerId,
      parsed(
        parseRefundCommand(
          {
            action: "credit",
            effectiveOn: february,
            purchaseId: purchase.id,
            idempotencyKey: randomUUID(),
            parts: [{ method: "credit", categoryId: null, amount: "100" }],
          },
          february,
        ),
      ),
      february,
    ),
  );

  const loan = created(
    await saveLoanOperation(
      client,
      ownerId,
      parsed(parseLoanCommand(loanLend(), today)),
    ),
  );
  created(
    await saveLoanOperation(
      client,
      ownerId,
      parsed(parseLoanCommand(loanSettle({ loanId: loan.id }), today)),
    ),
  );
  created(
    await saveSharedExpense(
      client,
      ownerId,
      parsed(parseSharedExpense(sharedExpense(), today)),
    ),
  );
  created(
    await saveBankBenefit(
      client,
      ownerId,
      parsed(
        parseBankBenefitCommand(
          {
            action: "register",
            idempotencyKey: randomUUID(),
            destination: "bank",
            currency: "UYU",
            amount: "300.0001",
            effectiveOn: "2026-01-10",
            concept: "Beneficio sintético",
            credited: true,
          },
          today,
        ),
      ),
    ),
  );
  const definition = parsed(
    parseRecurrence({
      kind: "expense",
      concept: "Suscripción sintética",
      currency: "UYU",
      categoryId: null,
      firstPeriod: "2026-01-01",
      dateMode: "exact",
      dueDay: 5,
      referenceAmount: "250",
      idempotencyKey: randomUUID(),
    }),
  );
  const saved = created(await createRecurrence(client, ownerId, definition));
  const series = { ...definition, id: saved.id };
  const [period] = await trackedPeriods(client, ownerId, series, [0]);
  created(
    await applySettlement(
      client,
      ownerId,
      parsed(
        parseSettlement(
          {
            idempotencyKey: randomUUID(),
            seriesId: series.id,
            action: "record",
            targets: [
              {
                index: period.index,
                version: period.version,
                recorded: period.recorded,
                amount: "250",
              },
            ],
            amount: "250",
            effectiveOn: "2026-01-10",
            method: "debit",
          },
          today,
        ),
      ),
      today,
    ),
  );
  return { cardId, fundId: fund.id };
}
