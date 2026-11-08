-- F0-05: RF-004, RNF-01/02/03/04/15; CA-001 (DB), I-10/11/12.
-- Only additive. The runner owns BEGIN/COMMIT and the migration checksum.
CREATE ROLE finanzas_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
DO $grant$
BEGIN
  EXECUTE format('GRANT finanzas_app TO %I', current_user);
END
$grant$;

CREATE SCHEMA finance;
CREATE SCHEMA finance_meta;
REVOKE ALL ON SCHEMA finance, finance_meta FROM PUBLIC;
GRANT USAGE ON SCHEMA finance TO finanzas_app;

CREATE TABLE finance_meta.schema_migrations (
  version text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Unconstrained NUMERIC first: reject excess scale rather than round on cast.
CREATE DOMAIN finance.exact_amount AS numeric
  CHECK (VALUE > -10000000000000000 AND VALUE < 10000000000000000
    AND scale(VALUE) <= 4);
CREATE DOMAIN finance.currency AS text CHECK (VALUE IN ('UYU', 'USD', 'EUR'));

CREATE TABLE finance.user_preferences (
  owner_id text PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 200),
  display_currency finance.currency NOT NULL DEFAULT 'USD',
  language text NOT NULL DEFAULT 'es' CHECK (language = 'es'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE finance.categories (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  parent_id uuid,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  archived_at timestamptz,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, parent_id) REFERENCES finance.categories(owner_id, id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE finance.financial_events (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income', 'expense', 'bank_transfer', 'balance_adjustment')),
  concept text NOT NULL CHECK (length(btrim(concept)) BETWEEN 1 AND 200),
  effective_on date NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'corrected', 'voided')),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX financial_events_owner_date ON finance.financial_events(owner_id, effective_on DESC, id);

CREATE TABLE finance.bank_effects (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  event_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  amount_signed finance.exact_amount NOT NULL CHECK (amount_signed <> 0),
  effective_on date NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id)
);
CREATE INDEX bank_effects_owner_event ON finance.bank_effects(owner_id, event_id);
CREATE INDEX bank_effects_owner_currency_date ON finance.bank_effects(owner_id, currency, effective_on DESC, id);

CREATE TABLE finance.balance_checkpoints (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  currency finance.currency NOT NULL,
  confirmed_amount finance.exact_amount NOT NULL,
  as_of_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source = 'manual'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX balance_checkpoints_owner_currency_date ON finance.balance_checkpoints(owner_id, currency, as_of_date DESC, id);

CREATE TABLE finance.audit_changes (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  event_id uuid,
  change_type text NOT NULL CHECK (change_type IN ('created', 'corrected', 'voided', 'checkpoint_confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id)
);
CREATE INDEX audit_changes_owner_event ON finance.audit_changes(owner_id, event_id);

-- The server supplies the owner only after fresh session + admission checks.
-- This GUC is a trusted-server context, never a JWT validator or client input.
DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['user_preferences', 'categories', 'financial_events',
    'bank_effects', 'balance_checkpoints', 'audit_changes']
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

-- No UPDATE/DELETE/TRUNCATE/DDL grants, no public API, no Auth DDL or data seeds.
-- Checkpoints and audit are append-only for this role. Future mutations need a
-- separately reviewed migration + transactional business service (F1 onward).
