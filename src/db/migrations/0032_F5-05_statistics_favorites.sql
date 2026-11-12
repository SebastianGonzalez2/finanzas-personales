-- F5-05: RF-044/045/050; CA-059/064. Preferencias personales de Estadísticas.
-- No modifica movimientos, saldos, deudas, reservas ni el dashboard fijo.
CREATE TABLE finance.statistics_favorites (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  chart_id text NOT NULL CHECK (chart_id IN (
    'metrics', 'income-expense', 'expense-categories', 'income-categories',
    'methods', 'history', 'summary'
  )),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, chart_id)
);

ALTER TABLE finance.statistics_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.statistics_favorites FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_isolation ON finance.statistics_favorites TO finanzas_app
  USING (owner_id = nullif(current_setting('finance.owner_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('finance.owner_id', true), ''));

-- Solo preferencias: no se otorgan UPDATE ni TRUNCATE.
GRANT SELECT, INSERT, DELETE ON finance.statistics_favorites TO finanzas_app;
