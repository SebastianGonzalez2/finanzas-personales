-- RF-033 / CA-044: private schedule definitions without financial events.
CREATE TABLE finance.recurring_series (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  concept text NOT NULL CHECK (length(btrim(concept)) BETWEEN 1 AND 200),
  category_id uuid,
  currency finance.currency NOT NULL,
  note text CHECK (length(note) <= 500),
  reference_amount finance.exact_amount CHECK (reference_amount > 0),
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  first_period date NOT NULL CHECK (first_period BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  date_mode text NOT NULL CHECK (date_mode IN ('none', 'approximate', 'exact')),
  due_day smallint,
  end_date date CHECK (end_date BETWEEN first_period AND DATE '9999-12-31'),
  paused boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id),
  CHECK (CASE WHEN date_mode = 'exact' AND frequency <> 'weekly'
    THEN due_day IS NOT NULL AND due_day BETWEEN 1 AND 31
    ELSE due_day IS NULL END)
);

ALTER TABLE finance.recurring_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.recurring_series FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.recurring_series TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT ON finance.recurring_series TO finanzas_app;
GRANT INSERT (owner_id, id, command_hash, kind, concept, category_id, currency, note,
  reference_amount, frequency, first_period, date_mode, due_day, end_date)
  ON finance.recurring_series TO finanzas_app;
