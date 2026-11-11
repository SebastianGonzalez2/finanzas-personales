-- RF-030 / CA-041. Virtual allocations do not create bank or expense effects.
CREATE TABLE finance.fund_event_allocations (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('expense', 'commitment', 'payment')),
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  PRIMARY KEY (owner_id, event_id, fund_id, purpose),
  UNIQUE (owner_id, event_id, fund_id, currency, purpose),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, fund_id, currency) REFERENCES finance.savings_funds(owner_id, id, currency)
);
CREATE INDEX fund_event_allocations_fund ON finance.fund_event_allocations(owner_id, fund_id);
CREATE UNIQUE INDEX fund_event_one_commitment
  ON finance.fund_event_allocations(owner_id, event_id) WHERE purpose = 'commitment';

CREATE TABLE finance.fund_payment_allocations (
  owner_id text NOT NULL,
  payment_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  purpose text GENERATED ALWAYS AS ('commitment') STORED,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  PRIMARY KEY (owner_id, payment_id, currency, purchase_id),
  FOREIGN KEY (owner_id, payment_id, currency, purchase_id)
    REFERENCES finance.credit_allocations(owner_id, payment_id, currency, purchase_id),
  FOREIGN KEY (owner_id, purchase_id, fund_id, currency, purpose)
    REFERENCES finance.fund_event_allocations(owner_id, event_id, fund_id, currency, purpose)
);
CREATE INDEX fund_payment_allocations_purchase ON finance.fund_payment_allocations(owner_id, purchase_id, currency);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['fund_event_allocations', 'fund_payment_allocations']
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

-- Explicit payments with free cash can retire a commitment without consuming
-- the fund. Refunds reduce only the unpaid purchase ceiling, never bank reserves.
CREATE VIEW finance.fund_purchase_commitments WITH (security_invoker = true) AS
  SELECT a.owner_id, a.event_id AS purchase_id, a.fund_id, a.currency, l.card_id,
         greatest(0, least(a.amount - coalesce(p.consumed, 0),
           l.amount + coalesce(x.delta, 0) - coalesce(p.paid, 0) - coalesce(r.credited, 0))) AS remaining
    FROM finance.fund_event_allocations a
    JOIN finance.financial_events f ON (f.owner_id, f.id) = (a.owner_id, a.event_id)
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id, l.currency) = (a.owner_id, a.event_id, a.currency)
    LEFT JOIN finance.card_credit_changes x ON (x.owner_id, x.event_id, x.currency) = (l.owner_id, l.event_id, l.currency)
    LEFT JOIN LATERAL (
      SELECT sum(c.amount) AS paid, sum(u.amount) AS consumed
        FROM finance.credit_allocations c
        JOIN finance.financial_events payment ON (payment.owner_id, payment.id) = (c.owner_id, c.payment_id)
        LEFT JOIN finance.fund_payment_allocations u
          ON (u.owner_id, u.payment_id, u.currency, u.purchase_id) = (c.owner_id, c.payment_id, c.currency, c.purchase_id)
       WHERE (c.owner_id, c.purchase_id, c.currency) = (a.owner_id, a.event_id, a.currency)
         AND payment.status = 'confirmed'
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT sum(part.amount) AS credited
        FROM finance.purchase_refunds refund
        JOIN finance.financial_events rf ON (rf.owner_id, rf.id) = (refund.owner_id, refund.event_id)
        JOIN finance.refund_parts part ON (part.owner_id, part.event_id) = (refund.owner_id, refund.event_id)
       WHERE (refund.owner_id, refund.purchase_id) = (a.owner_id, a.event_id)
         AND rf.status = 'confirmed' AND refund.action = 'credit' AND part.method = 'credit'
    ) r ON true
   WHERE a.purpose = 'commitment' AND f.kind = 'card_purchase' AND f.status = 'confirmed';
GRANT SELECT ON finance.fund_purchase_commitments TO finanzas_app;

-- Also protects other reserve writers (including closing a fund) from releasing
-- an outstanding commitment. Payment consumes it before lowering the reserve.
CREATE FUNCTION finance.protect_fund_commitments() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF (NEW.reserved_amount < OLD.reserved_amount OR NEW.status = 'closed')
     AND EXISTS (
       SELECT 1 FROM finance.fund_purchase_commitments c
        WHERE c.owner_id = NEW.owner_id AND c.fund_id = NEW.id
       GROUP BY c.owner_id, c.fund_id
       HAVING sum(c.remaining) > CASE WHEN NEW.status = 'closed' THEN 0 ELSE NEW.reserved_amount END
     )
  THEN
    RAISE EXCEPTION 'El fondo tiene importes comprometidos con compras de tarjeta.' USING ERRCODE = '23514', CONSTRAINT = 'protect_fund_commitments';
  END IF;
  RETURN NEW;
END
$guard$;
CREATE TRIGGER protect_fund_commitments
  BEFORE UPDATE OF reserved_amount, status ON finance.savings_funds
  FOR EACH ROW EXECUTE FUNCTION finance.protect_fund_commitments();
