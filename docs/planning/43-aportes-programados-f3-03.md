# F3-03 — Aportes mensuales programados (MIX)

Ruta MIX sobre la rama `codex/F3-03-aportes-programados`, creada desde `origin/main`. OpenCode entrega únicamente el contrato puro de calendario y sus pruebas. Codex completa la persistencia, las transacciones, los estados pendientes y los reintentos manuales.

- [RF-028](../01-alcance-y-requisitos.md)
- [CA-039](../03-criterios-de-aceptacion.md)
- [Estados de aportes](../02-modelo-de-dominio-y-datos.md)
- [Reglas v5.8, v5.9, v9.24–v9.27](../product/decisiones-producto.md)

## Calendario entregado

`src/domain/scheduled-contributions.ts` no usa `Date`, husos horarios ni redondeos: opera con meses `AAAA-MM` y fechas `AAAA-MM-DD` como texto calendario puro.

| Regla | Función |
| --- | --- |
| Primera ejecución y reactivación en el mes calendario siguiente | `contributionMonthAfter`, `firstContributionDate` |
| Día 29–31 inexistente → último día del mes, recuperando el día elegido después | `daysInContributionMonth`, `contributionDayInMonth`, `contributionDate` |
| Vencimiento por comparación de fecha efectiva, sin adelantar ni repetir | `contributionIsDue` |
| Validación estricta de mes, día y fecha real | `isContributionMonth`, `isContributionDay`, `isCalendarDate` |

La preferencia de día no se reescribe: el ajuste es solo para el mes concreto. El 31 de enero se ejecuta el 29 de febrero en año bisiesto y el 28 en año no bisiesto; en abril, junio, septiembre y noviembre se ejecuta el día 30. Año 1900 y 2100 no son bisiestos; 2000 y 2024 sí.

## Límites de la entrega MIX

No se agregaron tablas, migraciones, endpoints, comandos ni interfaz. Por tanto **no se aplicó SQL a Neon**. La rama no incluye todavía `0015`/`0016` de F3-01/F3-02 porque se creó desde `origin/main`; Codex debe integrar el calendario sobre la base vigente de fondos y disponible libre.

## Trabajo pendiente para Codex

1. Modelar la programación por fondo (importe, día, moneda, estado, próxima ejecución) y las aportaciones por período con estados `scheduled`, `missed_insufficient`, `completed` y `discarded`.
2. Definir y aplicar la migración en Neon development con SQL exacto, impacto y SHA-256, tras autorización específica.
3. Ejecutar cada período una sola vez y en una transacción: comprobar disponible completo en la misma moneda; si no alcanza, no reservar nada, no tocar Bancos y dejar el período pendiente.
4. No reintentar automáticamente ni reservar atrasos; permitir «Completar» o «Descartar» manual con validación de saldo y clave de idempotencia.
5. Integrar la edición solo a futuro, la pausa/reactivación desde el mes siguiente y la ejecución con servicios gratuitos sin duplicados.
6. Agregar pruebas de integración (CA-039, concurrencia, reintento, aislamiento A/B) y la revisión visual correspondiente.

## Verificación local

- `npm run test:unit` — 35 pruebas aprobadas, incluidas las 5 nuevas de F3-03 para febrero bisiesto y no bisiesto, meses de 30/31 días, fin de año, primera ejecución, vencimiento y entradas inválidas.
