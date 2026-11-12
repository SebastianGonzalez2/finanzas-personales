-- F5-03: RF-041 / CA-053…055. Catálogos y referencias de titular.
CREATE TABLE finance.merchants (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 100),
  archived_at timestamptz,
  merged_into uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, normalized_name),
  FOREIGN KEY (owner_id, merged_into) REFERENCES finance.merchants(owner_id, id),
  CHECK (merged_into IS NULL OR (merged_into <> id AND archived_at IS NOT NULL))
);

CREATE INDEX merchants_owner_active ON finance.merchants(owner_id, normalized_name)
  WHERE archived_at IS NULL;
CREATE INDEX people_owner_active ON finance.people(owner_id, normalized_name)
  WHERE archived_at IS NULL;

CREATE INDEX merchants_owner_merged_into ON finance.merchants(owner_id, merged_into)
  WHERE merged_into IS NOT NULL;

-- Los vínculos originales se conservan. La vista resuelve cada alias en un
-- único comercio canónico; las fusiones encadenadas actualizan los alias.
CREATE TABLE finance.event_merchants (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  merchant_id uuid NOT NULL,
  PRIMARY KEY (owner_id, event_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, merchant_id) REFERENCES finance.merchants(owner_id, id)
);
CREATE INDEX event_merchants_by_merchant ON finance.event_merchants(owner_id, merchant_id);

CREATE TABLE finance.loan_people (
  owner_id text NOT NULL,
  loan_id uuid NOT NULL,
  person_id uuid NOT NULL,
  PRIMARY KEY (owner_id, loan_id),
  FOREIGN KEY (owner_id, loan_id) REFERENCES finance.loans(owner_id, id),
  FOREIGN KEY (owner_id, person_id) REFERENCES finance.people(owner_id, id)
);

-- Libro de comandos con idempotencia por envío.
CREATE TABLE finance.name_catalog_changes (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('merchant', 'person')),
  entry_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'archive', 'restore', 'merge')),
  version integer NOT NULL CHECK (version > 0),
  merged_source_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  CHECK ((action = 'merge') = (merged_source_id IS NOT NULL)),
  CHECK (action <> 'merge' OR (kind = 'merchant' AND merged_source_id <> entry_id)),
  FOREIGN KEY (owner_id, merged_source_id) REFERENCES finance.merchants(owner_id, id)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['merchants', 'name_catalog_changes', 'event_merchants', 'loan_people']
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

GRANT INSERT (owner_id, id, name, normalized_name), UPDATE (archived_at, version, merged_into)
  ON finance.merchants TO finanzas_app;
GRANT UPDATE (archived_at, version) ON finance.people TO finanzas_app;
GRANT INSERT (owner_id, idempotency_key, command_hash, kind, entry_id, action, version, merged_source_id)
  ON finance.name_catalog_changes TO finanzas_app;
GRANT INSERT ON finance.event_merchants, finance.loan_people TO finanzas_app;

CREATE VIEW finance.canonical_event_merchants WITH (security_invoker = true) AS
SELECT e.owner_id, e.event_id, coalesce(m.merged_into, m.id) AS merchant_id
  FROM finance.event_merchants e
  JOIN finance.merchants m ON (m.owner_id, m.id) = (e.owner_id, e.merchant_id);
GRANT SELECT ON finance.canonical_event_merchants TO finanzas_app;
