-- F1-05: RF-008/012; CA-011/015; I-01/10/11/12.
-- A correction uses the position of the original event, even on the date of
-- a checkpoint. Resolve existing F1-04 revisions without rewriting any rows.
CREATE UNIQUE INDEX audit_movement_replacement
  ON finance.audit_changes(owner_id, replacement_event_id)
  WHERE replacement_event_id IS NOT NULL;

CREATE VIEW finance.bank_event_positions WITH (security_invoker = true) AS
  SELECT f.*, (
    WITH RECURSIVE lineage(id) AS (
      SELECT f.id
      UNION
      SELECT a.event_id
        FROM lineage l JOIN finance.audit_changes a
          ON a.owner_id = f.owner_id AND a.replacement_event_id = l.id
    )
    SELECT root.created_at
      FROM lineage l JOIN finance.financial_events root
        ON (root.owner_id, root.id) = (f.owner_id, l.id)
     WHERE NOT EXISTS (
       SELECT 1 FROM finance.audit_changes a
        WHERE a.owner_id = f.owner_id AND a.replacement_event_id = l.id
     )
  ) AS bank_recorded_at
  FROM finance.financial_events f;
GRANT SELECT ON finance.bank_event_positions TO finanzas_app;

CREATE TABLE finance.balance_adjustments (
  owner_id text NOT NULL,
  checkpoint_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  -- This is a sum of exact amounts, which may exceed the range of a single input.
  original_projection numeric NOT NULL
    CHECK (original_projection NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  note text CHECK (length(note) BETWEEN 1 AND 500),
  PRIMARY KEY (owner_id, checkpoint_id),
  UNIQUE (owner_id, idempotency_key),
  FOREIGN KEY (owner_id, checkpoint_id) REFERENCES finance.balance_checkpoints(owner_id, id)
);

ALTER TABLE finance.balance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.balance_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.balance_adjustments TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.balance_adjustments TO finanzas_app;
