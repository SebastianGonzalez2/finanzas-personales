-- F3-06: RF-031/032; CA-043; I-01/02/10/11/12. No bank/debt/reserve writes.
CREATE TABLE finance.budget_limits (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  category_id uuid NOT NULL,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, category_id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id)
);

-- Append-only configuration and command receipts, including deactivation.
CREATE TABLE finance.budget_changes (
  owner_id text NOT NULL,
  budget_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('save','edit','exception','remove')),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  currency finance.currency NOT NULL,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, budget_id, version),
  UNIQUE (owner_id, idempotency_key),
  FOREIGN KEY (owner_id, budget_id) REFERENCES finance.budget_limits(owner_id, id)
);

-- Manual fallback, explicitly identified; automatic ingestion belongs to F5-06.
-- Quotes are immutable. Missing quotes never imply a 1:1 conversion.
CREATE TABLE finance.budget_quotes (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  from_currency finance.currency NOT NULL,
  to_currency finance.currency NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0 AND rate < 100000000 AND scale(rate) <= 8),
  effective_on date NOT NULL,
  source text NOT NULL CHECK (source = 'manual'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, id, from_currency, to_currency),
  CHECK (from_currency <> to_currency)
);
CREATE INDEX budget_quotes_lookup ON finance.budget_quotes
  (owner_id, from_currency, to_currency, effective_on DESC, recorded_at DESC);

CREATE TABLE finance.budget_rates (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  from_currency finance.currency NOT NULL,
  to_currency finance.currency NOT NULL,
  quote_id uuid NOT NULL,
  reference_on date NOT NULL,
  PRIMARY KEY (owner_id, event_id, from_currency, to_currency),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, quote_id, from_currency, to_currency)
    REFERENCES finance.budget_quotes(owner_id, id, from_currency, to_currency)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['budget_limits','budget_changes','budget_quotes','budget_rates'] LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY owner_isolation ON finance.%I TO finanzas_app
      USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
      WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))', relation_name);
    EXECUTE format('GRANT SELECT, INSERT ON finance.%I TO finanzas_app', relation_name);
  END LOOP;
END
$policies$;

-- Capture all available target currencies when the installment purchase is
-- registered, even if there is no budget yet. All later installments reuse it.
CREATE FUNCTION finance.capture_installment_budget_rates() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, finance AS $body$
DECLARE registration_day date;
BEGIN
  IF NEW.version = 1 THEN
    SELECT (created_at AT TIME ZONE 'America/Montevideo')::date INTO STRICT registration_day
      FROM finance.financial_events WHERE (owner_id,id)=(NEW.owner_id,NEW.event_id);
    INSERT INTO finance.budget_rates
      (owner_id,event_id,from_currency,to_currency,quote_id,reference_on)
    SELECT NEW.owner_id, NEW.event_id, NEW.currency, q.to_currency, q.id,
           registration_day
      FROM (SELECT DISTINCT ON (to_currency) id, to_currency
              FROM finance.budget_quotes
             WHERE owner_id = NEW.owner_id AND from_currency = NEW.currency
               AND effective_on <= registration_day
             ORDER BY to_currency, effective_on DESC, recorded_at DESC, id DESC) q
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END
$body$;
REVOKE ALL ON FUNCTION finance.capture_installment_budget_rates() FROM PUBLIC;
CREATE TRIGGER installment_budget_rates AFTER INSERT ON finance.installment_plans
  FOR EACH ROW EXECUTE FUNCTION finance.capture_installment_budget_rates();

-- One consumption source. Mixed splits replace their original credit/debit
-- rows; shared purchases count only the holder's share. Refund credits remain
-- separate (v9.42), cancelled installments are excluded by existing views.
CREATE VIEW finance.budget_expenses WITH (security_invoker = true) AS
  SELECT f.owner_id, f.id AS event_id, e.currency, -e.amount_signed AS amount,
         m.category_id, f.effective_on, f.effective_on AS reference_on
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m ON (m.owner_id,m.event_id) = (f.owner_id,f.id)
    JOIN finance.bank_effects e ON (e.owner_id,e.event_id) = (f.owner_id,f.id)
   WHERE f.kind = 'expense' AND f.status = 'confirmed'
     AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
       WHERE (s.owner_id,s.event_id) = (f.owner_id,f.id))
  UNION ALL
  SELECT s.owner_id, s.event_id, s.currency, s.own_amount, s.category_id,
         f.effective_on, f.effective_on
    FROM finance.current_shared_expenses s
    JOIN finance.financial_events f ON (f.owner_id,f.id) = (s.owner_id,s.event_id)
   WHERE s.method <> 'credit' AND f.status = 'confirmed' AND s.own_amount > 0
  UNION ALL
  SELECT x.owner_id, x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN x.installment_ordinal IS NULL THEN x.effective_on
              ELSE (f.created_at AT TIME ZONE 'America/Montevideo')::date END
    FROM finance.credit_consumption x
    JOIN finance.financial_events f ON (f.owner_id,f.id) = (x.owner_id,x.id)
   WHERE x.amount > 0 AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
     WHERE (m.owner_id,m.event_id) = (x.owner_id,x.id))
  UNION ALL
  SELECT x.owner_id, x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN x.installment_ordinal IS NULL THEN x.effective_on
              ELSE (f.created_at AT TIME ZONE 'America/Montevideo')::date END
    FROM finance.mixed_purchase_expenses x
    JOIN finance.financial_events f ON (f.owner_id,f.id) = (x.owner_id,x.id);
GRANT SELECT ON finance.budget_expenses TO finanzas_app;
