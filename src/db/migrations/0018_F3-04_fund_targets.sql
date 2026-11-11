-- F3-04: RF-029; CA-040/050. Edición de metas y fechas objetivo de fondos.
-- Quitar una meta no reactiva el plan: la pausa conserva su motivo.
ALTER TABLE finance.savings_funds DROP CONSTRAINT savings_funds_check;
GRANT UPDATE (target_amount, target_date) ON finance.savings_funds TO finanzas_app;

ALTER TABLE finance.fund_changes DROP CONSTRAINT fund_changes_action_check;
ALTER TABLE finance.fund_changes ADD CONSTRAINT fund_changes_action_check
  CHECK (action IN ('create', 'update', 'reserve', 'release', 'transfer', 'close'));

ALTER TABLE finance.contribution_periods ADD COLUMN resolution text
  CHECK (resolution IS NULL OR
         (resolution = 'target_final' AND status = 'completed') OR
         (resolution = 'fund_closed' AND status = 'discarded'));
GRANT UPDATE (resolution) ON finance.contribution_periods TO finanzas_app;
