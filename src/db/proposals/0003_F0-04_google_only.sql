-- PROPOSAL ONLY. F0-04 v9.49, ADR 0004, RF-001..004, CA-001..005, I-12.
-- Caller owns BEGIN/COMMIT. Only after exact SQL/hash approval, development/neondb.
-- Additive: never writes neon_auth, admission, finance or finance_meta data.
CREATE ROLE finanzas_google_auth LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE finanzas_google_finance LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT finanzas_app TO finanzas_google_finance;
CREATE SCHEMA app_auth;
CREATE SCHEMA app_access;
CREATE SCHEMA app_auth_meta;
REVOKE ALL ON SCHEMA app_auth,app_access,app_auth_meta FROM PUBLIC;
CREATE TABLE app_auth_meta.migrations(version text PRIMARY KEY,sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE app_access.allowlist(
  email text PRIMARY KEY CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254 AND strpos(email,'@')>1),
  enabled boolean NOT NULL DEFAULT true,
  google_sub text UNIQUE CHECK(length(google_sub) BETWEEN 1 AND 255),
  user_id text UNIQUE CHECK(length(user_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((google_sub IS NULL)=(user_id IS NULL))
);
-- Binding survives account deletion. Never silently reuse or transfer a titular.
CREATE TABLE app_access.audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,action text NOT NULL CHECK(action IN ('add','bind','enable','revoke')),
  actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_auth."user"(
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,email text NOT NULL UNIQUE,"emailVerified" boolean NOT NULL,
  image text,"googleSubject" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),"updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_auth.account(
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" text NOT NULL,"providerId" text NOT NULL CHECK("providerId"='google'),
  "userId" text NOT NULL UNIQUE REFERENCES app_auth."user"(id) ON DELETE CASCADE,
  "accessToken" text CHECK("accessToken" IS NULL),"refreshToken" text CHECK("refreshToken" IS NULL),"idToken" text CHECK("idToken" IS NULL),
  "accessTokenExpiresAt" timestamptz,"refreshTokenExpiresAt" timestamptz,scope text,password text CHECK(password IS NULL),
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),"updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE("providerId","accountId")
);
CREATE TABLE app_auth.session(
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,token text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES app_auth."user"(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),"updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "ipAddress" text,"userAgent" text
);
CREATE INDEX session_user ON app_auth.session("userId");
CREATE TABLE app_auth.verification(
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,identifier text NOT NULL,value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),"updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX verification_identifier ON app_auth.verification(identifier);
CREATE TABLE app_auth."rateLimit"(
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,key text NOT NULL UNIQUE,count integer NOT NULL,"lastRequest" bigint NOT NULL
);
CREATE FUNCTION app_access.allowlist_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE action_name text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Revoke instead of deleting an authorization'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.google_sub IS NOT NULL AND (NEW.google_sub IS DISTINCT FROM OLD.google_sub OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.email IS DISTINCT FROM OLD.email) THEN
      RAISE EXCEPTION 'Identity binding is immutable; explicit reviewed migration required';
    END IF;
    NEW.updated_at=clock_timestamp();
    IF OLD.enabled AND NOT NEW.enabled THEN action_name='revoke';
    ELSIF NOT OLD.enabled AND NEW.enabled THEN action_name='enable';
    ELSIF OLD.google_sub IS NULL AND NEW.google_sub IS NOT NULL THEN action_name='bind';
    END IF;
  ELSE action_name='add'; END IF;
  IF action_name IS NOT NULL THEN
    INSERT INTO app_access.audit(email,action,actor) VALUES(NEW.email,action_name,session_user);
  END IF;
  IF NOT NEW.enabled AND NEW.user_id IS NOT NULL THEN
    DELETE FROM app_auth.session WHERE "userId"=NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER allowlist_change BEFORE INSERT OR UPDATE OR DELETE ON app_access.allowlist FOR EACH ROW EXECUTE FUNCTION app_access.allowlist_change();
CREATE FUNCTION app_access.guard_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authorization app_access.allowlist%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email OR NEW."googleSubject" IS DISTINCT FROM OLD."googleSubject" OR NEW."emailVerified" IS DISTINCT FROM OLD."emailVerified") THEN
    RAISE EXCEPTION 'Identity binding is immutable';
  END IF;
  SELECT * INTO authorization FROM app_access.allowlist WHERE email=NEW.email FOR UPDATE;
  IF NOT FOUND OR NOT authorization.enabled OR NOT NEW."emailVerified" OR NEW."googleSubject" IS NULL OR
    (authorization.google_sub IS NOT NULL AND (authorization.google_sub<>NEW."googleSubject" OR authorization.user_id<>NEW.id)) THEN
    RAISE EXCEPTION 'Identity not authorized';
  END IF;
  IF authorization.google_sub IS NULL THEN
    UPDATE app_access.allowlist SET google_sub=NEW."googleSubject",user_id=NEW.id WHERE email=NEW.email;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_user BEFORE INSERT OR UPDATE ON app_auth."user" FOR EACH ROW EXECUTE FUNCTION app_access.guard_user();
CREATE FUNCTION app_access.guard_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."accountId" IS DISTINCT FROM OLD."accountId" OR NEW."providerId" IS DISTINCT FROM OLD."providerId") THEN RAISE EXCEPTION 'Account binding is immutable'; END IF;
  PERFORM 1 FROM app_auth."user" u JOIN app_access.allowlist l ON l.user_id=u.id AND l.email=u.email AND l.google_sub=u."googleSubject"
    WHERE u.id=NEW."userId" AND NEW."providerId"='google' AND NEW."accountId"=u."googleSubject" AND l.enabled AND u."emailVerified" FOR SHARE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not authorized'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_account BEFORE INSERT OR UPDATE ON app_auth.account FOR EACH ROW EXECUTE FUNCTION app_access.guard_account();
CREATE FUNCTION app_access.guard_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW.token IS DISTINCT FROM OLD.token) THEN RAISE EXCEPTION 'Session binding is immutable'; END IF;
  PERFORM 1 FROM app_auth."user" u JOIN app_auth.account a ON a."userId"=u.id AND a."providerId"='google' AND a."accountId"=u."googleSubject"
    JOIN app_access.allowlist l ON l.user_id=u.id AND l.google_sub=a."accountId" AND l.email=u.email
    WHERE u.id=NEW."userId" AND u."emailVerified" AND l.enabled FOR SHARE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not authorized'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_session BEFORE INSERT OR UPDATE ON app_auth.session FOR EACH ROW EXECUTE FUNCTION app_access.guard_session();
-- Lock session and authorization to the end of the financial transaction.
-- Revocation/logout wait for earlier transactions; all later requests are denied.
CREATE FUNCTION app_access.authorize_session(p_token text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id text;
BEGIN
  SELECT u.id INTO owner_id FROM app_auth.session s JOIN app_auth."user" u ON u.id=s."userId"
    JOIN app_auth.account a ON a."userId"=u.id AND a."providerId"='google' AND a."accountId"=u."googleSubject"
    JOIN app_access.allowlist l ON l.user_id=u.id AND l.google_sub=a."accountId" AND l.email=u.email
    WHERE s.token=p_token AND s."expiresAt">clock_timestamp() AND l.enabled AND u."emailVerified"
    FOR SHARE OF l;
  IF owner_id IS NULL THEN RETURN NULL; END IF;
  -- Same lock order as revocation: allowlist, then session. Avoid deadlocks.
  PERFORM 1 FROM app_auth.session s WHERE s.token=p_token AND s."userId"=owner_id
    AND s."expiresAt">clock_timestamp() FOR SHARE OF s;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN owner_id;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_access FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app_auth,app_access,app_auth_meta FROM PUBLIC;
GRANT USAGE ON SCHEMA app_auth,app_access TO finanzas_google_auth;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app_auth TO finanzas_google_auth;
GRANT SELECT ON app_access.allowlist TO finanzas_google_auth;
GRANT USAGE ON SCHEMA app_access TO finanzas_app;
GRANT EXECUTE ON FUNCTION app_access.authorize_session(text) TO finanzas_app;
-- Both new LOGIN roles have NO password initially. Provision separately only
-- after authorization, via private local files; never owner credentials in app.
