-- RF-032 / CA-042: one immutable internal notice per budget, month and threshold.
CREATE TABLE finance.budget_notices (
  owner_id text NOT NULL,
  budget_id uuid NOT NULL,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  threshold smallint NOT NULL CHECK (threshold IN (80, 100)),
  percent numeric NOT NULL CHECK (percent = trunc(percent) AND percent >= threshold
    AND (threshold = 100 OR percent < 100)),
  currency finance.currency NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, budget_id, month, threshold),
  FOREIGN KEY (owner_id, budget_id) REFERENCES finance.budget_limits(owner_id, id)
);

ALTER TABLE finance.budget_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.budget_notices FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.budget_notices TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.budget_notices TO finanzas_app;
