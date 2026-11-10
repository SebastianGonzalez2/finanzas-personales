-- F2-04: RF-017/037; CA-023. Cycle metadata never posts monetary effects.
CREATE TABLE finance.card_cycle_changes (
  owner_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  card_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'credit' CHECK (kind = 'credit'),
  scope text NOT NULL CHECK (scope IN ('schedule', 'dates', 'statement', 'assignment')),
  version integer NOT NULL CHECK (version > 0),
  cycle_period date CHECK (cycle_period BETWEEN DATE '0001-01-01' AND DATE '9999-12-01'
    AND extract(day FROM cycle_period) = 1),
  currency finance.currency,
  purchase_id uuid,
  purchase_ordinal smallint CHECK (purchase_ordinal BETWEEN 0 AND 120),
  closing_day smallint CHECK (closing_day BETWEEN 1 AND 31),
  due_day smallint CHECK (due_day BETWEEN 1 AND 31),
  lead_days smallint CHECK (lead_days BETWEEN 0 AND 365),
  closing_on date CHECK (closing_on >= cycle_period AND closing_on < cycle_period + INTERVAL '1 month'),
  due_on date CHECK (due_on BETWEEN cycle_period AND DATE '9999-12-31'),
  official_amount finance.exact_amount CHECK (official_amount >= 0),
  minimum_amount finance.exact_amount CHECK (minimum_amount IS NULL OR
    (official_amount IS NOT NULL AND minimum_amount BETWEEN 0 AND official_amount)),
  assigned_period date CHECK (assigned_period BETWEEN DATE '0001-01-01' AND DATE '9999-12-01'
    AND extract(day FROM assigned_period) = 1),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  UNIQUE NULLS NOT DISTINCT (owner_id, card_id, scope, cycle_period, currency, purchase_id, purchase_ordinal, version),
  FOREIGN KEY (owner_id, card_id, kind) REFERENCES finance.cards(owner_id, id, kind),
  FOREIGN KEY (owner_id, card_id, currency, kind) REFERENCES finance.card_currencies(owner_id, card_id, currency, kind),
  FOREIGN KEY (owner_id, purchase_id, currency, card_id) REFERENCES finance.credit_lines(owner_id, event_id, currency, card_id),
  CHECK ((scope IN ('dates', 'statement')) = (cycle_period IS NOT NULL)),
  CHECK ((scope IN ('statement', 'assignment')) = (currency IS NOT NULL)),
  CHECK ((scope = 'assignment') = (purchase_id IS NOT NULL)),
  CHECK ((scope = 'assignment') = (purchase_ordinal IS NOT NULL)),
  CHECK ((scope = 'schedule') = (lead_days IS NOT NULL)),
  CHECK (scope = 'schedule' OR (closing_day IS NULL AND due_day IS NULL)),
  CHECK (scope = 'dates' OR closing_on IS NULL),
  CHECK (scope IN ('dates', 'statement') OR due_on IS NULL),
  CHECK (scope = 'statement' OR (official_amount IS NULL AND minimum_amount IS NULL)),
  CHECK (scope = 'assignment' OR assigned_period IS NULL),
  CHECK (due_on >= closing_on)
);

ALTER TABLE finance.card_cycle_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.card_cycle_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.card_cycle_changes TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.card_cycle_changes TO finanzas_app;

CREATE VIEW finance.current_card_cycles WITH (security_invoker = true) AS
  SELECT DISTINCT ON (owner_id, card_id, scope, cycle_period, currency, purchase_id, purchase_ordinal) *
    FROM finance.card_cycle_changes
   ORDER BY owner_id, card_id, scope, cycle_period, currency, purchase_id, purchase_ordinal, version DESC;
GRANT SELECT ON finance.current_card_cycles TO finanzas_app;

ALTER TABLE finance.credit_lines ADD COLUMN statement_period date CHECK (
  statement_period IS NULL OR (bank_amount IS NOT NULL
    AND statement_period BETWEEN DATE '0001-01-01' AND DATE '9999-12-01'
    AND extract(day FROM statement_period) = 1)
);
CREATE INDEX credit_lines_statement ON finance.credit_lines(owner_id, card_id, statement_period, currency)
  WHERE statement_period IS NOT NULL;
