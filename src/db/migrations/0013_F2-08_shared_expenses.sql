-- F2-08: RF-025; CA-035/036; I-01/02/04/05/10/11/12.
CREATE TABLE finance.shared_expenses (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  method text NOT NULL CHECK (method IN ('debit', 'transfer', 'credit', 'third_party')),
  total finance.exact_amount NOT NULL CHECK (total > 0),
  own_amount finance.exact_amount NOT NULL CHECK (own_amount >= 0 AND own_amount <= total),
  PRIMARY KEY (owner_id, event_id),
  UNIQUE (owner_id, event_id, currency),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  CHECK ((method = 'third_party') = (own_amount = total))
);

CREATE TABLE finance.shared_expense_details (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  concept text NOT NULL CHECK (length(btrim(concept)) BETWEEN 1 AND 200),
  category_id uuid,
  note text CHECK (length(note) <= 500),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, event_id, version),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.shared_expenses(owner_id, event_id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id)
);

ALTER TABLE finance.loans ADD COLUMN source_expense_id uuid;
ALTER TABLE finance.loans ADD FOREIGN KEY (owner_id, source_expense_id, currency)
  REFERENCES finance.shared_expenses(owner_id, event_id, currency);
ALTER TABLE finance.loans ADD CHECK (source_expense_id IS NULL OR NOT installment_loan);
CREATE INDEX loan_source_expense ON finance.loans (owner_id, source_expense_id)
  WHERE source_expense_id IS NOT NULL;

ALTER TABLE finance.loan_operations DROP CONSTRAINT loan_operations_action_check;
ALTER TABLE finance.loan_operations ADD CHECK (
  action IN ('existing', 'lend', 'borrow', 'shared_expense', 'settle', 'adjust', 'interest')
);
ALTER TABLE finance.loan_operations DROP CONSTRAINT loan_operations_check1;
ALTER TABLE finance.loan_operations ADD CONSTRAINT loan_operations_opening_action_check CHECK (
  (version = 1) = (action IN ('existing', 'lend', 'borrow', 'shared_expense'))
);

ALTER TABLE finance.audit_changes DROP CONSTRAINT audit_changes_change_type_check;
ALTER TABLE finance.audit_changes ADD CHECK (change_type IN (
  'created', 'corrected', 'voided', 'checkpoint_confirmed', 'installment_edited',
  'installment_cancelled', 'expense_split', 'shared_expense_edited'
));
ALTER TABLE finance.audit_changes DROP CONSTRAINT audit_changes_check;
ALTER TABLE finance.audit_changes ADD CHECK (
  (replacement_event_id IS NULL OR
    (change_type = 'corrected' AND event_id IS NOT NULL AND replacement_event_id <> event_id))
  AND ((idempotency_key IS NULL AND command_hash IS NULL
    AND change_type NOT IN ('installment_edited', 'installment_cancelled', 'expense_split', 'shared_expense_edited'))
    OR (idempotency_key IS NOT NULL AND command_hash IS NOT NULL AND command_hash ~ '^[a-f0-9]{64}$'
      AND change_type IN ('voided', 'installment_edited', 'installment_cancelled', 'expense_split', 'shared_expense_edited')
      AND event_id IS NOT NULL))
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['shared_expenses', 'shared_expense_details']
  LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY owner_isolation ON finance.%I TO finanzas_app
      USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
      WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))', relation_name);
    EXECUTE format('GRANT SELECT, INSERT ON finance.%I TO finanzas_app', relation_name);
  END LOOP;
END
$policies$;

-- Generic reversals cannot detach a confirmed expense from its obligations.
CREATE POLICY preserve_shared_expenses ON finance.financial_events AS RESTRICTIVE
  FOR UPDATE TO finanzas_app USING (NOT EXISTS (
    SELECT 1 FROM finance.shared_expenses s
     WHERE (s.owner_id, s.event_id) = (financial_events.owner_id, financial_events.id)
  ));

CREATE VIEW finance.current_shared_expenses WITH (security_invoker = true) AS
  SELECT s.*, d.version, d.concept, d.category_id, d.note
    FROM finance.shared_expenses s
    JOIN LATERAL (
      SELECT version, concept, category_id, note
        FROM finance.shared_expense_details
       WHERE (owner_id, event_id) = (s.owner_id, s.event_id)
       ORDER BY version DESC LIMIT 1
    ) d ON true;

-- Credit debt continues to use the full confirmed charge. Consumption uses
-- only the holder's share, distributing exact 0.0001 units over the plan.
CREATE VIEW finance.credit_consumption WITH (security_invoker = true) AS
  SELECT x.owner_id, x.id, x.effective_on, x.created_at,
         coalesce(s.concept, x.concept) AS concept, x.currency,
         CASE WHEN s.event_id IS NULL THEN x.amount
              WHEN x.installment_ordinal IS NULL THEN s.own_amount
              ELSE (div(s.own_amount * 10000, p.installment_count)
                  + (x.installment_ordinal <= mod(s.own_amount * 10000, p.installment_count))::int) * 0.0001
         END AS amount,
         CASE WHEN s.event_id IS NULL THEN x.note ELSE s.note END AS note,
         CASE WHEN s.event_id IS NULL THEN x.category_id ELSE s.category_id END AS category_id,
         x.method, x.installment_ordinal
    FROM finance.credit_expenses x
    LEFT JOIN finance.current_shared_expenses s ON (s.owner_id, s.event_id) = (x.owner_id, x.id)
    LEFT JOIN finance.current_installment_plans p ON x.installment_ordinal IS NOT NULL
      AND (p.owner_id, p.event_id) = (s.owner_id, s.event_id);

GRANT SELECT ON finance.current_shared_expenses, finance.credit_consumption TO finanzas_app;
