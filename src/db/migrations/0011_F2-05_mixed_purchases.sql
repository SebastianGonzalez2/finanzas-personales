-- F2-05: RF-019/040; CA-025/026; I-01/02/06/10/11/12.
CREATE TABLE finance.mixed_purchases (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  debit_card_id uuid,
  debit_kind text GENERATED ALWAYS AS ('debit'::text) STORED,
  PRIMARY KEY (owner_id, event_id),
  FOREIGN KEY (owner_id, event_id, currency) REFERENCES finance.credit_lines(owner_id, event_id, currency),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.bank_effects(owner_id, id),
  FOREIGN KEY (owner_id, debit_card_id, debit_kind) REFERENCES finance.cards(owner_id, id, kind)
);

CREATE TABLE finance.mixed_purchase_categories (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('debit', 'credit')),
  category_id uuid,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  UNIQUE NULLS NOT DISTINCT (owner_id, event_id, method, category_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.mixed_purchases(owner_id, event_id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['mixed_purchases', 'mixed_purchase_categories']
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

-- A replacement is recorded in the same transaction. Its audit link gives the
-- new debit the original event's ordering relative to manual bank checkpoints.
ALTER TABLE finance.audit_changes ALTER CONSTRAINT audit_changes_owner_id_replacement_event_id_fkey
  DEFERRABLE INITIALLY IMMEDIATE;
ALTER POLICY audited_movement_transition ON finance.financial_events
  WITH CHECK (
    (kind NOT IN ('card_purchase', 'card_payment') OR status = 'voided'
      OR (kind = 'card_purchase' AND EXISTS (
        SELECT 1 FROM finance.mixed_purchases m
         WHERE (m.owner_id, m.event_id) = (financial_events.owner_id, financial_events.id)
      )))
    AND EXISTS (
      SELECT 1 FROM finance.audit_changes a
       WHERE (a.owner_id, a.event_id) = (financial_events.owner_id, financial_events.id)
         AND a.change_type = financial_events.status
         AND (a.replacement_event_id IS NOT NULL OR a.idempotency_key IS NOT NULL)
    )
  );

CREATE VIEW finance.mixed_purchase_debits WITH (security_invoker = true) AS
  SELECT m.owner_id, m.event_id AS id, e.effective_on, m.currency, -e.amount_signed AS amount
    FROM finance.mixed_purchases m
    JOIN finance.bank_effects e
      ON (e.owner_id, e.event_id, e.id, e.currency) = (m.owner_id, m.event_id, m.event_id, m.currency);

-- Preserve each category's total and the exact equal installments at four
-- decimals. Spread leftover units over successive slots, in category ID order.
-- Cancelled installments retain their original slot and never redistribute spend.
CREATE VIEW finance.mixed_purchase_expenses WITH (security_invoker = true) AS
  WITH parts AS (
    SELECT d.owner_id, d.id, d.effective_on, d.currency, d.amount, o.category_id,
           'debit'::text AS method, NULL::integer AS installment_ordinal, 1 AS slots
      FROM finance.mixed_purchase_debits d
      JOIN finance.financial_events f ON (f.owner_id, f.id) = (d.owner_id, d.id)
      JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (d.owner_id, d.id)
     WHERE f.status = 'confirmed'
    UNION ALL
    SELECT x.owner_id, x.id, x.effective_on, x.currency, x.amount, x.category_id,
           x.method, x.installment_ordinal, coalesce(p.installment_count, 1)
      FROM finance.credit_expenses x
      JOIN finance.mixed_purchases m ON (m.owner_id, m.event_id) = (x.owner_id, x.id)
      LEFT JOIN finance.current_installment_plans p ON (p.owner_id, p.event_id) = (x.owner_id, x.id)
  ), splits AS (
    SELECT parts.*, s.category_id AS split_category, s.amount * 10000 AS units,
           sum(mod(s.amount * 10000, slots)) OVER (
             PARTITION BY parts.owner_id, parts.id, parts.method, installment_ordinal
             ORDER BY s.category_id NULLS FIRST ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS previous_remainder
      FROM parts LEFT JOIN finance.mixed_purchase_categories s
        ON (s.owner_id, s.event_id, s.method) = (parts.owner_id, parts.id, parts.method)
  ), projected AS (
    SELECT owner_id, id, effective_on, currency, method, installment_ordinal,
           CASE WHEN units IS NULL THEN category_id ELSE split_category END AS category_id,
           CASE WHEN units IS NULL THEN amount ELSE
             (div(units, slots) + CASE WHEN
               mod(coalesce(installment_ordinal, 1) - 1 - mod(coalesce(previous_remainder, 0), slots) + slots, slots)
                 < mod(units, slots) THEN 1 ELSE 0 END) * 0.0001 END AS amount
      FROM splits
  )
  SELECT * FROM projected WHERE amount > 0;

GRANT SELECT ON finance.mixed_purchase_debits, finance.mixed_purchase_expenses TO finanzas_app;
