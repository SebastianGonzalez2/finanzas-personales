-- F2-03: RF-016; CA-022; I-01/02/10/11/12.
CREATE TABLE finance.installment_plans (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  installment_amount finance.exact_amount NOT NULL CHECK (installment_amount > 0),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 2 AND 120),
  active_count integer NOT NULL CHECK (active_count BETWEEN 0 AND installment_count),
  first_period date NOT NULL CHECK (extract(day FROM first_period) = 1 AND first_period >= DATE '0001-01-01'),
  change_type text NOT NULL CHECK (change_type IN ('created', 'edited', 'cancelled')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, event_id, version),
  FOREIGN KEY (owner_id, event_id, currency) REFERENCES finance.credit_lines(owner_id, event_id, currency),
  CHECK ((version = 1) = (change_type = 'created')),
  CHECK (version <> 1 OR active_count = installment_count),
  CHECK (installment_amount * installment_count <= 9999999999999999.9999),
  CHECK (first_period + (installment_count - 1) * INTERVAL '1 month' < DATE '10000-01-01')
);
ALTER TABLE finance.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.installment_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.installment_plans TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.installment_plans TO finanzas_app;

ALTER TABLE finance.audit_changes DROP CONSTRAINT audit_changes_change_type_check;
ALTER TABLE finance.audit_changes ADD CHECK (change_type IN (
  'created', 'corrected', 'voided', 'checkpoint_confirmed', 'installment_edited', 'installment_cancelled'
));
ALTER TABLE finance.audit_changes DROP CONSTRAINT audit_changes_check;
ALTER TABLE finance.audit_changes ADD CHECK (
  (replacement_event_id IS NULL OR
    (change_type = 'corrected' AND event_id IS NOT NULL AND replacement_event_id <> event_id))
  AND ((idempotency_key IS NULL AND command_hash IS NULL
      AND change_type NOT IN ('installment_edited', 'installment_cancelled')) OR
    (idempotency_key IS NOT NULL AND command_hash IS NOT NULL AND command_hash ~ '^[a-f0-9]{64}$'
      AND change_type IN ('voided', 'installment_edited', 'installment_cancelled') AND event_id IS NOT NULL))
);
DROP INDEX finance.audit_movement_revision;
CREATE UNIQUE INDEX audit_movement_revision ON finance.audit_changes(owner_id, event_id)
  WHERE replacement_event_id IS NOT NULL OR (change_type = 'voided' AND idempotency_key IS NOT NULL);

CREATE VIEW finance.current_installment_plans WITH (security_invoker = true) AS
  SELECT DISTINCT ON (owner_id, event_id) *
    FROM finance.installment_plans
   ORDER BY owner_id, event_id, version DESC;

CREATE OR REPLACE VIEW finance.credit_expenses WITH (security_invoker = true) AS
  SELECT f.owner_id, f.id, f.effective_on, f.created_at, f.concept,
         l.currency, l.amount, o.note, o.category_id, 'credit'::text AS method,
         NULL::integer AS installment_ordinal
    FROM finance.financial_events f
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
   WHERE f.kind = 'card_purchase' AND f.status = 'confirmed'
     AND NOT EXISTS (SELECT 1 FROM finance.installment_plans p
       WHERE (p.owner_id, p.event_id, p.version) = (f.owner_id, f.id, 1))
   UNION ALL
  SELECT f.owner_id, f.id, f.effective_on, f.created_at, 'Comisión bancaria',
         l.bank_currency, sum(l.fee), NULL::text, NULL::uuid, 'credit'::text, NULL::integer
    FROM finance.financial_events f
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
   WHERE f.kind = 'card_payment' AND f.status = 'confirmed' AND l.fee > 0
   GROUP BY f.owner_id, f.id, l.bank_currency
   UNION ALL
  SELECT f.owner_id, f.id, (p.first_period + (i.ordinal - 1) * INTERVAL '1 month')::date,
         f.created_at, f.concept, p.currency, p.installment_amount, o.note, o.category_id,
         'credit'::text, i.ordinal
    FROM finance.current_installment_plans p
    JOIN finance.financial_events f ON (f.owner_id, f.id) = (p.owner_id, p.event_id)
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (p.owner_id, p.event_id)
    CROSS JOIN LATERAL generate_series(1, p.active_count) AS i(ordinal)
   WHERE f.kind = 'card_purchase' AND f.status = 'confirmed';

GRANT SELECT ON finance.current_installment_plans TO finanzas_app;
