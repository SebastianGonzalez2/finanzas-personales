-- F5-02: RF-040/042, CA-052/056. Classification has no financial effects.
CREATE TABLE finance.tags (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
  name_key text GENERATED ALWAYS AS (lower(name)) STORED,
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (owner_id,id),
  UNIQUE (owner_id,name_key)
);

CREATE TABLE finance.classification_changes (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  allocated_total finance.exact_amount CHECK (allocated_total > 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id,event_id,version),
  UNIQUE (owner_id,idempotency_key),
  FOREIGN KEY (owner_id,event_id) REFERENCES finance.financial_events(owner_id,id)
);

CREATE TABLE finance.movement_allocations (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 20),
  category_id uuid,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  PRIMARY KEY (owner_id,event_id,version,position),
  UNIQUE NULLS NOT DISTINCT (owner_id,event_id,version,category_id),
  FOREIGN KEY (owner_id,event_id,version) REFERENCES finance.classification_changes(owner_id,event_id,version),
  FOREIGN KEY (owner_id,category_id) REFERENCES finance.categories(owner_id,id)
);

CREATE TABLE finance.event_tags (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL,
  tag_id uuid NOT NULL,
  PRIMARY KEY (owner_id,event_id,version,tag_id),
  FOREIGN KEY (owner_id,event_id,version) REFERENCES finance.classification_changes(owner_id,event_id,version),
  FOREIGN KEY (owner_id,tag_id) REFERENCES finance.tags(owner_id,id)
);

CREATE INDEX event_tags_filter ON finance.event_tags (owner_id,tag_id,event_id,version);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['tags','classification_changes','movement_allocations','event_tags'] LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY owner_isolation ON finance.%I TO finanzas_app
      USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
      WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))', relation_name);
    EXECUTE format('GRANT SELECT, INSERT ON finance.%I TO finanzas_app', relation_name);
  END LOOP;
END
$policies$;

GRANT UPDATE (name,archived_at,version) ON finance.tags TO finanzas_app;

-- Validate the complete snapshot, including when a caller omits all its rows.
CREATE FUNCTION finance.check_classification_total() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, finance AS $body$
DECLARE expected numeric;
        allocated numeric;
BEGIN
  SELECT allocated_total INTO STRICT expected FROM finance.classification_changes
    WHERE (owner_id,event_id,version)=(NEW.owner_id,NEW.event_id,NEW.version);
  SELECT sum(amount) INTO allocated FROM finance.movement_allocations
    WHERE (owner_id,event_id,version)=(NEW.owner_id,NEW.event_id,NEW.version);
  IF allocated IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Classification allocations do not match their total' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$body$;
REVOKE ALL ON FUNCTION finance.check_classification_total() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER classification_total AFTER INSERT ON finance.classification_changes
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.check_classification_total();
CREATE CONSTRAINT TRIGGER allocation_total AFTER INSERT ON finance.movement_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.check_classification_total();

CREATE VIEW finance.current_classifications WITH (security_invoker = true) AS
  SELECT DISTINCT ON (owner_id,event_id) owner_id,event_id,version,allocated_total
    FROM finance.classification_changes ORDER BY owner_id,event_id,version DESC;

CREATE VIEW finance.current_movement_allocations WITH (security_invoker = true) AS
  SELECT a.* FROM finance.movement_allocations a
    JOIN finance.current_classifications c USING (owner_id,event_id,version);

CREATE VIEW finance.current_event_tags WITH (security_invoker = true) AS
  SELECT t.* FROM finance.event_tags t
    JOIN finance.current_classifications c USING (owner_id,event_id,version);

GRANT SELECT ON finance.current_classifications, finance.current_movement_allocations,
  finance.current_event_tags TO finanzas_app;

-- A classified purchase replaces its old attribution. Existing periodization,
-- shared purchases and mixed payment allocations come from the existing view.
ALTER VIEW finance.budget_expenses RENAME TO budget_expenses_base;
CREATE VIEW finance.budget_expenses WITH (security_invoker = true) AS
  SELECT b.* FROM finance.budget_expenses_base b
    WHERE NOT EXISTS (SELECT 1 FROM finance.current_classifications c
      WHERE (c.owner_id,c.event_id)=(b.owner_id,b.event_id) AND c.allocated_total IS NOT NULL)
  UNION ALL
  SELECT b.owner_id,b.event_id,b.currency,a.amount,a.category_id,b.effective_on,b.reference_on
    FROM (SELECT DISTINCT b.owner_id,b.event_id,b.currency,b.effective_on,b.reference_on
      FROM finance.budget_expenses_base b
      JOIN finance.current_classifications c USING (owner_id,event_id)
      WHERE c.allocated_total IS NOT NULL) b
    JOIN finance.current_movement_allocations a USING (owner_id,event_id);
GRANT SELECT ON finance.budget_expenses TO finanzas_app;
