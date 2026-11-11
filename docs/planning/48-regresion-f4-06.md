# F4-06 · Regresión de calendario y horarios

I-09 y CA-044…049. La matriz unitaria de OpenCode se complementa con
regresiones de idempotencia, concurrencia y aislamiento en PostgreSQL 17.6
desechable y con una prueba de navegador en el huso de Montevideo.

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

## Regresión de integración y navegador

- PostgreSQL: se omite diciembre de 2027 y se confirma en febrero de 2028 una
  factura de enero con referencia de 300 UYU. Un reintento equivalente devuelve
  el mismo evento y reutilizar su clave con otra fecha da conflicto. Dos pagos
  finales con claves distintas y la misma versión del período producen un solo
  pago. Los dos pagos válidos suman 200 UYU en Bancos y en febrero, conservan el
  vínculo con enero y dejan previsto febrero con vencimiento el día 29.
- Avisos y titularidad: diciembre omitido y enero liquidado quedan fuera de los
  avisos. El aviso de enero durante el pago parcial carece de un importe pendiente
  mientras se desconoce el total. Un segundo titular recibe `not-found` al
  reintentar el pago y RLS oculta los recibos de la serie.
- Chromium, escritorio y móvil: dos sesiones del mismo titular reciben
  `201` y `200` para el mismo pago. Recurrentes muestra un solo movimiento y
  permite cerrar la factura por el importe efectivamente pagado. Avisos retira
  el recordatorio y Bancos refleja un solo débito.
- La regresión de fase incluye el alta con comienzo futuro, sueldo definitivo
  menor a la referencia, depósitos parciales, pausas, alquiler compartido y
  avisos por fecha cierta (CA-044…049).

## Verificación

```text
npm run check
npm run test:unit
npm run test:integration
npm run test:e2e:finance
```

Las suites con datos usan el servicio PostgreSQL local definido en
[`docs/testing.md`](../testing.md). F4-06 agrega pruebas y documentación.

La revisión queda apilada sobre F4-05 (PR #47). La integración de la cadena
F4-02…F4-05 en `main` precede al cambio de base de esta PR.
