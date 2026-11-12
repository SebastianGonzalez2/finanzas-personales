-- F5-04: RF-043 / CA-057…058 (parte OpenCode). Filtros guardados por titular.
-- La numeración 0024 deja 0023 reservado para F5-03 (catálogo de nombres).
CREATE TABLE finance.saved_history_filters (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 100),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'object' AND criteria <> '{}'::jsonb),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, normalized_name)
);

CREATE INDEX saved_history_filters_owner ON finance.saved_history_filters(owner_id, normalized_name);

-- Libro de comandos con idempotencia por envío. Sin clave foránea a la tabla
-- de filtros: el borrado no debe romper el historial de comandos.
CREATE TABLE finance.saved_filter_changes (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  entry_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'rename', 'delete')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['saved_history_filters', 'saved_filter_changes']
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

GRANT INSERT (owner_id, id, name, normalized_name, criteria), UPDATE (name, normalized_name, version),
  DELETE ON finance.saved_history_filters TO finanzas_app;
GRANT INSERT (owner_id, idempotency_key, command_hash, entry_id, action, version)
  ON finance.saved_filter_changes TO finanzas_app;
