-- SIMP-02: gastos sin saldo bancario y compras en cuotas sin tarjeta.
-- No borra datos. Los planes de tarjeta heredados conservan su cálculo.

-- Un gasto puede registrarse sin indicar un medio bancario.
ALTER TABLE finance.ordinary_movements DROP CONSTRAINT ordinary_movements_method_check;
ALTER TABLE finance.ordinary_movements ADD CONSTRAINT ordinary_movements_method_check
  CHECK (method IN ('deposit', 'debit', 'transfer', 'unspecified'));

-- Un plan de cuotas pertenece a una compra con tarjeta heredada o a un gasto.
ALTER TABLE finance.installment_plans
  DROP CONSTRAINT installment_plans_owner_id_event_id_currency_fkey;
ALTER TABLE finance.installment_plans
  ADD CONSTRAINT installment_plans_owner_id_event_id_fkey
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id);

-- Conserva la garantía de moneda de la clave anterior. En un gasto, el plan
-- inicial reparte exactamente el importe registrado: nunca se cuenta dos veces.
CREATE FUNCTION finance.check_installment_target() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, finance AS $body$
BEGIN
  IF EXISTS (SELECT 1 FROM finance.credit_lines l
       WHERE (l.owner_id, l.event_id, l.currency) = (NEW.owner_id, NEW.event_id, NEW.currency))
     OR EXISTS (SELECT 1 FROM finance.financial_events f
       JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (f.owner_id, f.id)
       JOIN finance.bank_effects e ON (e.owner_id, e.event_id, e.id) = (f.owner_id, f.id, f.id)
      WHERE (f.owner_id, f.id) = (NEW.owner_id, NEW.event_id) AND f.kind = 'expense'
        AND e.currency = NEW.currency
        AND -e.amount_signed = NEW.installment_amount * NEW.installment_count) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Plan de cuotas sin compra compatible' USING ERRCODE = '23503';
END
$body$;
REVOKE ALL ON FUNCTION finance.check_installment_target() FROM PUBLIC;
CREATE TRIGGER installment_target BEFORE INSERT ON finance.installment_plans
  FOR EACH ROW EXECUTE FUNCTION finance.check_installment_target();

-- Una fila por cuota activa de cada gasto vigente, en el mes que le corresponde.
CREATE VIEW finance.expense_installments WITH (security_invoker = true) AS
  SELECT f.owner_id, f.id, (p.first_period + (i.ordinal - 1) * INTERVAL '1 month')::date AS effective_on,
         f.created_at, f.concept, p.currency, p.installment_amount AS amount, m.note,
         m.category_id, m.method, i.ordinal AS installment_ordinal, v.monthly_fx
    FROM finance.current_installment_plans p
    JOIN finance.installment_plans v ON (v.owner_id, v.event_id, v.version) = (p.owner_id, p.event_id, 1)
    JOIN finance.financial_events f ON (f.owner_id, f.id) = (p.owner_id, p.event_id)
    JOIN finance.ordinary_movements m ON (m.owner_id, m.event_id) = (p.owner_id, p.event_id)
    CROSS JOIN LATERAL generate_series(1, p.active_count) AS i(ordinal)
   WHERE f.kind = 'expense' AND f.status = 'confirmed';
GRANT SELECT ON finance.expense_installments TO finanzas_app;

-- Presupuestos, totales por categoría e informes: el gasto en cuotas se cuenta
-- solo por sus cuotas mensuales.
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
     AND NOT EXISTS (SELECT 1 FROM finance.installment_plans p
       WHERE (p.owner_id,p.event_id) = (f.owner_id,f.id))
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
      AND x.installment_ordinal IS NOT NULL
  UNION ALL
  SELECT x.owner_id, x.id, x.currency, x.amount, x.category_id, x.effective_on,
         CASE WHEN x.monthly_fx THEN x.effective_on
              ELSE (x.created_at AT TIME ZONE 'America/Montevideo')::date END,
         x.monthly_fx
    FROM finance.expense_installments x;

-- ordinary_movements e installment_plans pertenecen al inventario de copias.
UPDATE finance_meta.account_backup_layout SET layout = finance.account_backup_layout();
