-- F2-01: RF-014 / configuración RF-017; base de CA-020; I-02/11/12.
CREATE TABLE finance.cards (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('debit', 'credit')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  issuer text CHECK (length(btrim(issuer)) BETWEEN 1 AND 100),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, id, kind)
);

CREATE TABLE finance.card_currencies (
  owner_id text NOT NULL,
  card_id uuid NOT NULL,
  kind text NOT NULL,
  currency finance.currency NOT NULL,
  credit_limit finance.exact_amount CHECK (credit_limit > 0),
  debt finance.exact_amount CHECK (debt >= 0),
  credit_balance finance.exact_amount CHECK (credit_balance >= 0),
  PRIMARY KEY (owner_id, card_id, currency),
  FOREIGN KEY (owner_id, card_id, kind) REFERENCES finance.cards(owner_id, id, kind),
  CHECK (kind = 'credit' OR (credit_limit IS NULL AND debt IS NULL AND credit_balance IS NULL))
);

CREATE TABLE finance.card_changes (
  owner_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  card_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  action text NOT NULL CHECK (action IN ('create', 'update', 'archive')),
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  UNIQUE (owner_id, card_id, version),
  FOREIGN KEY (owner_id, card_id) REFERENCES finance.cards(owner_id, id)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['cards', 'card_currencies', 'card_changes']
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

GRANT INSERT (owner_id, id, kind, name, issuer), UPDATE (name, issuer, archived_at, version)
  ON finance.cards TO finanzas_app;
GRANT INSERT (owner_id, card_id, kind, currency, credit_limit), UPDATE (credit_limit), DELETE
  ON finance.card_currencies TO finanzas_app;
CREATE POLICY keep_recorded_positions ON finance.card_currencies AS RESTRICTIVE
  FOR DELETE TO finanzas_app USING (debt IS NULL AND credit_balance IS NULL);
GRANT INSERT ON finance.card_changes TO finanzas_app;
