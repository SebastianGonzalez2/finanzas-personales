-- F5-03: RF-041 / CA-054/055: catálogos privados de comercios y contactos con
-- coincidencia normalizada, archivado reversible y libro de cambios auditable.
-- La relación con movimientos históricos (referencias y fusión) se completa en
-- la parte de Codex; estas tablas no tocan importes ni efectos financieros.
CREATE TABLE finance.merchants (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 100),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, normalized_name)
);

CREATE TABLE finance.people (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 100),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, normalized_name)
);

CREATE INDEX merchants_owner_active ON finance.merchants(owner_id, normalized_name)
  WHERE archived_at IS NULL;
CREATE INDEX people_owner_active ON finance.people(owner_id, normalized_name)
  WHERE archived_at IS NULL;

-- Libro de comandos con idempotencia por envío. Sin FK a los catálogos: la
-- fusión manual de comercios (parte Codex) conserva trazabilidad aunque
-- elimine la fila del duplicado absorbido.
CREATE TABLE finance.name_catalog_changes (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('merchant', 'person')),
  entry_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'archive', 'restore', 'merge')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  UNIQUE (owner_id, kind, entry_id, version)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['merchants', 'people', 'name_catalog_changes']
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

GRANT INSERT (owner_id, id, name, normalized_name), UPDATE (archived_at, version)
  ON finance.merchants TO finanzas_app;
GRANT INSERT (owner_id, id, name, normalized_name), UPDATE (archived_at, version)
  ON finance.people TO finanzas_app;
GRANT INSERT (owner_id, idempotency_key, command_hash, kind, entry_id, action, version)
  ON finance.name_catalog_changes TO finanzas_app;
