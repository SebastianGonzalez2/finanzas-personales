-- F3-04: RF-029; CA-040/050. Edición de metas y fechas objetivo de fondos.
-- La edición visual guarda target_amount y target_date sin tocar reservas
-- (reserved_amount conserva su concesión de 0016) ni el estado del motor de
-- aportes programados. La eliminación de la meta con estado
-- paused_target_reached sigue bloqueada por la restricción de 0015 y la
-- validación del servidor.
GRANT UPDATE (target_amount, target_date) ON finance.savings_funds TO finanzas_app;
