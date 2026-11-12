-- RF-049, I-11/I-12. Use the same owner scope and dependency order as
-- account restore. Device subscriptions are excluded from portable backups.
DO $policy$
BEGIN
  -- The backup installer owns the scoped RLS policies used by this purge.
  IF current_user <> (
    SELECT pg_get_userbyid(proowner) FROM pg_proc
    WHERE oid = 'finance.account_backup_snapshot()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Usar el mismo rol migrador que instaló las copias';
  END IF;
  EXECUTE format('CREATE POLICY account_delete_owner ON finance.card_push_subscriptions TO %I
    USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))',
    current_user);
END
$policy$;

CREATE FUNCTION finance.delete_own_account(session_token text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $delete$
DECLARE
  holder text := nullif(current_setting('finance.owner_id', true), '');
  table_names text[] := finance.account_backup_tables();
  position integer;
BEGIN
  IF holder IS NULL THEN RETURN 'denied'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('finanzas:account:' || holder, 0));
  IF app_access.authorize_session(session_token) IS DISTINCT FROM holder THEN
    RETURN 'denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app_auth.session s
    WHERE s.token = session_token AND s."userId" = holder
      AND s."createdAt" BETWEEN clock_timestamp() - interval '10 minutes' AND clock_timestamp()
  ) THEN
    RETURN 'stale';
  END IF;

  -- Refuse a partial purge if a later migration adds another owner table.
  IF (SELECT array_agg(n.nspname || '.' || c.relname ORDER BY n.nspname, c.relname)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname IN ('finance', 'finance_meta') AND c.relkind IN ('r', 'p')
          AND a.attname = 'owner_id' AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM
     (SELECT array_agg(nsp || '.' || rel ORDER BY nsp, rel)
        FROM (
          SELECT 'finance' AS nsp, unnest(table_names || ARRAY[
            'card_push_attempts', 'card_push_subscriptions'
          ]) AS rel
          UNION ALL SELECT 'finance_meta', 'account_restores'
        ) AS expected)
  THEN
    RAISE EXCEPTION 'Inventario de borrado desactualizado';
  END IF;

  -- Fail and roll back on a concurrent change of the identity instead of
  -- waiting for an OAuth user update that may already hold the user row.
  PERFORM 1 FROM app_access.allowlist WHERE user_id = holder FOR UPDATE NOWAIT;
  PERFORM 1 FROM app_auth."user" WHERE id = holder FOR UPDATE NOWAIT;

  DELETE FROM finance.card_push_attempts WHERE owner_id = holder;
  DELETE FROM finance.card_push_subscriptions WHERE owner_id = holder;
  FOR position IN REVERSE cardinality(table_names)..1 LOOP
    EXECUTE format('DELETE FROM finance.%I WHERE owner_id = $1', table_names[position]) USING holder;
  END LOOP;
  DELETE FROM finance_meta.account_restores WHERE owner_id = holder;

  -- Keep the existing immutable administrative binding. Its revoke trigger
  -- closes sessions, and the identity's FK cascades also remove OAuth linkage.
  UPDATE app_access.allowlist SET enabled = false WHERE user_id = holder AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'Autorización no disponible'; END IF;
  DELETE FROM app_auth."user" WHERE id = holder;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identidad no disponible'; END IF;
  RETURN 'deleted';
END
$delete$;
REVOKE ALL ON FUNCTION finance.delete_own_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.delete_own_account(text) TO finanzas_app;

-- Recheck authorization under the shared account lock, including before push.
CREATE FUNCTION finance.cron_owner_is_active() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $cron$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app_access.allowlist l
    JOIN app_auth."user" u ON u.id = l.user_id
    WHERE l.user_id = nullif(current_setting('finance.owner_id', true), '')
      AND l.enabled
    FOR SHARE OF l
  );
END
$cron$;
REVOKE ALL ON FUNCTION finance.cron_owner_is_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.cron_owner_is_active() TO finanzas_app;
