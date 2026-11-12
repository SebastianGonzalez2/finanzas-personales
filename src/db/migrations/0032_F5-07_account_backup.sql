-- RF-048/049, CA-062/063. Normal runtime retains its existing table grants.
-- The migration owner can replace this fixed financial domain through a
-- scoped function. Auth, allowlist and restore receipts stay outside copies.
CREATE FUNCTION finance.account_backup_tables() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'user_preferences', 'categories', 'financial_events', 'balance_checkpoints',
    'bank_effects', 'audit_changes', 'ordinary_movements', 'balance_adjustments',
    'cards', 'card_currencies', 'card_changes', 'credit_operations',
    'credit_lines', 'credit_allocations', 'installment_plans', 'card_cycle_changes',
    'mixed_purchases', 'mixed_purchase_categories', 'shared_expenses',
    'shared_expense_details', 'loans', 'loan_operations', 'purchase_refunds', 'refund_parts',
    'refund_installments', 'card_credit_changes', 'savings_funds', 'fund_changes',
    'reserve_effects', 'contribution_plans', 'contribution_periods',
    'contribution_changes', 'fund_event_allocations', 'fund_payment_allocations',
    'budget_limits', 'budget_changes', 'budget_quotes', 'budget_rates',
    'budget_notices', 'recurring_series'
  ]
$$;
-- Quotes are inserted after installment plans so the existing rate-capture
-- trigger sees no quotes during replay. Historical rates are restored verbatim.
REVOKE ALL ON FUNCTION finance.account_backup_tables() FROM PUBLIC;

CREATE TABLE finance_meta.account_restores (
  owner_id text NOT NULL,
  id uuid NOT NULL,
  backup_sha256 text NOT NULL CHECK (backup_sha256 ~ '^[a-f0-9]{64}$'),
  restored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, id)
);
ALTER TABLE finance_meta.account_restores ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_meta.account_restores FORCE ROW LEVEL SECURITY;

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY finance.account_backup_tables() LOOP
    EXECUTE format('CREATE POLICY account_backup_owner ON finance.%I TO %I
      USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
      WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))',
      relation_name, current_user);
  END LOOP;
  EXECUTE format('CREATE POLICY account_backup_owner ON finance_meta.account_restores TO %I
    USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
    WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))',
    current_user);
END
$policies$;

CREATE FUNCTION finance.account_backup_layout() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_object_agg(c.relname, jsonb_build_object('columns', (
    SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid, a.atttypmod),
      a.attgenerated, a.attnotnull, a.attidentity) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  ), 'constraints', (
    SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname)
      FROM pg_constraint k WHERE k.conrelid = c.oid
  )))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'finance' AND c.relkind IN ('r', 'p')
$$;
REVOKE ALL ON FUNCTION finance.account_backup_layout() FROM PUBLIC;

CREATE TABLE finance_meta.account_backup_layout AS SELECT finance.account_backup_layout() AS layout;

-- A single STABLE call reads one MVCC snapshot. JSON stays in PostgreSQL
-- until serialization to text so monetary values never pass through doubles.
CREATE FUNCTION finance.account_backup_snapshot()
RETURNS TABLE (payload text, revision text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET TimeZone = 'UTC' SET DateStyle = 'ISO, YMD'
AS $snapshot$
DECLARE
  holder text := nullif(current_setting('finance.owner_id', true), '');
  layout jsonb := finance.account_backup_layout();
  relation_name text;
  records jsonb;
  tables jsonb := '{}'::jsonb;
  last_restore uuid;
BEGIN
  IF holder IS NULL
     OR layout IS DISTINCT FROM (SELECT l.layout FROM finance_meta.account_backup_layout l)
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(layout) k)
        IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(finance.account_backup_tables()) k)
  THEN
    RAISE EXCEPTION 'Esquema financiero no compatible con esta versión de copia';
  END IF;
  FOREACH relation_name IN ARRAY finance.account_backup_tables() LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(j ORDER BY j::text COLLATE "C"), ''[]''::jsonb)
      FROM (SELECT to_jsonb(t) - ''owner_id'' AS j FROM finance.%I t WHERE owner_id = $1) rows',
      relation_name) INTO records USING holder;
    tables := tables || jsonb_build_object(relation_name, records);
  END LOOP;
  payload := jsonb_build_object('schema', encode(sha256(convert_to(layout::text, 'UTF8')), 'hex'),
    'tables', tables)::text;
  SELECT r.id INTO last_restore FROM finance_meta.account_restores r WHERE r.owner_id = holder
    ORDER BY r.restored_at DESC, r.id DESC LIMIT 1;
  revision := encode(sha256(convert_to(coalesce(last_restore::text, '') || ':' || payload, 'UTF8')), 'hex');
  RETURN NEXT;
END
$snapshot$;
REVOKE ALL ON FUNCTION finance.account_backup_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.account_backup_snapshot() TO finanzas_app;

-- Only the server calls this after authenticating the signed file and verifying
-- explicit confirmation. The elevated entry point checks the live DB session
-- again and never accepts an owner or relation name from the upload.
CREATE FUNCTION finance.restore_account(
  session_token text, input jsonb, expected_revision text, operation_id uuid, backup_sha256 text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET TimeZone = 'UTC' SET DateStyle = 'ISO, YMD'
AS $restore$
DECLARE
  holder text := app_access.authorize_session(session_token);
  table_names text[] := finance.account_backup_tables();
  relation_name text;
  columns text;
  current_revision text;
  schema_fingerprint text;
  position int;
BEGIN
  IF holder IS NULL OR holder IS DISTINCT FROM nullif(current_setting('finance.owner_id', true), '') THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('finanzas:account:' || holder, 0));

  IF EXISTS (SELECT 1 FROM finance_meta.account_restores r WHERE r.owner_id = holder AND r.id = operation_id) THEN
    RETURN 'restored';
  END IF;
  SELECT s.revision, (s.payload::jsonb)->>'schema' INTO STRICT current_revision, schema_fingerprint
    FROM finance.account_backup_snapshot() s;
  IF expected_revision IS DISTINCT FROM current_revision THEN RETURN 'changed'; END IF;
  IF input->>'schema' IS DISTINCT FROM schema_fingerprint
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(input->'tables') k)
        IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(table_names) k)
  THEN
    RETURN 'incompatible';
  END IF;
  FOREACH relation_name IN ARRAY table_names LOOP
    IF jsonb_typeof(input->'tables'->relation_name) IS DISTINCT FROM 'array' THEN RETURN 'incompatible'; END IF;
  END LOOP;

  FOR position IN REVERSE cardinality(table_names)..1 LOOP
    EXECUTE format('DELETE FROM finance.%I WHERE owner_id = $1', table_names[position]) USING holder;
  END LOOP;
  FOREACH relation_name IN ARRAY table_names LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO STRICT columns
      FROM pg_attribute a WHERE a.attrelid = format('finance.%I', relation_name)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attname <> 'owner_id';
    EXECUTE format('INSERT INTO finance.%1$I (owner_id, %2$s)
      SELECT $1, %2$s FROM jsonb_populate_recordset(NULL::finance.%1$I, $2)', relation_name, columns)
      USING holder, input->'tables'->relation_name;
  END LOOP;
  INSERT INTO finance_meta.account_restores(owner_id, id, backup_sha256)
    VALUES (holder, operation_id, backup_sha256);
  RETURN 'restored';
EXCEPTION
  -- PostgreSQL rolls back the function's block before handling this error.
  -- Constraint details can contain private fields from the supplied archive.
  WHEN integrity_constraint_violation OR data_exception THEN RETURN 'incompatible';
END
$restore$;
REVOKE ALL ON FUNCTION finance.restore_account(text, jsonb, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.restore_account(text, jsonb, text, uuid, text) TO finanzas_app;
