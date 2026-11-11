# F3-07 — Avisos internos de presupuestos y metas

RF-032/038, CA-042/050. El centro `/avisos` muestra los cruces de presupuesto
del mes calendario en Montevideo, las metas vencidas de los fondos y los
avisos de aportaciones programadas.

- Cada cruce conserva el porcentaje entero observado y la moneda del límite.
  Hay un registro por titular, presupuesto, mes y umbral. Si el primer
  cruce alcanza 100%, se registra solo ese aviso. Si el 80% ya quedó
  registrado, ambos avisos se conservan durante el mes.
- Las compras y cambios que afectan el consumo o los límites evalúan los
  umbrales en la misma transacción. Al abrir `/avisos` se evalúa también el
  mes actual para contemplar cuotas ya registradas y el cambio de mes.
  El cálculo usa el consumo exacto de F3-06, con su jerarquía, cuotas y
  cotizaciones fijas. Si falta una cotización, se espera a tener el consumo
  completo.
- Los avisos de meta se derivan de la fecha objetivo y la reserva vigente.
  La evaluación de la meta conserva la reserva, el estado del fondo y su
  programación. El presupuesto es informativo y superar el límite permite
  seguir registrando compras.

## Migración

- SQL exacto en [0021_F3-07_budget_notices.sql](../../src/db/migrations/0021_F3-07_budget_notices.sql).
- El destino propuesto es la rama Neon `development` del proyecto, después de `0020`.
- El SHA-256 es `fe315f450f3956d3ed4ea06fb0ea369a7a64af4c0c4448047677497bd12d5492`.
- El SQL crea una tabla de avisos con RLS forzada y FK compuesta al
  presupuesto. El rol de la app puede leer e insertar sus propias filas.
  La migración parte de una tabla vacía y no modifica registros existentes.
- La aplicación en Neon requiere autorización específica según
  [ADR 0004](../adr/0004-google-only-allowlist-auth.md). El SQL se valida en
  PostgreSQL local desechable. Mientras falta la tabla, las compras y
  presupuestos funcionan y el centro sigue mostrando metas y aportaciones.
