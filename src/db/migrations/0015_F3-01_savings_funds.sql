-- F3-01: RF-026/027; base de CA-038; I-03/I-12.
-- Ruta MIX: catálogo y estados de fondos. Las reservas, liberaciones,
-- traspasos y la validación de disponible (reserve_effects) quedan para Codex.
CREATE TABLE finance.savings_funds (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  currency finance.currency NOT NULL,
  reserved_amount finance.exact_amount NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  target_amount finance.exact_amount CHECK (target_amount > 0),
  target_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused_manual', 'paused_target_reached', 'closed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  CHECK (status <> 'paused_target_reached' OR target_amount IS NOT NULL),
  CHECK (status <> 'closed' OR reserved_amount = 0)
);
CREATE INDEX savings_funds_owner_name ON finance.savings_funds(owner_id, lower(name), id);

CREATE TABLE finance.fund_changes (
  owner_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  fund_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  action text NOT NULL CHECK (action IN ('create', 'update')),
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  UNIQUE (owner_id, fund_id, version),
  FOREIGN KEY (owner_id, fund_id) REFERENCES finance.savings_funds(owner_id, id)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['savings_funds', 'fund_changes']
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

-- reserved_amount is deliberately absent: only a later money migration may
-- grant it to the application role. Closing a fund without releasing money
-- is therefore impossible at the database boundary.
GRANT INSERT (owner_id, id, name, currency, status), UPDATE (name, status, updated_at, version)
  ON finance.savings_funds TO finanzas_app;
GRANT INSERT ON finance.fund_changes TO finanzas_app;
