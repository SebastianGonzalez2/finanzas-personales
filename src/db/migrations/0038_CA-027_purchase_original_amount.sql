-- RF-020 / CA-027. Informational reference on the existing owner-scoped record.
ALTER TABLE finance.credit_lines
  ADD COLUMN original_amount finance.exact_amount,
  ADD COLUMN original_currency finance.currency,
  ADD CONSTRAINT credit_lines_original_purchase_check CHECK (
    (original_amount IS NULL AND original_currency IS NULL)
    OR (original_amount IS NOT NULL AND original_amount > 0
      AND original_currency IS NOT NULL AND original_currency <> currency)
  );

-- credit_lines already belongs to the backup/restore inventory.
UPDATE finance_meta.account_backup_layout SET layout = finance.account_backup_layout();
