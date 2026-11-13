-- F5-09 (etapa A): RF-053; CA-067; I-01/02/10/11/12.
-- Beneficio bancario (cashback) no vinculado a una compra. Es un hecho propio:
-- no modifica compras, devoluciones ni presupuestos históricos. El efecto en
-- Bancos o en la tarjeta usa las mismas tablas que ya sostienen esos saldos.
ALTER TABLE finance.financial_events DROP CONSTRAINT financial_events_kind_check;
ALTER TABLE finance.financial_events ADD CONSTRAINT financial_events_kind_check
  CHECK (kind IN ('income', 'expense', 'bank_transfer', 'balance_adjustment',
    'card_purchase', 'card_payment', 'card_opening', 'card_adjustment', 'loan_operation',
    'purchase_refund', 'card_credit_return', 'bank_benefit'));

-- La anulación reutiliza la transición auditada existente.
ALTER POLICY audited_movement_transition ON finance.financial_events
  USING (status = 'confirmed' AND kind IN ('income', 'expense', 'bank_transfer',
    'card_purchase', 'card_payment', 'purchase_refund', 'card_credit_return', 'bank_benefit'));

CREATE TABLE finance.bank_benefits (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  destination text NOT NULL CHECK (destination IN ('bank', 'card')),
  currency finance.currency NOT NULL,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  card_id uuid,
  note text CHECK (length(note) <= 500),
  PRIMARY KEY (owner_id, event_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, event_id, card_id)
    REFERENCES finance.credit_operations(owner_id, event_id, card_id),
  CHECK ((destination = 'card') = (card_id IS NOT NULL))
);
CREATE INDEX bank_benefits_card ON finance.bank_benefits(owner_id, card_id);

ALTER TABLE finance.bank_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_benefits FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.bank_benefits TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.bank_benefits TO finanzas_app;

-- La copia de la cuenta debe incluir la tabla nueva y su diseño verificado.
-- Es hija de eventos, tarjetas y operaciones de crédito, por eso va al final.
CREATE OR REPLACE FUNCTION finance.account_backup_tables() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'user_preferences', 'categories', 'financial_events', 'balance_checkpoints',
    'bank_effects', 'audit_changes', 'ordinary_movements', 'balance_adjustments',
    'cards', 'card_currencies', 'card_changes', 'credit_operations',
    'credit_lines', 'credit_allocations', 'installment_plans', 'card_cycle_changes',
    'mixed_purchases', 'mixed_purchase_categories', 'shared_expenses',
    'shared_expense_details', 'loans', 'loan_operations', 'purchase_refunds', 'refund_parts',
    'refund_installments', 'card_credit_changes', 'savings_funds', 'fund_changes',
    'reserve_effects', 'contribution_plans', 'contribution_periods',
    'contribution_changes', 'fund_event_allocations', 'fund_payment_allocations',
    'budget_limits', 'budget_changes', 'budget_quotes', 'budget_rates',
    'budget_notices', 'recurring_series', 'recurring_periods', 'recurring_commands',
    'recurring_allocations', 'people', 'recurring_share_participants', 'tags',
    'classification_changes', 'movement_allocations', 'event_tags', 'merchants',
    'event_merchants', 'loan_people', 'name_catalog_changes', 'saved_history_filters',
    'saved_filter_changes', 'bulk_classification_changes', 'statistics_favorites',
    'fx_valuations', 'bank_benefits'
  ]
$$;

DO $policies$
BEGIN
  EXECUTE format('CREATE POLICY account_backup_owner ON finance.bank_benefits TO %I
    USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
    WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))',
    current_user);
END
$policies$;

UPDATE finance_meta.account_backup_layout SET layout = finance.account_backup_layout();
