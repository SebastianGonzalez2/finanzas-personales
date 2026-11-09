-- F2-02: RF-015/017/018; CA-020/021/024; I-02/10/11/12.
ALTER TABLE finance.financial_events DROP CONSTRAINT financial_events_kind_check;
ALTER TABLE finance.financial_events ADD CONSTRAINT financial_events_kind_check
  CHECK (kind IN ('income', 'expense', 'bank_transfer', 'balance_adjustment',
    'card_purchase', 'card_payment', 'card_opening', 'card_adjustment'));

-- Card purchases and payments can be voided with the same append-only audit
-- mechanism as bank movements. Opening debt and manual anchors stay intact.
ALTER POLICY audited_movement_transition ON finance.financial_events
  USING (status = 'confirmed' AND kind IN ('income', 'expense', 'bank_transfer', 'card_purchase', 'card_payment'))
  WITH CHECK (
    (kind NOT IN ('card_purchase', 'card_payment') OR status = 'voided')
    AND EXISTS (
      SELECT 1 FROM finance.audit_changes a
       WHERE (a.owner_id, a.event_id) = (financial_events.owner_id, financial_events.id)
         AND a.change_type = financial_events.status
         AND (a.replacement_event_id IS NOT NULL OR a.idempotency_key IS NOT NULL)
    )
  );

ALTER TABLE finance.card_currencies ADD UNIQUE (owner_id, card_id, currency, kind);
GRANT UPDATE (debt) ON finance.card_currencies TO finanzas_app;

CREATE TABLE finance.credit_operations (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  card_id uuid NOT NULL,
  category_id uuid,
  note text CHECK (length(note) <= 500),
  PRIMARY KEY (owner_id, event_id),
  UNIQUE (owner_id, event_id, card_id),
  FOREIGN KEY (owner_id, event_id) REFERENCES finance.financial_events(owner_id, id),
  FOREIGN KEY (owner_id, card_id) REFERENCES finance.cards(owner_id, id),
  FOREIGN KEY (owner_id, category_id) REFERENCES finance.categories(owner_id, id)
);

CREATE TABLE finance.credit_lines (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  card_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  kind text NOT NULL DEFAULT 'credit' CHECK (kind = 'credit'),
  amount finance.exact_amount NOT NULL CHECK (amount >= 0),
  debt_delta finance.exact_amount NOT NULL,
  debt_after finance.exact_amount NOT NULL CHECK (debt_after >= 0),
  bank_currency finance.currency,
  bank_amount finance.exact_amount CHECK (bank_amount > 0),
  fee finance.exact_amount NOT NULL DEFAULT 0 CHECK (fee >= 0),
  PRIMARY KEY (owner_id, event_id, currency),
  UNIQUE (owner_id, event_id, currency, card_id),
  FOREIGN KEY (owner_id, event_id, card_id)
    REFERENCES finance.credit_operations(owner_id, event_id, card_id),
  FOREIGN KEY (owner_id, card_id, currency, kind)
    REFERENCES finance.card_currencies(owner_id, card_id, currency, kind),
  CHECK ((bank_currency IS NULL AND bank_amount IS NULL AND fee = 0)
    OR (bank_currency IS NOT NULL AND bank_amount IS NOT NULL AND amount > 0
      AND debt_delta = -amount AND (bank_currency <> currency OR bank_amount = amount)))
);
CREATE INDEX credit_lines_position ON finance.credit_lines(owner_id, card_id, currency, event_id);

CREATE TABLE finance.credit_allocations (
  owner_id text NOT NULL,
  card_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  currency finance.currency NOT NULL,
  amount finance.exact_amount NOT NULL CHECK (amount > 0),
  PRIMARY KEY (owner_id, payment_id, currency, purchase_id),
  FOREIGN KEY (owner_id, payment_id, currency, card_id)
    REFERENCES finance.credit_lines(owner_id, event_id, currency, card_id),
  FOREIGN KEY (owner_id, purchase_id, currency, card_id)
    REFERENCES finance.credit_lines(owner_id, event_id, currency, card_id),
  CHECK (payment_id <> purchase_id)
);
CREATE INDEX credit_allocations_purchase ON finance.credit_allocations(owner_id, purchase_id, currency);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['credit_operations', 'credit_lines', 'credit_allocations']
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

CREATE VIEW finance.credit_expenses WITH (security_invoker = true) AS
  SELECT f.owner_id, f.id, f.effective_on, f.created_at, f.concept,
         l.currency, l.amount, o.note, o.category_id, 'credit'::text AS method
    FROM finance.financial_events f
    JOIN finance.credit_operations o ON (o.owner_id, o.event_id) = (f.owner_id, f.id)
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
   WHERE f.kind = 'card_purchase' AND f.status = 'confirmed'
   UNION ALL
  SELECT f.owner_id, f.id, f.effective_on, f.created_at, 'Comisión bancaria',
         l.bank_currency, sum(l.fee), NULL::text, NULL::uuid, 'credit'::text
    FROM finance.financial_events f
    JOIN finance.credit_lines l ON (l.owner_id, l.event_id) = (f.owner_id, f.id)
   WHERE f.kind = 'card_payment' AND f.status = 'confirmed' AND l.fee > 0
   GROUP BY f.owner_id, f.id, l.bank_currency;
GRANT SELECT ON finance.credit_expenses TO finanzas_app;
