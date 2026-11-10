-- F2-06: RF-022/023; CA-030/031/032; I-04/10/11/12.
ALTER TABLE finance.financial_events DROP CONSTRAINT financial_events_kind_check;
ALTER TABLE finance.financial_events ADD CONSTRAINT financial_events_kind_check
  CHECK (kind IN ('income', 'expense', 'bank_transfer', 'balance_adjustment',
    'card_purchase', 'card_payment', 'card_opening', 'card_adjustment', 'loan_operation'));

CREATE TABLE finance.loans (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('payable', 'receivable')),
  currency finance.currency NOT NULL,
  installment_loan boolean NOT NULL,
  installment_amount finance.exact_amount CHECK (installment_amount > 0),
  frequency text CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  due_on date,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, id, currency),
  FOREIGN KEY (owner_id, id) REFERENCES finance.financial_events(owner_id, id),
  CHECK (installment_loan OR (installment_amount IS NULL AND frequency IS NULL))
);

CREATE TABLE finance.loan_operations (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  action text NOT NULL CHECK (action IN ('existing', 'lend', 'borrow', 'settle', 'adjust', 'interest')),
  amount finance.exact_amount NOT NULL CHECK (amount >= 0),
  outstanding finance.exact_amount NOT NULL CHECK (outstanding >= 0),
  accrued_interest finance.exact_amount NOT NULL CHECK (accrued_interest BETWEEN 0 AND outstanding),
  principal_paid finance.exact_amount CHECK (principal_paid >= 0),
  accrued_paid finance.exact_amount NOT NULL DEFAULT 0 CHECK (accrued_paid >= 0),
  expense finance.exact_amount NOT NULL DEFAULT 0 CHECK (expense >= 0),
  needs_reconciliation boolean NOT NULL,
  note text CHECK (length(note) <= 500),
  PRIMARY KEY (owner_id, event_id),
  UNIQUE (owner_id, loan_id, version),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, loan_id, currency) REFERENCES finance.loans(owner_id, id, currency),
  CHECK ((version = 1) = (action IN ('existing', 'lend', 'borrow'))),
  CHECK ((version = 1) = (event_id = loan_id)),
  CHECK (amount > 0 OR action = 'adjust'),
  CHECK (CASE WHEN action = 'settle' THEN
    CASE WHEN principal_paid IS NULL THEN needs_reconciliation AND accrued_paid = 0 AND expense = 0
         ELSE principal_paid + accrued_paid + expense = amount END
    ELSE principal_paid IS NULL AND accrued_paid = 0 END),
  CHECK (CASE WHEN action = 'interest' THEN expense = amount
              WHEN action = 'settle' THEN true ELSE expense = 0 END)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['loans', 'loan_operations']
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
