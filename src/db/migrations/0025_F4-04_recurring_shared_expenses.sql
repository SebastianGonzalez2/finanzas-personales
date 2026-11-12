-- RF-036 / CA-048. Agreements are forecasts; actual shares use shared expenses.
CREATE TABLE finance.people (
  owner_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL CHECK (length(btrim(canonical_name)) BETWEEN 1 AND 200),
  normalized_name text NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 400),
  archived_at timestamptz,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, normalized_name)
);

CREATE TABLE finance.recurring_share_participants (
  owner_id text NOT NULL,
  series_id uuid NOT NULL,
  person_id uuid NOT NULL,
  percentage finance.exact_amount NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  PRIMARY KEY (owner_id, series_id, person_id),
  FOREIGN KEY (owner_id, series_id) REFERENCES finance.recurring_series(owner_id, id),
  FOREIGN KEY (owner_id, person_id) REFERENCES finance.people(owner_id, id)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['people', 'recurring_share_participants']
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
GRANT INSERT (owner_id, canonical_name, normalized_name) ON finance.people TO finanzas_app;
GRANT INSERT ON finance.recurring_share_participants TO finanzas_app;

-- Financial corrections append a revision, keeping the source payment immutable.
ALTER TABLE finance.shared_expense_details
  ADD COLUMN own_amount finance.exact_amount CHECK (own_amount >= 0),
  ADD COLUMN party_amounts jsonb CHECK (jsonb_typeof(party_amounts) = 'object'),
  ADD CHECK ((own_amount IS NULL) = (party_amounts IS NULL));

CREATE OR REPLACE VIEW finance.current_shared_expenses WITH (security_invoker = true) AS
  SELECT s.owner_id, s.event_id, s.currency, s.method, s.total,
         coalesce(r.own_amount, s.own_amount)::finance.exact_amount AS own_amount,
         d.version, d.concept, d.category_id, d.note
    FROM finance.shared_expenses s
    JOIN LATERAL (
      SELECT version, concept, category_id, note
        FROM finance.shared_expense_details
       WHERE (owner_id, event_id) = (s.owner_id, s.event_id)
       ORDER BY version DESC LIMIT 1
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT own_amount FROM finance.shared_expense_details
       WHERE (owner_id, event_id) = (s.owner_id, s.event_id) AND own_amount IS NOT NULL
       ORDER BY version DESC LIMIT 1
    ) r ON true;

-- Recurrences track the amount paid (or the full purchase in installments).
-- Receivables and personal consumption retain their own shared expense amounts.
CREATE OR REPLACE VIEW finance.recurring_active_allocations WITH (security_invoker = true) AS
SELECT a.owner_id, a.series_id, a.period_index, a.settlement_id, l.event_id, f.effective_on,
  coalesce(a.amount, s.total, abs(b.amount_signed), c.amount) AS amount,
  coalesce(m.method, 'credit') AS method
FROM finance.recurring_allocations a
JOIN finance.recurring_event_lineage l ON (l.owner_id, l.settlement_id) = (a.owner_id, a.settlement_id)
JOIN finance.financial_events f ON (f.owner_id, f.id) = (l.owner_id, l.event_id)
LEFT JOIN finance.shared_expenses s ON (s.owner_id, s.event_id) = (f.owner_id, f.id)
LEFT JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
LEFT JOIN finance.bank_effects b ON (b.owner_id, b.id, b.event_id) = (m.owner_id, m.event_id, m.event_id)
LEFT JOIN finance.credit_lines c ON f.kind = 'card_purchase' AND (c.owner_id, c.event_id) = (f.owner_id, f.id)
WHERE f.status = 'confirmed';
