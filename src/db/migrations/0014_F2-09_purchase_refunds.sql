-- F2-09: RF-021/047; CA-028/029/037; I-01/02/06/10/11/12.
ALTER TABLE finance.financial_events DROP CONSTRAINT financial_events_kind_check;
ALTER TABLE finance.financial_events ADD CONSTRAINT financial_events_kind_check
  CHECK (kind IN ('income', 'expense', 'bank_transfer', 'balance_adjustment',
    'card_purchase', 'card_payment', 'card_opening', 'card_adjustment', 'loan_operation',
    'purchase_refund', 'card_credit_return'));

ALTER POLICY audited_movement_transition ON finance.financial_events
  USING (status = 'confirmed' AND kind IN ('income', 'expense', 'bank_transfer',
    'card_purchase', 'card_payment', 'purchase_refund', 'card_credit_return'));

CREATE TABLE finance.purchase_refunds (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  pending_id uuid,
  action text NOT NULL CHECK (action IN ('pending', 'credit', 'cancel_installments')),
  currency finance.currency NOT NULL,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  applied_amount finance.exact_amount NOT NULL CHECK (applied_amount BETWEEN 0 AND amount),
  PRIMARY KEY (owner_id, event_id),
  UNIQUE (owner_id, purchase_id, event_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, purchase_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, purchase_id, pending_id)
    REFERENCES finance.purchase_refunds(owner_id, purchase_id, event_id),
  CHECK (event_id <> purchase_id AND pending_id IS DISTINCT FROM event_id),
  CHECK (action <> 'pending' OR pending_id IS NULL)
);
CREATE INDEX purchase_refunds_pending ON finance.purchase_refunds(owner_id, pending_id);

CREATE TABLE finance.refund_parts (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('debit', 'credit')),
  category_id uuid,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  overlap finance.exact_amount NOT NULL DEFAULT 0 CHECK (overlap BETWEEN 0 AND amount),
  CHECK (method = 'credit' OR overlap = 0),
  UNIQUE NULLS NOT DISTINCT (owner_id, event_id, method, category_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.purchase_refunds(owner_id, event_id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id)
);

CREATE TABLE finance.refund_installments (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 120),
  PRIMARY KEY (owner_id, purchase_id, ordinal, event_id),
  FOREIGN KEY (owner_id, purchase_id, event_id)
    REFERENCES finance.purchase_refunds(owner_id, purchase_id, event_id)
);

-- The existing credit ledger carries the debt delta. The companion row tracks
-- the separate issuer credit, including its use on a later purchase or withdrawal.
CREATE TABLE finance.card_credit_changes (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  card_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  delta finance.exact_amount NOT NULL,
  PRIMARY KEY (owner_id, event_id, currency),
  FOREIGN KEY (owner_id, event_id, currency, card_id)
    REFERENCES finance.credit_lines(owner_id, event_id, currency, card_id)
);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'purchase_refunds', 'refund_parts', 'refund_installments', 'card_credit_changes'
  ] LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY owner_isolation ON finance.%I TO finanzas_app
      USING (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))
      WITH CHECK (owner_id = nullif(current_setting(''finance.owner_id'', true), ''''))', relation_name);
    EXECUTE format('GRANT SELECT, INSERT ON finance.%I TO finanzas_app', relation_name);
  END LOOP;
END
$policies$;

CREATE VIEW finance.card_credit_balances WITH (security_invoker = true) AS
  SELECT x.owner_id, x.card_id, x.currency, sum(x.delta) AS delta
    FROM finance.card_credit_changes x
    JOIN finance.financial_events f ON (f.owner_id, f.id) = (x.owner_id, x.event_id)
   WHERE f.status = 'confirmed'
   GROUP BY x.owner_id, x.card_id, x.currency;

GRANT SELECT ON finance.card_credit_balances TO finanzas_app;

CREATE VIEW finance.active_refund_installments WITH (security_invoker = true) AS
  SELECT i.owner_id, i.purchase_id, i.ordinal
    FROM finance.refund_installments i
    JOIN finance.financial_events f ON (f.owner_id, f.id) = (i.owner_id, i.event_id)
   WHERE f.status = 'confirmed';

CREATE POLICY preserve_refunded_purchases ON finance.financial_events AS RESTRICTIVE
  FOR UPDATE TO finanzas_app USING (
    NOT EXISTS (
      SELECT 1 FROM finance.purchase_refunds r
      JOIN finance.financial_events f ON (f.owner_id, f.id) = (r.owner_id, r.event_id)
      WHERE (r.owner_id, r.purchase_id) = (financial_events.owner_id, financial_events.id)
        AND f.status = 'confirmed'
    )
  );

GRANT SELECT ON finance.active_refund_installments TO finanzas_app;

CREATE OR REPLACE VIEW finance.credit_expenses WITH (security_invoker = true) AS
  SELECT f.owner_id, f.id, f.effective_on, f.created_at, f.concept,
         l.currency, l.amount, o.note, o.category_id, 'credit'::text AS method,
         NULL::integer AS installment_ordinal
    FROM finance.financial_events f
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
   WHERE f.kind = 'card_purchase' AND f.status = 'confirmed'
     AND NOT EXISTS (SELECT 1 FROM finance.installment_plans p
       WHERE (p.owner_id, p.event_id, p.version) = (f.owner_id, f.id, 1))
   UNION ALL
  SELECT f.owner_id, f.id, f.effective_on, f.created_at, 'Comisión bancaria',
         l.bank_currency, sum(l.fee), NULL::text, NULL::uuid, 'credit'::text, NULL::integer
    FROM finance.financial_events f
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
   WHERE f.kind = 'card_payment' AND f.status = 'confirmed' AND l.fee > 0
   GROUP BY f.owner_id, f.id, l.bank_currency
   UNION ALL
  SELECT f.owner_id, f.id, (p.first_period + (i_slot.ordinal - 1) * INTERVAL '1 month')::date,
         f.created_at, f.concept, p.currency, p.installment_amount, o.note, o.category_id,
         'credit'::text, i_slot.ordinal
    FROM finance.current_installment_plans p
    JOIN finance.financial_events f ON (f.owner_id, f.id) = (p.owner_id, p.event_id)
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (p.owner_id, p.event_id)
    CROSS JOIN LATERAL generate_series(1, p.active_count) AS i_slot(ordinal)
   WHERE f.kind = 'card_purchase' AND f.status = 'confirmed'
     AND NOT EXISTS (
       SELECT 1 FROM finance.active_refund_installments i
        WHERE (i.owner_id, i.purchase_id) = (f.owner_id, f.id)
          AND i.ordinal = i_slot.ordinal
     );
