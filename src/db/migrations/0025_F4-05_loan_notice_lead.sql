-- F4-05: RF-037/038; v9.44. Antelación configurable del aviso interno de
-- vencimiento de una deuda/préstamo con fecha cierta (3 días por defecto).
-- Solo preferencia de avisos: no altera importes, saldos ni efectos.
ALTER TABLE finance.loans ADD COLUMN notice_lead_days smallint NOT NULL DEFAULT 3
  CHECK (notice_lead_days BETWEEN 0 AND 365);
