-- F1-06: RF-009; CA-012; I-01/10/11/12.
CREATE INDEX recent_bank_transfers
  ON finance.financial_events(owner_id, effective_on DESC, created_at DESC, id DESC)
  WHERE kind = 'bank_transfer' AND status = 'confirmed';

-- The same audited transition can undo the two effects of a transfer together.
-- Ordinary movements retain their existing correction and void rules.
ALTER POLICY audited_movement_transition ON finance.financial_events
  USING (status = 'confirmed' AND kind IN ('income', 'expense', 'bank_transfer'))
  WITH CHECK (
    (kind <> 'bank_transfer' OR status = 'voided')
    AND EXISTS (
      SELECT 1 FROM finance.audit_changes a
       WHERE (a.owner_id, a.event_id) = (financial_events.owner_id, financial_events.id)
         AND a.change_type = financial_events.status
         AND (a.replacement_event_id IS NOT NULL OR a.idempotency_key IS NOT NULL)
    )
  );
