-- F3-03: RF-028 / CA-039. Adds owner-scoped schedules and history without backfill.
CREATE TABLE finance.contribution_plans (
  owner_id text NOT NULL,
  fund_id uuid NOT NULL,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  preferred_day smallint NOT NULL CHECK (preferred_day BETWEEN 1 AND 31),
  version integer NOT NULL CHECK (version > 0),
  next_on date,
  next_amount finance.exact_amount CHECK (next_amount > 0),
  PRIMARY KEY (owner_id, fund_id),
  FOREIGN KEY (owner_id, fund_id) REFERENCES finance.savings_funds(owner_id, id),
  CHECK ((next_on IS NULL) = (next_amount IS NULL))
);

CREATE TABLE finance.contribution_periods (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  fund_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  scheduled_on date NOT NULL,
  period integer GENERATED ALWAYS AS
    (extract(year FROM scheduled_on)::integer * 12 + extract(month FROM scheduled_on)::integer) STORED,
  status text NOT NULL CHECK (status IN ('missed_insufficient', 'missed_execution', 'completed', 'discarded')),
  reason text CHECK (reason IN ('insufficient', 'late', 'fund_limit')),
  reserve_command_id uuid,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, fund_id, period),
  UNIQUE (owner_id, reserve_command_id),
  FOREIGN KEY (owner_id, fund_id) REFERENCES finance.contribution_plans(owner_id, fund_id),
  FOREIGN KEY (owner_id, reserve_command_id) REFERENCES finance.fund_changes(owner_id, idempotency_key),
  CHECK ((status = 'completed') = (reserve_command_id IS NOT NULL)),
  CHECK ((status IN ('completed', 'discarded')) = (resolved_at IS NOT NULL)),
  CHECK (status <> 'missed_insufficient' OR reason IS NOT DISTINCT FROM 'insufficient'),
  CHECK (status <> 'missed_execution' OR coalesce(reason IN ('late', 'fund_limit'), false))
);

CREATE TABLE finance.contribution_changes (
  owner_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  fund_id uuid NOT NULL,
  period_id uuid,
  action text NOT NULL CHECK (action IN ('configure', 'pause', 'reactivate', 'complete', 'discard')),
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  FOREIGN KEY (owner_id, fund_id) REFERENCES finance.contribution_plans(owner_id, fund_id),
  FOREIGN KEY (owner_id, period_id) REFERENCES finance.contribution_periods(owner_id, id),
  CHECK ((action IN ('complete', 'discard')) = (period_id IS NOT NULL))
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['contribution_plans', 'contribution_periods', 'contribution_changes']
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

GRANT UPDATE (amount, preferred_day, version, next_on, next_amount)
  ON finance.contribution_plans TO finanzas_app;
GRANT UPDATE (status, reserve_command_id, resolved_at)
  ON finance.contribution_periods TO finanzas_app;

-- A fund paused from its catalog requires an explicit schedule reactivation.
CREATE FUNCTION finance.pause_contribution_plan() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $pause$
BEGIN
  WITH paused AS (
    UPDATE finance.contribution_plans
       SET next_on = NULL, next_amount = NULL, version = version + 1
     WHERE owner_id = NEW.owner_id AND fund_id = NEW.id AND next_on IS NOT NULL
     RETURNING amount, preferred_day
  )
  INSERT INTO finance.contribution_changes (owner_id, idempotency_key, command_hash, fund_id, action, configuration)
  SELECT NEW.owner_id, gen_random_uuid(), encode(sha256(convert_to(NEW.id::text || ':' || NEW.version::text, 'UTF8')), 'hex'),
         NEW.id, 'pause', jsonb_build_object('amount', amount::text, 'preferredDay', preferred_day, 'source', 'fund')
    FROM paused;
  RETURN NEW;
END
$pause$;
REVOKE EXECUTE ON FUNCTION finance.pause_contribution_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.pause_contribution_plan() TO finanzas_app;
CREATE TRIGGER pause_contribution_plan AFTER UPDATE OF status ON finance.savings_funds
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'active')
  EXECUTE FUNCTION finance.pause_contribution_plan();
