import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  migrateInTransaction,
  readMigrations,
} from "../../src/db/migrations.mts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import { schemaContract } from "../support/schema-contract.mjs";
import {
  setOwnerContext,
  withOwnerTransaction,
} from "../../src/db/owner-context.mts";
import { randomUUID } from "node:crypto";
import {
  listBankAvailability,
  saveOpeningBalance,
  savingsFundsReady,
} from "../../src/server/bank-balances.ts";
import { saveCreditOperation } from "../../src/server/credit-operations.ts";
import { creditHistoryDetail } from "../../src/server/history.ts";
import {
  findEventMerchant,
  findLoanPerson,
  nameCatalogReady,
} from "../../src/server/catalog.ts";
import { installmentsReady } from "../../src/server/installments.ts";
import { cardCyclesReady } from "../../src/server/card-cycles.ts";
import { mixedPurchasesReady } from "../../src/server/mixed-purchases.ts";
import { sharedExpensesReady } from "../../src/server/shared-expense-schema.ts";
import { saveLoanOperation, findLoan } from "../../src/server/loans.ts";
import { loansReady } from "../../src/server/movements.ts";
import { refundsReady } from "../../src/server/refund-schema.ts";
import { budgetsReady, listBudgetNotices } from "../../src/server/budgets.ts";
import { cardPushReady } from "../../src/server/card-push.ts";
import { recurrenceTrackingReady } from "../../src/server/recurrence-links.ts";
import { recurringSharesReady } from "../../src/server/recurring-shares.ts";
import { recurrencesReady } from "../../src/server/recurrences.ts";
import {
  fundLifecycleReady,
  reserveEffectsReady,
  saveSavingsFund,
} from "../../src/server/savings-funds.ts";

test("F0-05: esquema real reproducible, aislamiento y precisión sin fixtures persistentes", async () => {
  const client = new pg.Client(testDatabaseConfig());
  try {
    await client.connect();
  } catch {
    throw new Error("PostgreSQL desechable no disponible");
  }
  try {
    await client.query("BEGIN");
    // Simulate only the managed schema boundary in disposable CI. No auth rows.
    await client.query(
      'CREATE SCHEMA neon_auth; REVOKE ALL ON SCHEMA neon_auth FROM PUBLIC; CREATE TABLE neon_auth."user" (id text)',
    );
    assert.deepEqual(await migrateInTransaction(client), [
      "0001_F0-05_initial.sql",
      "0002_F1-03_ordinary_movements.sql",
      "0003_F1-04_movement_revisions.sql",
      "0004_F1-05_balance_reconciliation.sql",
      "0005_F1-06_bank_transfers.sql",
      "0006_F1-07_movement_history.sql",
      "0007_F2-01_card_catalog.sql",
      "0008_F2-02_credit_operations.sql",
      "0009_F2-03_credit_installments.sql",
      "0010_F2-04_card_cycles.sql",
      "0011_F2-05_mixed_purchases.sql",
      "0012_F2-06_loans.sql",
      "0013_F2-08_shared_expenses.sql",
      "0014_F2-09_purchase_refunds.sql",
      "0015_F3-01_savings_funds.sql",
      "0016_F3-01_reserve_effects.sql",
      "0017_F3-03_scheduled_contributions.sql",
      "0018_F3-04_fund_targets.sql",
      "0019_F3-05_fund_coverage.sql",
      "0020_F3-06_monthly_budgets.sql",
      "0021_F3-07_budget_notices.sql",
      "0022_F4-01_recurring_series.sql",
      "0023_F4-02_recurring_periods.sql",
      "0024_F4-03_series_pause.sql",
      "0025_F4-04_recurring_shared_expenses.sql",
      "0026_F4-05_due_notice_preferences.sql",
      "0027_F5-01_category_archive.sql",
      "0028_F5-02_movement_classification.sql",
      "0029_F5-03_catalogo_nombres.sql",
      "0030_F5-04_filtros_guardados.sql",
      "0031_F5-04_bulk_classification.sql",
      "0032_F5-05_statistics_favorites.sql",
      "0033_F5-06_reference_exchange_rates.sql",
      "0034_F5-07_account_backup.sql",
      "0035_F5-09_bank_benefits.sql",
      "0036_F6-02_authorize_account_backup.sql",
      "0037_F5-08_delete_account.sql",
      "0038_CA-027_purchase_original_amount.sql",
      "0039_FIX-FX_installment_monthly_reference.sql",
      "0040_OPS-RESET_financial_reset.sql",
      "0041_SIMP-02_expense_installments.sql",
    ]);
    assert.deepEqual(await migrateInTransaction(client), []);
    assert.ok((await schemaContract(client)).checks >= 40);
    await client.query("ROLLBACK");
    assert.equal(
      (await client.query("SELECT to_regnamespace('finance') AS name")).rows[0]
        .name,
      null,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});

test("OPS: aplica solo el SQL autorizado y conserva el historial previo", async () => {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    const [
      initial,
      movement,
      revisions,
      reconciliation,
      transfers,
      history,
      cards,
      credit,
      installments,
      cycles,
      mixed,
      loans,
      shared,
      refunds,
      funds,
      reserveEffects,
      contributions,
      targets,
      coverage,
      budgets,
      notices,
      recurrences,
      settlements,
      pause,
      sharing,
      dueNotices,
      categoryArchive,
      classification,
      nameCatalog,
      savedFilters,
      bulkClassification,
      statistics,
      exchangeRates,
      backup,
      benefits,
      authorizedBackup,
      deletion,
      purchaseOriginalAmount,
      installmentMonthlyReference,
      financialReset,
      expenseInstallments,
    ] = await readMigrations();
    await assert.rejects(migrateInTransaction(client, movement.sha256), {
      message: "La migración pendiente no coincide con el SQL autorizado",
    });
    await client.query(initial.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [initial.version, initial.sha256],
    );
    await setOwnerContext(client, "legacy-fixture");
    const id = randomUUID();
    await client.query(
      `INSERT INTO finance.financial_events
        (owner_id,id,kind,concept,effective_on,idempotency_key,command_hash)
        VALUES ('legacy-fixture',$1,'expense','Registro anterior','2026-01-01',$1,repeat('a',64))`,
      [id],
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, initial.sha256));
    await assert.rejects(migrateInTransaction(client, revisions.sha256));
    await client.query(movement.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [movement.version, movement.sha256],
    );
    await assert.rejects(migrateInTransaction(client, revisions.sha256));
    await client.query(revisions.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [revisions.version, revisions.sha256],
    );
    await assert.rejects(migrateInTransaction(client, reconciliation.sha256));
    await client.query(reconciliation.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [reconciliation.version, reconciliation.sha256],
    );
    await assert.rejects(migrateInTransaction(client, reconciliation.sha256));
    await assert.rejects(migrateInTransaction(client, transfers.sha256));
    await client.query(transfers.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [transfers.version, transfers.sha256],
    );
    await assert.rejects(migrateInTransaction(client, history.sha256));
    await client.query(history.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [history.version, history.sha256],
    );
    await assert.rejects(migrateInTransaction(client, cards.sha256));
    await client.query(cards.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [cards.version, cards.sha256],
    );
    await assert.rejects(migrateInTransaction(client, credit.sha256));
    await assert.rejects(migrateInTransaction(client, installments.sha256));
    await client.query(credit.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [credit.version, credit.sha256],
    );
    await setOwnerContext(client, "legacy-fixture");
    assert.equal(await installmentsReady(client), false);
    assert.equal(await savingsFundsReady(client), false);
    assert.equal(
      await saveOpeningBalance(client, "legacy-fixture", {
        currency: "UYU",
        amount: "100.0001",
        asOfDate: "2026-01-10",
      }),
      "created",
    );
    assert.deepEqual(await listBankAvailability(client, "legacy-fixture"), [
      {
        currency: "UYU",
        amount: "100.0001",
        asOfDate: "2026-01-10",
        reservedAmount: "0.0000",
        availableAmount: "100.0001",
      },
    ]);
    const cardId = randomUUID();
    await client.query(
      "INSERT INTO finance.cards (owner_id,id,kind,name) VALUES ('legacy-fixture',$1,'credit','Prueba')",
      [cardId],
    );
    await client.query(
      "INSERT INTO finance.card_currencies (owner_id,card_id,kind,currency) VALUES ('legacy-fixture',$1,'credit','UYU')",
      [cardId],
    );
    const purchaseCommand = {
      action: "purchase",
      cardId,
      currency: "UYU",
      amount: "17.0001",
      concept: "Compra previa",
      note: null,
      categoryId: null,
      covered: false,
      effectiveOn: "2026-01-15",
      idempotencyKey: randomUUID(),
    };
    const purchase = await saveCreditOperation(
      client,
      "legacy-fixture",
      purchaseCommand,
    );
    assert.equal(purchase.status, "created");
    assert.equal(
      (await creditHistoryDetail(client, "legacy-fixture", purchase.id))[0]
        .originalPurchase,
      null,
    );
    assert.equal(
      (
        await saveCreditOperation(client, "legacy-fixture", {
          ...purchaseCommand,
          idempotencyKey: randomUUID(),
          originalPurchase: { currency: "EUR", amount: "1.0000" },
        })
      ).status,
      "conflict",
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, installments.sha256));
    await client.query(installments.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [installments.version, installments.sha256],
    );
    assert.equal(await cardCyclesReady(client), false);
    await assert.rejects(migrateInTransaction(client, installments.sha256));
    await assert.rejects(migrateInTransaction(client, cycles.sha256));
    await client.query(cycles.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [cycles.version, cycles.sha256],
    );
    assert.equal(await mixedPurchasesReady(client), false);
    await assert.rejects(migrateInTransaction(client, cycles.sha256));
    await assert.rejects(migrateInTransaction(client, mixed.sha256));
    await client.query(mixed.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [mixed.version, mixed.sha256],
    );
    assert.equal(await loansReady(client), false);
    await assert.rejects(migrateInTransaction(client, mixed.sha256));
    await assert.rejects(migrateInTransaction(client, loans.sha256));
    await client.query(loans.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [loans.version, loans.sha256],
    );
    await setOwnerContext(client, "legacy-fixture");
    assert.equal(await sharedExpensesReady(client), false);
    const loan = await saveLoanOperation(client, "legacy-fixture", {
      action: "existing",
      direction: "receivable",
      currency: "UYU",
      concept: "Obligación anterior",
      amount: "100.0001",
      effectiveOn: "2026-01-15",
      idempotencyKey: randomUUID(),
      note: null,
      agreedTotal: null,
      installmentLoan: false,
      installmentAmount: null,
      frequency: null,
      dueOn: null,
    });
    assert.equal(loan.status, "created");
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, loans.sha256));

    await assert.rejects(migrateInTransaction(client, shared.sha256));
    await assert.rejects(migrateInTransaction(client, refunds.sha256));
    await client.query(shared.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [shared.version, shared.sha256],
    );
    assert.equal(await refundsReady(client), false);
    await assert.rejects(migrateInTransaction(client, shared.sha256));
    await assert.rejects(migrateInTransaction(client, refunds.sha256));
    await client.query(refunds.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [refunds.version, refunds.sha256],
    );
    await assert.rejects(migrateInTransaction(client, funds.sha256));
    await client.query(funds.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [funds.version, funds.sha256],
    );
    await setOwnerContext(client, "legacy-fixture");
    const fund = await saveSavingsFund(client, "legacy-fixture", {
      action: "create",
      name: "Fondo anterior",
      currency: "UYU",
      idempotencyKey: randomUUID(),
    });
    assert.equal(fund.status, "created");
    assert.equal(await reserveEffectsReady(client), false);
    assert.equal(
      (
        await saveSavingsFund(client, "legacy-fixture", {
          action: "reserve",
          fundId: fund.id,
          version: 1,
          amount: "1.0000",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "unavailable",
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, reserveEffects.sha256));
    await client.query(reserveEffects.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [reserveEffects.version, reserveEffects.sha256],
    );
    await assert.rejects(migrateInTransaction(client, reserveEffects.sha256));
    await assert.rejects(migrateInTransaction(client, contributions.sha256));
    await client.query(contributions.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [contributions.version, contributions.sha256],
    );
    await assert.rejects(migrateInTransaction(client, contributions.sha256));
    await assert.rejects(migrateInTransaction(client, coverage.sha256));
    await setOwnerContext(client, "legacy-fixture");
    assert.equal(await fundLifecycleReady(client), false);
    assert.equal(
      (
        await saveSavingsFund(client, "legacy-fixture", {
          action: "update",
          fundId: fund.id,
          version: 1,
          name: "Fondo anterior",
          targetAmount: "20.0000",
          idempotencyKey: randomUUID(),
        })
      ).status,
      "unavailable",
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, targets.sha256));
    await client.query(targets.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [targets.version, targets.sha256],
    );
    await assert.rejects(migrateInTransaction(client, coverage.sha256));
    await client.query(coverage.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [coverage.version, coverage.sha256],
    );
    assert.equal(await budgetsReady(client), false);
    await assert.rejects(migrateInTransaction(client, budgets.sha256));
    await assert.rejects(migrateInTransaction(client, notices.sha256));
    await client.query(budgets.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [budgets.version, budgets.sha256],
    );
    await setOwnerContext(client, "legacy-fixture");
    assert.equal(
      await listBudgetNotices(client, "legacy-fixture", "2026-11"),
      null,
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, budgets.sha256));
    await assert.rejects(migrateInTransaction(client, recurrences.sha256));
    await client.query(notices.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [notices.version, notices.sha256],
    );
    assert.equal(await recurrencesReady(client), false);
    await assert.rejects(migrateInTransaction(client, notices.sha256));
    await assert.rejects(migrateInTransaction(client, settlements.sha256));
    await client.query(recurrences.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [recurrences.version, recurrences.sha256],
    );
    assert.equal(
      (
        await client.query(
          "SELECT has_column_privilege('finanzas_app', 'finance.categories', 'archived_at', 'UPDATE') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await setOwnerContext(client, "legacy-fixture");
    assert.equal(await recurrenceTrackingReady(client), false);
    const seriesId = randomUUID();
    await client.query(
      `INSERT INTO finance.recurring_series
        (owner_id,id,command_hash,kind,concept,currency,frequency,first_period,date_mode)
       VALUES ('legacy-fixture',$1,repeat('b',64),'income','Ingreso previo','UYU','monthly','2026-11-01','none')`,
      [seriesId],
    );
    await client.query("RESET ROLE");
    await assert.rejects(migrateInTransaction(client, recurrences.sha256));
    await assert.rejects(migrateInTransaction(client, settlements.sha256));
    await client.query(settlements.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [settlements.version, settlements.sha256],
    );
    await assert.rejects(migrateInTransaction(client, settlements.sha256));
    assert.equal(await recurringSharesReady(client), false);
    await assert.rejects(migrateInTransaction(client, pause.sha256));
    await client.query(pause.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [pause.version, pause.sha256],
    );
    await assert.rejects(migrateInTransaction(client, sharing.sha256));
    await client.query(sharing.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [sharing.version, sharing.sha256],
    );
    assert.equal(await cardPushReady(client), false);
    await assert.rejects(migrateInTransaction(client, dueNotices.sha256));
    await client.query(dueNotices.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [dueNotices.version, dueNotices.sha256],
    );
    for (const migration of [
      categoryArchive,
      classification,
      nameCatalog,
      savedFilters,
      bulkClassification,
      statistics,
      exchangeRates,
      backup,
      benefits,
      authorizedBackup,
      deletion,
    ]) {
      await assert.rejects(migrateInTransaction(client, migration.sha256));
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
        [migration.version, migration.sha256],
      );
    }
    await assert.rejects(
      migrateInTransaction(client, purchaseOriginalAmount.sha256),
    );
    await client.query(purchaseOriginalAmount.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [purchaseOriginalAmount.version, purchaseOriginalAmount.sha256],
    );

    await setOwnerContext(client, "legacy-fixture");
    await client.query(
      `INSERT INTO finance.budget_quotes(owner_id,id,from_currency,to_currency,rate,effective_on,source)
       VALUES ('legacy-fixture',$1,'UYU','USD',0.025,'2026-01-01','manual')`,
      [randomUUID()],
    );
    const legacyPlan = await saveCreditOperation(client, "legacy-fixture", {
      ...purchaseCommand,
      idempotencyKey: randomUUID(),
      amount: "50.0000",
      plan: { installmentAmount: "25.0000", count: 2, firstPeriod: "2026-02" },
    });
    assert.equal(legacyPlan.status, "created");
    const legacyQuote = () =>
      client.query(
        "SELECT quote_id,reference_on::text FROM finance.budget_rates WHERE owner_id='legacy-fixture' AND event_id=$1",
        [legacyPlan.id],
      );
    const before = await legacyQuote();
    assert.equal(before.rowCount, 1);
    await client.query("RESET ROLE");
    await assert.rejects(
      migrateInTransaction(client, installmentMonthlyReference.sha256),
    );
    await client.query(installmentMonthlyReference.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [installmentMonthlyReference.version, installmentMonthlyReference.sha256],
    );
    await assert.rejects(
      migrateInTransaction(client, installmentMonthlyReference.sha256),
    );
    // Con dos migraciones pendientes, una autorización no aplica ninguna.
    await assert.rejects(migrateInTransaction(client, financialReset.sha256));
    await client.query(financialReset.sql);
    await client.query(
      "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ($1,$2)",
      [financialReset.version, financialReset.sha256],
    );
    assert.deepEqual(
      await migrateInTransaction(client, expenseInstallments.sha256),
      [expenseInstallments.version],
    );
    assert.deepEqual(
      await migrateInTransaction(client, expenseInstallments.sha256),
      [],
    );
    await setOwnerContext(client, "legacy-fixture");
    assert.deepEqual((await legacyQuote()).rows, before.rows);
    assert.deepEqual(
      (
        await client.query(
          "SELECT monthly_fx,installment_amount::text FROM finance.installment_plans WHERE owner_id='legacy-fixture' AND event_id=$1",
          [legacyPlan.id],
        )
      ).rows,
      [{ monthly_fx: false, installment_amount: "25.0000" }],
    );
    await client.query("RESET ROLE");
    assert.equal(
      (
        await client.query(
          "SELECT has_column_privilege('finanzas_app', 'finance.categories', 'archived_at', 'UPDATE') AS allowed",
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(await nameCatalogReady(client), true);
    await setOwnerContext(client, "legacy-fixture");
    const [legacyCredit] = await creditHistoryDetail(
      client,
      "legacy-fixture",
      purchase.id,
    );
    assert.equal(legacyCredit.originalPurchase, null);
    assert.equal(legacyCredit.amount, "17.0001");
    assert.deepEqual(
      await saveCreditOperation(client, "legacy-fixture", purchaseCommand),
      {
        status: "replayed",
        id: purchase.id,
      },
    );
    assert.equal(await recurrencesReady(client), true);
    assert.equal(
      await findEventMerchant(client, "legacy-fixture", purchase.id),
      null,
    );
    assert.equal(await findLoanPerson(client, "legacy-fixture", loan.id), null);
    assert.equal(await recurrenceTrackingReady(client), true);
    assert.equal(await recurringSharesReady(client), true);
    assert.equal(await cardPushReady(client), true);
    assert.equal(
      (await findLoan(client, "legacy-fixture", loan.id)).noticeLeadDays,
      3,
    );
    assert.deepEqual(
      (await client.query("SELECT id FROM finance.recurring_series")).rows,
      [{ id: seriesId }],
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.recurring_periods")).rowCount,
      0,
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.budget_notices")).rowCount,
      0,
    );
    assert.equal(await fundLifecycleReady(client), true);
    assert.equal(await budgetsReady(client), true);
    assert.equal(await sharedExpensesReady(client), true);
    assert.equal(await refundsReady(client), true);
    assert.equal(await savingsFundsReady(client), true);
    assert.equal(await reserveEffectsReady(client), true);
    assert.equal(
      (await client.query("SELECT 1 FROM finance.contribution_plans")).rowCount,
      0,
    );
    assert.deepEqual(
      (
        await client.query(
          "SELECT name, version, reserved_amount::numeric(20,4)::text AS amount FROM finance.savings_funds WHERE id = $1",
          [fund.id],
        )
      ).rows,
      [{ name: "Fondo anterior", version: 1, amount: "0.0000" }],
    );
    assert.equal(
      (await findLoan(client, "legacy-fixture", loan.id)).outstanding,
      "100.0001",
    );
    assert.equal(await installmentsReady(client), true);
    assert.equal(await cardCyclesReady(client), true);
    assert.equal(await mixedPurchasesReady(client), true);
    assert.equal(await loansReady(client), true);
    assert.deepEqual(
      (
        await client.query(
          "SELECT statement_period FROM finance.credit_lines WHERE event_id = $1",
          [purchase.id],
        )
      ).rows,
      [{ statement_period: null }],
    );
    assert.deepEqual(
      (
        await client.query(
          "SELECT id, amount::text, installment_ordinal FROM finance.credit_expenses ORDER BY effective_on, installment_ordinal",
        )
      ).rows,
      [
        { id: purchase.id, amount: "17.0001", installment_ordinal: null },
        { id: legacyPlan.id, amount: "25.0000", installment_ordinal: 1 },
        { id: legacyPlan.id, amount: "25.0000", installment_ordinal: 2 },
      ],
    );
    assert.equal(
      (
        await client.query(
          "SELECT id FROM finance.financial_events WHERE kind = 'expense'",
        )
      ).rows[0].id,
      id,
    );
    assert.equal(
      (await client.query("SELECT 1 FROM finance.ordinary_movements")).rowCount,
      0,
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("F2-01: RLS, FK por titular y permisos de catálogo independientes de los saldos", async () => {
  const client = new pg.Client(testDatabaseConfig());
  await client.connect();
  const cardId = randomUUID();
  const insertCurrency = `INSERT INTO finance.card_currencies (owner_id, card_id, kind, currency) VALUES ($1,$2,$3,'UYU')`;
  try {
    await client.query("BEGIN");
    await migrateInTransaction(client);
    await setOwnerContext(client, "cards-a");
    await client.query(
      `INSERT INTO finance.cards (owner_id, id, kind, name) VALUES ('cards-a',$1,'debit','Prueba')`,
      [cardId],
    );
    await client.query(insertCurrency, ["cards-a", cardId, "debit"]);
    await client.query(
      `INSERT INTO finance.card_changes (owner_id,idempotency_key,command_hash,card_id,version,action,configuration)
      VALUES ('cards-a',$1,repeat('a',64),$1,1,'create','{}')`,
      [cardId],
    );

    await client.query("SAVEPOINT before_denial");
    await assert.rejects(
      client.query("UPDATE finance.card_currencies SET credit_balance = 5"),
      { code: "42501" },
    );
    await client.query("ROLLBACK TO before_denial");
    await assert.rejects(
      client.query("UPDATE finance.card_currencies SET credit_limit = 5"),
      { code: "23514" },
    );
    await client.query("ROLLBACK TO before_denial");
    await assert.rejects(client.query("DELETE FROM finance.card_changes"), {
      code: "42501",
    });
    await client.query("ROLLBACK TO before_denial");

    await setOwnerContext(client, "cards-b");
    for (const relation of ["cards", "card_currencies", "card_changes"]) {
      assert.equal(
        (await client.query(`SELECT 1 FROM finance.${relation}`)).rowCount,
        0,
      );
    }
    assert.equal(
      (
        await client.query(
          "UPDATE finance.cards SET name = 'Ajena' WHERE id = $1",
          [cardId],
        )
      ).rowCount,
      0,
    );
    await assert.rejects(
      client.query(insertCurrency, ["cards-b", cardId, "debit"]),
      { code: "23503" },
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

// Committed schema and synthetic rows exist only in the disposable localhost
// service. This suite is never imported by the Neon development harness.
test(
  "F0-05: concurrencia de migraciones y contexto transaccional real",
  { timeout: 30000 },
  async (t) => {
    const pool = new pg.Pool({ ...testDatabaseConfig(), max: 2 });
    const migrate = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const applied = await migrateInTransaction(client);
        await client.query("COMMIT");
        return applied;
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    };
    try {
      await t.test(
        "dos migradores aplican una sola vez y conservan el ledger",
        async () => {
          const count = (await readMigrations()).length;
          const results = await Promise.all([migrate(), migrate()]);
          assert.deepEqual(results.map((rows) => rows.length).sort(), [
            0,
            count,
          ]);
          assert.equal(
            (await pool.query("SELECT * FROM finance_meta.schema_migrations"))
              .rowCount,
            count,
          );
        },
      );
      await t.test(
        "checksum cambiado e historial desconocido abortan sin aplicar DDL",
        async () => {
          const client = await pool.connect();
          try {
            for (const sql of [
              "UPDATE finance_meta.schema_migrations SET sha256 = repeat('0',64)",
              "INSERT INTO finance_meta.schema_migrations(version,sha256) VALUES ('unknown.sql',repeat('a',64))",
            ]) {
              await client.query("BEGIN");
              await client.query(sql);
              await assert.rejects(migrateInTransaction(client), {
                message: "Historial de migraciones divergente",
              });

              await client.query("ROLLBACK");
            }
            await client.query("BEGIN");
            assert.deepEqual(await migrateInTransaction(client), []);
            await client.query("ROLLBACK");
          } finally {
            await client.query("ROLLBACK");
            client.release();
          }
        },
      );
      await t.test(
        "dos conexiones con misma clave producen un solo evento confirmado",
        async () => {
          const clients = await Promise.all([pool.connect(), pool.connect()]);
          const ownerId = `f0-05-concurrent-${randomUUID()}`;
          const key = randomUUID();
          const insert =
            "INSERT INTO finance.financial_events(owner_id,id,kind,concept,effective_on,idempotency_key,command_hash) VALUES ($1,$2,'expense','fixture concurrente','2026-01-31',$3,$4)";
          try {
            for (const client of clients) {
              await client.query("BEGIN");
              await setOwnerContext(client, ownerId);
            }
            await clients[0].query(insert, [
              ownerId,
              randomUUID(),
              key,
              "a".repeat(64),
            ]);
            const duplicate = assert.rejects(
              clients[1].query(insert, [
                ownerId,
                randomUUID(),
                key,
                "a".repeat(64),
              ]),
              { code: "23505" },
            );
            await clients[0].query("COMMIT");
            await duplicate;
            await clients[1].query("ROLLBACK");
            await clients[0].query("BEGIN");
            await setOwnerContext(clients[0], ownerId);
            assert.equal(
              (await clients[0].query("SELECT * FROM finance.financial_events"))
                .rowCount,
              1,
            );
          } finally {
            for (const client of clients) {
              await client.query("ROLLBACK");
              client.release();
            }
          }
        },
      );
      // One connection forces reuse across owners, successful commits and failures.
      await pool.end();
    } catch (error) {
      await pool.end();
      throw error;
    }

    const reused = new pg.Pool({ ...testDatabaseConfig(), max: 1 });
    const owner = `f0-05-context-${randomUUID()}`;
    const resolve = async () => ({ ownerId: owner });
    const contextReset = async () => {
      const { rows } = await reused.query(
        "SELECT current_user = session_user AS role_reset, nullif(current_setting('finance.owner_id',true),'') IS NULL AS owner_reset",
      );
      assert.deepEqual(rows[0], { role_reset: true, owner_reset: true });
    };
    try {
      await t.test(
        "rechaza identidad ausente o inválida sin ejecutar trabajo",
        async () => {
          for (const resolveOwner of [
            async () => null,
            async () => {
              throw new Error("private identity detail");
            },
            async () => ({ ownerId: " " }),
          ]) {
            await assert.rejects(
              withOwnerTransaction(reused, resolveOwner, async () =>
                assert.fail("No debe ejecutarse"),
              ),
            );
          }
          await contextReset();
        },
      );
      await t.test(
        "COMMIT real, rol limitado y cambio de titular sin filtrar contexto",
        async () => {
          for (const ownerId of [owner, `${owner}-b`]) {
            const result = await withOwnerTransaction(
              reused,
              async () => ({ ownerId }),
              async (client, resolvedOwner) => {
                assert.equal(resolvedOwner, ownerId);
                const { rows } = await client.query(
                  "SELECT current_user AS role, current_setting('finance.owner_id') AS owner",
                );
                assert.deepEqual(rows[0], {
                  role: "finanzas_app",
                  owner: ownerId,
                });
                return "confirmed";
              },
            );
            assert.equal(result, "confirmed");
            await contextReset();
          }
        },
      );
      await t.test(
        "ROLLBACK ante error de trabajo, sin datos parciales ni detalles sensibles",
        async () => {
          await assert.rejects(
            withOwnerTransaction(reused, resolve, async (client) => {
              await client.query(
                "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
                [owner],
              );
              throw new Error("private financial detail");
            }),
            { message: "Operación de datos rechazada" },
          );
          await contextReset();
          await withOwnerTransaction(reused, resolve, async (client) =>
            assert.equal(
              (await client.query("SELECT * FROM finance.user_preferences"))
                .rowCount,
              0,
            ),
          );
        },
      );
      await t.test(
        "error SQL capturado no puede devolver éxito después de ROLLBACK implícito",
        async () => {
          await assert.rejects(
            withOwnerTransaction(reused, resolve, async (client) => {
              await client.query(
                "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
                [owner],
              );
              await assert.rejects(client.query("SELECT 1 / 0"), {
                code: "22012",
              });
              return "incorrect success";
            }),
            { message: "Operación de datos rechazada" },
          );
          await contextReset();
          await withOwnerTransaction(reused, resolve, async (client) =>
            assert.equal(
              (await client.query("SELECT * FROM finance.user_preferences"))
                .rowCount,
              0,
            ),
          );
        },
      );
    } finally {
      await reused.end();
    }
  },
);
