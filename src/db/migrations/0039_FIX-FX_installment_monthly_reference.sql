-- FIX-FX: the first version fixes the policy for the lifetime of each plan.
-- Existing rows and writers that predate this policy retain the old behavior.
ALTER TABLE finance.installment_plans ADD COLUMN monthly_fx boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION finance.capture_installment_budget_rates() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, finance AS $body$
DECLARE registration_day date;
BEGIN
  IF NEW.version = 1 AND NOT NEW.monthly_fx THEN
    SELECT (created_at AT TIME ZONE 'America/Montevideo')::date INTO STRICT registration_day
      FROM finance.financial_events WHERE (owner_id,id)=(NEW.owner_id,NEW.event_id);
    INSERT INTO finance.budget_rates
      (owner_id,event_id,from_currency,to_currency,quote_id,reference_on)
    SELECT NEW.owner_id, NEW.event_id, NEW.currency, q.to_currency, q.id,
           registration_day
      FROM (SELECT DISTINCT ON (to_currency) id, to_currency
              FROM finance.budget_quotes
             WHERE owner_id = NEW.owner_id AND from_currency = NEW.currency
               AND effective_on <= registration_day
             ORDER BY to_currency, effective_on DESC, recorded_at DESC, id DESC) q
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END
$body$;

CREATE OR REPLACE VIEW finance.budget_expenses_base WITH (security_invoker = true) AS
  SELECT f.owner_id, f.id AS event_id, e.currency, -e.amount_signed AS amount,
         m.category_id, f.effective_on, f.effective_on AS reference_on,
         false AS monthly_fx
    FROM finance.financial_events f
    JOIN finance.ordinary_movements m ON (m.owner_id,m.event_id) = (f.owner_id,f.id)
    JOIN finance.bank_effects e ON (e.owner_id,e.event_id) = (f.owner_id,f.id)
   WHERE f.kind = 'expense' AND f.status = 'confirmed'
     AND NOT EXISTS (SELECT 1 FROM finance.shared_expenses s
       WHERE (s.owner_id,s.event_id) = (f.owner_id,f.id))
  UNION ALL
  SELECT s.owner_id, s.event_id, s.currency, s.own_amount, s.category_id,
         f.effective_on, f.effective_on, false
    FROM finance.current_shared_expenses s
    JOIN finance.financial_events f ON (f.owner_id,f.id) = (s.owner_id,s.event_id)
   WHERE s.method <> 'credit' AND f.status = 'confirmed' AND s.own_amount > 0
  UNION ALL
  SELECT x.owner_id, x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN x.installment_ordinal IS NULL THEN x.effective_on
              WHEN p.monthly_fx THEN x.effective_on
              ELSE (f.created_at AT TIME ZONE 'America/Montevideo')::date END,
         x.installment_ordinal IS NOT NULL AND coalesce(p.monthly_fx, false)
    FROM finance.credit_consumption x
    JOIN finance.financial_events f ON (f.owner_id,f.id) = (x.owner_id,x.id)
    LEFT JOIN finance.installment_plans p ON (p.owner_id,p.event_id,p.version) = (x.owner_id,x.id,1)
      AND x.installment_ordinal IS NOT NULL
   WHERE x.amount > 0 AND NOT EXISTS (SELECT 1 FROM finance.mixed_purchases m
     WHERE (m.owner_id,m.event_id) = (x.owner_id,x.id))
  UNION ALL
  SELECT x.owner_id, x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN x.installment_ordinal IS NULL THEN x.effective_on
              WHEN p.monthly_fx THEN x.effective_on
              ELSE (f.created_at AT TIME ZONE 'America/Montevideo')::date END,
         x.installment_ordinal IS NOT NULL AND coalesce(p.monthly_fx, false)
    FROM finance.mixed_purchase_expenses x
    JOIN finance.financial_events f ON (f.owner_id,f.id) = (x.owner_id,x.id)
    LEFT JOIN finance.installment_plans p ON (p.owner_id,p.event_id,p.version) = (x.owner_id,x.id,1)
      AND x.installment_ordinal IS NOT NULL;

CREATE OR REPLACE VIEW finance.budget_expenses WITH (security_invoker = true) AS
  SELECT b.* FROM finance.budget_expenses_base b
    WHERE NOT EXISTS (SELECT 1 FROM finance.current_classifications c
      WHERE (c.owner_id,c.event_id)=(b.owner_id,b.event_id) AND c.allocated_total IS NOT NULL)
  UNION ALL
  SELECT b.owner_id,b.event_id,b.currency,a.amount,a.category_id,b.effective_on,b.reference_on,b.monthly_fx
    FROM (SELECT DISTINCT b.owner_id,b.event_id,b.currency,b.effective_on,b.reference_on,b.monthly_fx
      FROM finance.budget_expenses_base b
      JOIN finance.current_classifications c USING (owner_id,event_id)
      WHERE c.allocated_total IS NOT NULL) b
    JOIN finance.current_movement_allocations a USING (owner_id,event_id);

-- The existing backup inventory includes installment_plans and fx_valuations.
UPDATE finance_meta.account_backup_layout SET layout = finance.account_backup_layout();
