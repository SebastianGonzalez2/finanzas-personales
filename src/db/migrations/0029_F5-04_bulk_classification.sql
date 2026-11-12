-- One immutable receipt per batch. Each changed movement has its own version
-- in classification_changes and its own entry in audit_changes.
CREATE TABLE finance.bulk_classification_changes (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  updated integer NOT NULL CHECK (updated BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key)
);

ALTER TABLE finance.bulk_classification_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bulk_classification_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.bulk_classification_changes TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT (owner_id, idempotency_key, command_hash, updated)
  ON finance.bulk_classification_changes TO finanzas_app;

ALTER TABLE finance.audit_changes DROP CONSTRAINT audit_changes_change_type_check;
ALTER TABLE finance.audit_changes ADD CHECK (change_type IN (
  'created', 'corrected', 'voided', 'checkpoint_confirmed', 'installment_edited',
  'installment_cancelled', 'expense_split', 'shared_expense_edited', 'classification_bulk'
) AND (change_type <> 'classification_bulk' OR event_id IS NOT NULL));

ALTER TABLE finance.saved_filter_changes DROP CONSTRAINT saved_filter_changes_action_check;
ALTER TABLE finance.saved_filter_changes ADD CHECK (action IN ('create', 'rename', 'update-criteria', 'delete'));
GRANT UPDATE (criteria) ON finance.saved_history_filters TO finanzas_app;
