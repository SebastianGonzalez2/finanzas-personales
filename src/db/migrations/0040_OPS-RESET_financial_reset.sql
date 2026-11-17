-- OPS-RESET, I-11/I-12. Reset the authenticated holder's finances in one
-- transaction. A revision prevents a retry from clearing data created later.
DO $owner$
BEGIN
  IF current_user <> (
    SELECT pg_get_userbyid(proowner) FROM pg_proc
    WHERE oid = 'finance.account_backup_snapshot()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Usar el mismo rol migrador que instaló las copias';
  END IF;

  -- A database owner may inherit finanzas_app even when FORCE RLS applies.
  -- Keep the runtime restriction and let only the existing scoped owner
  -- policy delete recorded positions during a whole-account purge.
  EXECUTE format(
    'ALTER POLICY keep_recorded_positions ON finance.card_currencies
     USING ((debt IS NULL AND credit_balance IS NULL) OR current_user = %L::name)',
    current_user
  );
END
$owner$;

CREATE FUNCTION finance.reset_own_finances(session_token text, expected_revision text)
RETURNS TABLE (status text, revision text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET TimeZone = 'UTC' SET DateStyle = 'ISO, YMD'
AS $reset$
DECLARE
  holder text := nullif(current_setting('finance.owner_id', true), '');
  portable_tables text[] := finance.account_backup_tables();
  purge text[] := ARRAY['finance.card_push_attempts', 'finance.card_push_subscriptions'];
  extras text[] := purge || ARRAY['finance_meta.account_restores'];
  target text;
  backup_revision text;
  extra_rows text;
  remaining boolean;
  position integer;
BEGIN
  status := 'denied';
  IF holder IS NULL THEN RETURN NEXT; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('finanzas:account:' || holder, 0));
  IF app_access.authorize_session(session_token) IS DISTINCT FROM holder THEN
    RETURN NEXT; RETURN;
  END IF;

  FOR position IN REVERSE cardinality(portable_tables)..1 LOOP
    purge := array_append(purge, format('finance.%I', portable_tables[position]));
  END LOOP;
  purge := array_append(purge, 'finance_meta.account_restores');
  IF (SELECT array_agg(n.nspname || '.' || c.relname ORDER BY n.nspname, c.relname)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname IN ('finance', 'finance_meta') AND c.relkind IN ('r', 'p', 'f', 'm')
          AND a.attname = 'owner_id' AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM (SELECT array_agg(name ORDER BY split_part(name, '.', 1), split_part(name, '.', 2))
        FROM unnest(purge) AS name)
  THEN
    RAISE EXCEPTION 'Inventario de reinicio desactualizado';
  END IF;

  -- Reuse the internal snapshot revision, without exporting any payload or
  -- requiring a backup file/signing key. Also cover device state and receipts.
  SELECT s.revision INTO STRICT backup_revision FROM finance.account_backup_snapshot() s;
  FOREACH target IN ARRAY extras LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C")::text, ''[]'')
      FROM %s AS t WHERE owner_id = $1', target::regclass) INTO extra_rows USING holder;
    backup_revision := encode(sha256(convert_to(backup_revision || ':' || extra_rows, 'UTF8')), 'hex');
  END LOOP;

  IF expected_revision IS NULL THEN
    status := 'ready'; revision := backup_revision; RETURN NEXT; RETURN;
  END IF;
  IF expected_revision IS DISTINCT FROM backup_revision THEN
    status := 'changed'; RETURN NEXT; RETURN;
  END IF;

  -- Hold ordinary write locks while checking the delete dependencies. Other
  -- holders can keep reading and writing under their separate account locks.
  EXECUTE format('LOCK TABLE %s IN ROW EXCLUSIVE MODE', array_to_string(purge, ', '));
  IF EXISTS (
    WITH targets AS (
      SELECT name::regclass AS oid, ord FROM unnest(purge) WITH ORDINALITY AS t(name, ord)
    )
    SELECT 1 FROM targets t JOIN pg_class c ON c.oid = t.oid
      WHERE c.relkind <> 'r' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
        OR EXISTS (SELECT 1 FROM pg_inherits i WHERE t.oid IN (i.inhrelid, i.inhparent))
        OR EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t.oid
          AND NOT g.tgisinternal AND (g.tgtype & 8) <> 0)
        OR EXISTS (SELECT 1 FROM pg_rewrite r WHERE r.ev_class = t.oid)
    UNION ALL
    SELECT 1 FROM pg_constraint f JOIN targets parent ON f.confrelid = parent.oid
      LEFT JOIN targets child ON f.conrelid = child.oid
      WHERE f.contype = 'f' AND (child.oid IS NULL OR child.ord > parent.ord OR f.confdeltype <> 'a'
        OR NOT EXISTS (
          SELECT 1 FROM unnest(f.conkey, f.confkey) AS pair(source, destination)
          JOIN pg_attribute a ON a.attrelid = child.oid AND a.attnum = pair.source
          JOIN pg_attribute b ON b.attrelid = parent.oid AND b.attnum = pair.destination
          WHERE a.attname = 'owner_id' AND b.attname = 'owner_id'
        ))
  ) THEN
    RAISE EXCEPTION 'Dependencia de reinicio incompatible';
  END IF;

  FOREACH target IN ARRAY purge LOOP
    EXECUTE format('DELETE FROM %s WHERE owner_id = $1', target::regclass) USING holder;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  FOREACH target IN ARRAY purge LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE owner_id = $1)', target::regclass)
      INTO remaining USING holder;
    IF remaining THEN RAISE EXCEPTION 'Quedaron filas financieras del titular'; END IF;
  END LOOP;

  status := 'reset'; RETURN NEXT;
END
$reset$;

REVOKE ALL ON FUNCTION finance.reset_own_finances(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.reset_own_finances(text, text) TO finanzas_app;
