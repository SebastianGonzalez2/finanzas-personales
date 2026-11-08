-- PROPOSAL ONLY. Not loaded by the F0-05 migrator. Requires explicit approval.
-- Target: dry-voice-45959315 / development / br-late-feather-b6czfkx0 / neondb.
-- RF-001..004, CA-001..005, I-12. No changes to neon_auth or finance data.
BEGIN;
DO $target$
BEGIN
  IF current_setting('neon.branch_id', true) IS DISTINCT FROM 'br-late-feather-b6czfkx0'
     OR current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Unapproved target';
  END IF;
END
$target$;
SELECT pg_advisory_xact_lock(704004);
CREATE ROLE finanzas_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE finanzas_admission LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
-- Passwords are deliberately absent; provision privately after SQL approval.
GRANT finanzas_app TO finanzas_runtime;
GRANT CONNECT ON DATABASE neondb TO finanzas_runtime, finanzas_admission;
CREATE SCHEMA admission;
REVOKE ALL ON SCHEMA admission FROM PUBLIC;
CREATE TABLE admission.schema_version (
  version text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$')
);
INSERT INTO admission.schema_version VALUES ('0002_F0-04_admission.sql', current_setting('admission.migration_sha256'));
CREATE TABLE admission.policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  code_hash text CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admission.policy(singleton) VALUES (true); -- initially revoked
CREATE TABLE admission.attempt_buckets (
  scope text NOT NULL CHECK (scope IN ('global', 'email')),
  subject_hash text NOT NULL CHECK (length(subject_hash) <= 64),
  window_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (scope, subject_hash)
);
CREATE TABLE admission.grants (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  email_hash text NOT NULL CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK (provider IN ('credential','google')),
  generation bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_event text UNIQUE
);
CREATE TABLE admission.decisions (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 200),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  allowed boolean NOT NULL,
  generation bigint NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE admission.owners (
  owner_id text PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 200),
  email_hash text NOT NULL CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK (provider IN ('credential','google')),
  event_id text NOT NULL UNIQUE REFERENCES admission.decisions(event_id),
  admitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admission.policy_audit (
  generation bigint PRIMARY KEY,
  enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA admission TO finanzas_runtime, finanzas_admission;
GRANT SELECT ON admission.policy TO finanzas_admission;
-- FOR SHARE needs UPDATE privilege on at least one column; use an advisory lock
-- shared by the application and the administrative rotation instead.
GRANT SELECT, INSERT, UPDATE ON admission.attempt_buckets, admission.grants TO finanzas_admission;
GRANT SELECT, INSERT ON admission.decisions, admission.owners TO finanzas_admission;
CREATE FUNCTION admission.is_admitted(subject text, email_digest text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (SELECT 1 FROM admission.owners
    WHERE owner_id = subject AND email_hash = email_digest)
$function$;
REVOKE ALL ON FUNCTION admission.is_admitted(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admission.is_admitted(text, text) TO finanzas_runtime;
-- No grants to PUBLIC, finanzas_app, neon_auth or finance_meta.
-- LOGIN roles own no objects and cannot RESET ROLE to neondb_owner.
COMMIT;
