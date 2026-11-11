# F4-06 · Regresión de calendario y horarios

I-09 y CA-044…049. Esta entrega es la parte **MIX** asignada a OpenCode: matriz
de fechas, husos horarios, meses omitidos, reintentos base, pagos tardíos y
facturas sin importe definitivo, con pruebas unitarias puras y sin efectos
bancarios. La validación de idempotencia real, concurrencia y regresión contra
PostgreSQL queda asignada a Codex.

## Alcance cubierto

La suite `tests/unit/recurrence-calendar-matrix.test.mjs` cubre:

| Escenario | Casos |
|---|---|
| Febrero | 28/29 días, siglos 2100/2400, día 31 ajustado y recuperado, año bisiesto. |
| Fin de año | Mensual, trimestral, anual y semanal cruzando diciembre/enero; fecha final inclusive; aviso con antelación 3 días. |
| Husos horarios | Fecha local de Montevideo alrededor de medianoche UTC, cambio de año y horario de verano histórico; mismo resultado con `TZ=UTC`, Montevideo, Kiritimati y Anchorage. |
| Meses omitidos | Omitir diciembre no elimina enero; un período `skipped` no genera aviso; pausa/reanudación y edición futura no alteran el pasado. |
| Pagos tardíos | Fecha real pasada (incluido año anterior) aceptada; fecha futura rechazada; vencimientos y períodos no se mueven. |
| Factura sin importe definitivo | Total desconocido no inventa restante ni cierra; cierre final exacto; aviso sin importe inventado. |
| Reintentos base | La misma solicitud y un reintento equivalente se normalizan al mismo comando, con importes exactos e identificadores en minúsculas. |

## Verificación

```text
npm run test:unit
npm run test:unit -- tests/unit/recurrence-calendar-matrix.test.mjs
```

No hay migraciones, cambios de esquema ni escrituras en Neon.

## Pendiente para Codex

- Reintento concurrente y conflicto de idempotencia contra PostgreSQL.
- Aislamiento por titular, bloqueo y orden de comandos en la base real.
- Regresión de pagos tardíos y omisiones con movimientos y bancos reales.
- Verificación E2E de recurrentes y avisos bajo el huso de Montevideo.
- Rebase/retarget de la rama cuando se integren F4-02…F4-05: esta rama parte
  de `origin/codex/F4-05-centro-avisos` porque esas dependencias aún no están
  en `origin/main`.
