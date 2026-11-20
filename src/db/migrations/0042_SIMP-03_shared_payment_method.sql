-- A shared recurring expense can have a split without a bank or card entry.
ALTER TABLE finance.shared_expenses
  DROP CONSTRAINT shared_expenses_method_check,
  ADD CONSTRAINT shared_expenses_payment_method_check
    CHECK (method IN ('debit', 'transfer', 'credit', 'third_party', 'unspecified'));

CREATE OR REPLACE VIEW finance.recurring_active_allocations WITH (security_invoker = true) AS
SELECT a.owner_id, a.series_id, a.period_index, a.settlement_id, l.event_id, f.effective_on,
  coalesce(a.amount, s.total, abs(b.amount_signed), c.amount) AS amount,
  coalesce(m.method, s.method, 'credit') AS method
FROM finance.recurring_allocations a
JOIN finance.recurring_event_lineage l ON (l.owner_id, l.settlement_id) = (a.owner_id, a.settlement_id)
JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
LEFT JOIN finance.shared_expenses s ON (s.owner_id, s.event_id) = (f.owner_id, f.id)
LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
LEFT JOIN finance.bank_effects b ON (b.owner_id, b.id, b.event_id) = (m.owner_id, m.event_id, m.event_id)
LEFT JOIN finance.credit_lines c ON f.kind = 'card_purchase' AND (c.owner_id, c.event_id) = (f.owner_id, f.id)
WHERE f.status = 'confirmed';

UPDATE finance_meta.account_backup_layout SET layout = finance.account_backup_layout();
