-- F1-03: RF-004/006/007; CA-008..010; I-01/10/11/12.
-- Metadata for ordinary bank-backed events. The signed amount remains in bank_effects.
CREATE TABLE finance.ordinary_movements (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  category_id uuid,
  method text NOT NULL CHECK (method IN ('deposit', 'debit', 'transfer')),
  note text CHECK (length(note) <= 500),
  PRIMARY KEY (owner_id, event_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id)
);

ALTER TABLE finance.ordinary_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ordinary_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.ordinary_movements TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.ordinary_movements TO finanzas_app;
