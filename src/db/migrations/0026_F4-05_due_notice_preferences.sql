-- F4-05: RF-037/038; v9.44. Antelación configurable del aviso interno de
-- vencimiento de una deuda/préstamo con fecha cierta (3 días por defecto).
-- Solo preferencia de avisos: no altera importes, saldos ni efectos.
ALTER TABLE finance.loans ADD COLUMN notice_lead_days smallint NOT NULL DEFAULT 3
  CHECK (notice_lead_days BETWEEN 0 AND 365);

CREATE TABLE finance.card_push_subscriptions (
  owner_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (owner_id, id)
);

CREATE TABLE finance.card_push_attempts (
  owner_id text NOT NULL,
  subscription_id uuid NOT NULL,
  card_id uuid NOT NULL,
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  currency finance.currency NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, subscription_id, card_id, period, currency),
  FOREIGN KEY (owner_id, subscription_id)
    REFERENCES finance.card_push_subscriptions(owner_id, id),
  FOREIGN KEY (owner_id, card_id)
    REFERENCES finance.cards(owner_id, id)
);

ALTER TABLE finance.card_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.card_push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.card_push_subscriptions TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT, UPDATE (enabled, p256dh, auth, expires_at)
  ON finance.card_push_subscriptions TO finanzas_app;

ALTER TABLE finance.card_push_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.card_push_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.card_push_attempts TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));
GRANT SELECT, INSERT ON finance.card_push_attempts TO finanzas_app;
