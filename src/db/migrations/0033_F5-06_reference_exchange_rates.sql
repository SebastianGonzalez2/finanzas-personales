-- Public market observations are append-only and contain no owner data.
CREATE TABLE finance.fx_reference_rates (
  base_currency finance.currency NOT NULL,
  quote_currency finance.currency NOT NULL,
  observed_on date NOT NULL,
  source text NOT NULL CHECK (source IN ('datosuruguay', 'frankfurter')),
  rate numeric NOT NULL CHECK (rate > 0 AND rate < 1000000000000 AND scale(rate) <= 18),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (base_currency <> quote_currency),
  PRIMARY KEY (base_currency, quote_currency, observed_on, source)
);
CREATE INDEX fx_reference_rates_provider_date
  ON finance.fx_reference_rates (base_currency, quote_currency, source, observed_on DESC);

-- Refresh state for public calendar-year queries, shared across accounts.
CREATE TABLE finance.fx_reference_refreshes (
  year integer PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
  retry_at timestamptz NOT NULL,
  primary_pairs text[] NOT NULL DEFAULT '{}',
  backup_pairs text[] NOT NULL DEFAULT '{}'
);

-- Each owner's historical rate is fixed for an effective date and currency pair.
-- Multiple movements on the same date reuse it. Date corrections select a new key.
CREATE TABLE finance.fx_valuations (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  effective_on date NOT NULL,
  base_currency finance.currency NOT NULL,
  quote_currency finance.currency NOT NULL,
  observed_on date NOT NULL,
  source text NOT NULL CHECK (source IN ('datosuruguay', 'frankfurter', 'manual')),
  manual_rate numeric CHECK (manual_rate > 0 AND manual_rate < 1000000000000 AND scale(manual_rate) <= 18),
  reference_source text GENERATED ALWAYS AS (nullif(source, 'manual')) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (base_currency <> quote_currency AND observed_on <= effective_on),
  CHECK ((source = 'manual') = (manual_rate IS NOT NULL)),
  CHECK (source <> 'manual' OR observed_on = effective_on),
  PRIMARY KEY (owner_id, effective_on, base_currency, quote_currency),
  FOREIGN KEY (base_currency, quote_currency, observed_on, reference_source)
    REFERENCES finance.fx_reference_rates (base_currency, quote_currency, observed_on, source)
);

ALTER TABLE finance.fx_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.fx_valuations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.fx_valuations TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));

GRANT SELECT, INSERT ON finance.fx_reference_rates, finance.fx_valuations TO finanzas_app;
GRANT SELECT, INSERT ON finance.fx_reference_refreshes TO finanzas_app;
GRANT UPDATE (retry_at, primary_pairs, backup_pairs) ON finance.fx_reference_refreshes TO finanzas_app;
GRANT UPDATE (display_currency, version) ON finance.user_preferences TO finanzas_app;
