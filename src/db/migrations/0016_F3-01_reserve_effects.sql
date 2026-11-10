-- F3-01: RF-026/027, CA-038, I-03/I-12. Append-only virtual effects.
ALTER TABLE finance.fund_changes DROP CONSTRAINT fund_changes_action_check;
ALTER TABLE finance.fund_changes ADD CONSTRAINT fund_changes_action_check
  CHECK (action IN ('create', 'update', 'reserve', 'release', 'transfer'));

ALTER TABLE finance.savings_funds ADD UNIQUE (owner_id, id, currency);
CREATE INDEX savings_funds_owner_currency ON finance.savings_funds(owner_id, currency);

CREATE TABLE finance.reserve_effects (
  owner_id text NOT NULL,
  command_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  delta finance.exact_amount NOT NULL CHECK (delta <> 0),
  fund_version integer NOT NULL CHECK (fund_version > 1),
  PRIMARY KEY (owner_id, command_id, fund_id),
  UNIQUE (owner_id, fund_id, fund_version),
  FOREIGN KEY (owner_id, command_id) REFERENCES finance.fund_changes(owner_id, idempotency_key),
  FOREIGN KEY (owner_id, fund_id, currency) REFERENCES finance.savings_funds(owner_id, id, currency)
);

ALTER TABLE finance.reserve_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.reserve_effects FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.reserve_effects TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.reserve_effects TO finanzas_app;
GRANT UPDATE (reserved_amount) ON finance.savings_funds TO finanzas_app;
