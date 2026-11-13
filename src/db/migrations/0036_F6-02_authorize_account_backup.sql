-- The original snapshot stays private for restore_account, which authorizes
-- the session before reading the current revision inside its exclusive lock.
REVOKE EXECUTE ON FUNCTION finance.account_backup_snapshot() FROM finanzas_app;

CREATE FUNCTION finance.account_backup_snapshot(session_token text)
RETURNS TABLE (payload text, revision text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $authorized_snapshot$
DECLARE
  holder text := app_access.authorize_session(session_token);
BEGIN
  IF holder IS NULL OR holder IS DISTINCT FROM nullif(current_setting('finance.owner_id', true), '') THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.payload, s.revision FROM finance.account_backup_snapshot() s;
END
$authorized_snapshot$;

REVOKE ALL ON FUNCTION finance.account_backup_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.account_backup_snapshot(text) TO finanzas_app;
