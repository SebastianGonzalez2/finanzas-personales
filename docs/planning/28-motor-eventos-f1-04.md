# F1-04 — Motor de eventos monetarios

**Trazabilidad** · F1 · RF-010 · CA-013, CA-014 y CA-016 · I-01, I-10, I-11 e I-12. [Plan](05-plan-de-implementacion.md) · [Decisiones del producto, §5](../product/decisiones-producto.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

Después de guardar un ingreso o gasto bancario, Resumen ofrece **Deshacer** y **Corregir importe**. La corrección conserva moneda, fecha, medio, concepto, nota y categoría. PostgreSQL conserva el movimiento y su efecto originales, cambia el estado a `voided` o `corrected` y agrega una entrada de auditoría. Una corrección crea además un reemplazo vinculado. Bancos y los totales mensuales se calculan a partir de los efectos de los eventos confirmados.

El servidor comparte la validación decimal de altas y correcciones. Acepta importes positivos como texto, con un máximo de cuatro decimales, y opera con `bigint` y `numeric`. El servidor verifica la sesión y deriva el titular. Dentro de su transacción toma un bloqueo por titular y busca la clave de idempotencia antes de comprobar el saldo y el estado del movimiento. El mismo comando devuelve el ID persistido. Usar la misma clave con otros datos devuelve un conflicto. El rol de aplicación puede actualizar solo el estado de un evento confirmado y la política de filas exige una auditoría de esa transición. [Políticas de filas en PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Si un saldo confirmado posteriormente cubre el registro o el cambio consumiría fondos que ya se usaron, la acción se rechaza y Resumen explica el motivo. La conciliación de checkpoints corresponde a F1-05. El historial paginado y la edición desde ese historial corresponden a F1-07.

## Revisión

En un entorno de pruebas con las migraciones aplicadas, configurá 10.000 UYU de saldo inicial y registrá un gasto de 5.000 UYU. Corregí el importe a 500 UYU desde la confirmación. Bancos debe mostrar 9.500 UYU y el total de gastos del mes debe quedar en 500 UYU. Registrá otro gasto de 1 UYU y pulsá **Deshacer** desde su confirmación. Verificá que Bancos vuelva a 9.500 UYU. Recargá la página para comprobar la persistencia.

## Migración de desarrollo

[0003_F1-04_movement_revisions.sql](../../src/db/migrations/0003_F1-04_movement_revisions.sql) agrega campos de revisión, claves e índices a la auditoría existente y limita el permiso de actualización a la columna de estado. El historial existente sigue disponible mientras el esquema F1-03 esté presente. Las escrituras del formulario requieren el esquema F1-04.

Destino previsto **Neon development**, base `neondb`. SHA-256 `13ad4fcabf4acf3e6e780e9006cebca2931984170e8b05807e83d23cf959e3d8`. `npm run db:plan` muestra la versión y el hash sin conectarse. La aplicación en Neon requiere autorización del SQL exacto según el ADR 0004 y que la migración F1-03 ya esté aplicada.
