-- F1-04: RF-010; CA-013/014/016; I-01/10/11/12.
ALTER TABLE finance.audit_changes
  ADD COLUMN replacement_event_id uuid,
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN command_hash text,
  ADD FOREIGN KEY (owner_id, replacement_event_id) REFERENCES finance.financial_events(owner_id, id),
  ADD CHECK (
    (replacement_event_id IS NULL OR
      (change_type = 'corrected' AND event_id IS NOT NULL AND replacement_event_id <> event_id))
    AND
    ((idempotency_key IS NULL AND command_hash IS NULL) OR
      (idempotency_key IS NOT NULL AND command_hash IS NOT NULL AND command_hash ~ '^[a-f0-9]{64}$'
        AND change_type = 'voided' AND event_id IS NOT NULL))
  );

CREATE UNIQUE INDEX audit_void_command_key
  ON finance.audit_changes(owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX audit_movement_revision
  ON finance.audit_changes(owner_id, event_id)
  WHERE replacement_event_id IS NOT NULL OR idempotency_key IS NOT NULL;

-- The owner can change only the status of a confirmed event with a revision
-- in the same transaction. Original amounts, dates, details and audit stay intact.
CREATE POLICY audited_movement_transition ON finance.financial_events
  AS RESTRICTIVE FOR UPDATE TO finanzas_app
  USING (status = 'confirmed' AND kind IN ('income', 'expense'))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finance.audit_changes a
       WHERE (a.owner_id, a.event_id) = (financial_events.owner_id, financial_events.id)
         AND a.change_type = financial_events.status
         AND (a.replacement_event_id IS NOT NULL OR a.idempotency_key IS NOT NULL)
    )
  );
GRANT UPDATE (status) ON finance.financial_events TO finanzas_app;
