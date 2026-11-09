-- F1-07: RF-010/011/012; CA-013/015/016/017; I-01/10/11/12.
CREATE INDEX financial_events_history
  ON finance.financial_events(owner_id, effective_on DESC, id DESC);
CREATE INDEX balance_checkpoints_history
  ON finance.balance_checkpoints(owner_id, as_of_date DESC, id DESC);

-- Apply the same audited replacement rule to currency exchanges as to ordinary movements.
ALTER POLICY audited_movement_transition ON finance.financial_events
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finance.audit_changes a
       WHERE (a.owner_id, a.event_id) = (financial_events.owner_id, financial_events.id)
         AND a.change_type = financial_events.status
         AND (a.replacement_event_id IS NOT NULL OR a.idempotency_key IS NOT NULL)
    )
  );
