-- RF-034 / CA-045, CA-046 / I-09. Forecasts carry no financial effects.
CREATE TABLE finance.recurring_periods (
  owner_id text NOT NULL,
  series_id uuid NOT NULL,
  period_index integer NOT NULL CHECK (period_index >= 0),
  period_key text NOT NULL CHECK (length(period_key) BETWEEN 4 AND 10),
  due_on date,
  reference_amount finance.exact_amount CHECK (reference_amount > 0),
  confirmed_total finance.exact_amount CHECK (confirmed_total > 0),
  finalized_amount finance.exact_amount CHECK (finalized_amount > 0),
  omitted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (owner_id, series_id, period_index),
  UNIQUE (owner_id, series_id, period_key),
  FOREIGN KEY (owner_id, series_id) REFERENCES finance.recurring_series(owner_id, id),
  CHECK (confirmed_total IS NULL OR finalized_amount IS NULL),
  CHECK (NOT omitted OR finalized_amount IS NULL)
);

-- Receipts are append-only apart from the pointer to a subsequent unlink receipt.
CREATE TABLE finance.recurring_commands (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  series_id uuid NOT NULL,
  event_id uuid,
  released_by uuid,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, series_id, id),
  FOREIGN KEY (owner_id, released_by) REFERENCES finance.recurring_commands(owner_id, id),
  CHECK (released_by IS NULL OR (event_id IS NOT NULL AND released_by <> id)),
  FOREIGN KEY (owner_id, series_id) REFERENCES finance.recurring_series(owner_id, id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id)
);

CREATE UNIQUE INDEX recurring_linked_event
  ON finance.recurring_commands(owner_id, event_id)
  WHERE event_id IS NOT NULL AND released_by IS NULL;

CREATE TABLE finance.recurring_allocations (
  owner_id text NOT NULL,
  series_id uuid NOT NULL,
  period_index integer NOT NULL,
  settlement_id uuid NOT NULL,
  -- NULL attributes the whole event, including its current corrected amount.
  amount finance.exact_amount CHECK (amount > 0),
  PRIMARY KEY (owner_id, series_id, period_index, settlement_id),
  FOREIGN KEY (owner_id, series_id, period_index)
    REFERENCES finance.recurring_periods(owner_id, series_id, period_index),
  FOREIGN KEY (owner_id, series_id, settlement_id)
    REFERENCES finance.recurring_commands(owner_id, series_id, id)
);
CREATE INDEX recurring_allocations_settlement ON finance.recurring_allocations(owner_id, settlement_id);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['recurring_periods', 'recurring_commands', 'recurring_allocations']
  LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY owner_isolation ON finance.%I TO finanzas_app
      USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
      WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))', relation_name);
    EXECUTE format('GRANT SELECT ON finance.%I TO finanzas_app', relation_name);
  END LOOP;
END
$policies$;
GRANT INSERT (owner_id, series_id, period_index, period_key, due_on, reference_amount, confirmed_total, finalized_amount, omitted)
  ON finance.recurring_periods TO finanzas_app;
GRANT INSERT (owner_id, id, series_id, event_id, command_hash, details)
  ON finance.recurring_commands TO finanzas_app;
GRANT INSERT ON finance.recurring_allocations TO finanzas_app;
GRANT UPDATE (confirmed_total, finalized_amount, omitted, version) ON finance.recurring_periods TO finanzas_app;
GRANT UPDATE (released_by) ON finance.recurring_commands TO finanzas_app;
CREATE POLICY recurring_release_once ON finance.recurring_commands AS RESTRICTIVE FOR UPDATE TO finanzas_app
  USING (released_by IS NULL AND event_id IS NOT NULL)
  WITH CHECK (released_by IS NOT NULL);

-- Movement corrections retain the original association and immutable audit chain.
CREATE VIEW finance.recurring_event_lineage WITH (security_invoker = true) AS
WITH RECURSIVE lineage(owner_id, series_id, settlement_id, event_id) AS (
  SELECT owner_id, series_id, id, event_id
  FROM finance.recurring_commands WHERE event_id IS NOT NULL AND released_by IS NULL
  UNION
  SELECT l.owner_id, l.series_id, l.settlement_id, a.replacement_event_id
  FROM lineage l JOIN finance.audit_changes a
    ON (a.owner_id, a.event_id) = (l.owner_id, l.event_id)
  WHERE a.replacement_event_id IS NOT NULL
)
SELECT * FROM lineage;
GRANT SELECT ON finance.recurring_event_lineage TO finanzas_app;
CREATE VIEW finance.recurring_active_allocations WITH (security_invoker = true) AS
SELECT a.owner_id, a.series_id, a.period_index, a.settlement_id, l.event_id, f.effective_on,
  coalesce(a.amount, abs(b.amount_signed), c.amount) AS amount,
  coalesce(m.method, 'credit') AS method
FROM finance.recurring_allocations a
JOIN finance.recurring_event_lineage l ON (l.owner_id, l.settlement_id) = (a.owner_id, a.settlement_id)
JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
LEFT JOIN finance.bank_effects b ON (b.owner_id, b.id, b.event_id) = (m.owner_id, m.event_id, m.event_id)
LEFT JOIN finance.credit_lines c ON f.kind = 'card_purchase' AND (c.owner_id, c.event_id) = (f.owner_id, f.id)
WHERE f.status = 'confirmed';
GRANT SELECT ON finance.recurring_active_allocations TO finanzas_app;
