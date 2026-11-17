# EXPORT-FIX — Auditoría y corrección de exportaciones (v1.0)

Alcance: informe del período en CSV, Excel y PDF (`POST /api/export`), sección por sección.
Sin migraciones ni cambios de esquema. Sin tocar el respaldo F6-04, el límite de 366 días ni las secciones existentes (solo se añaden dos columnas a Tarjetas). Datos exclusivamente sintéticos.

## Método

1. Lectura del generador (`period-report.ts`, `report-files.ts`, `report-format.ts`, ruta de exportación) y de los módulos financieros de referencia (Estadísticas, Presupuestos, Tarjetas, Saldos, Fondos).
2. Prueba de integración con lectores **independientes** de CSV, XLSX y PDF (`tests/support/report-readers.mjs`) y valores esperados calculados a mano en enteros, sobre una base desechable (UYU/USD/EUR, varios meses, cuotas, pagos de tarjeta con conversión y comisión, reembolso, presupuestos con cotizaciones históricas, fondos, titular B, períodos vacíos).
3. Cada defecto se reprodujo en CI contra el código previo a la corrección antes de arreglarlo.

## Defectos confirmados y corregidos

| ID | Sección | Defecto | Corrección |
| --- | --- | --- | --- |
| D1 | Presupuestos | Los meses que el usuario nunca abrió en Presupuestos no tenían cotizaciones históricas fijadas: el consumo en otra moneda salía como «Faltan cotizaciones históricas». Las cuotas de meses futuros no mostraban estimación. | La exportación prepara las referencias igual que Presupuestos (fechas pendientes → proveedores fuera de transacción → captura por mes) y luego lee de una instantánea `REPEATABLE READ`. Las estimaciones futuras se marcan «estimación provisional». |
| D2 | Resumen | Un ingreso dividido entre categorías se contaba completo en una sola categoría (Estadísticas lo reparte por parte). | Usa el desglose vigente (`current_movement_allocations`), igual que Estadísticas. |
| D3 | Resumen / Fondos | Escala inconsistente: ceros como `0` y fondos sin los cuatro decimales. | Todos los importes salen con `numeric(20,4)`. |
| D4 | Movimientos | La categoría mostraba la atribución original, no el desglose vigente tras reclasificar. | La categoría refleja el desglose vigente. |
| D5 | Movimientos | Un pago de tarjeta con conversión o comisión no mostraba lo que sale del banco; la comisión, que Resumen cuenta como gasto, no se podía rastrear. | Filas adicionales «Pago de tarjeta (débito bancario)» y «Comisión bancaria de pago» en la moneda del banco. |
| D6 | Saldos | La proyección salía vacía cuando no había movimientos posteriores al checkpoint. | Sin movimientos posteriores, la proyección es el saldo confirmado (igual que las pantallas bancarias). |
| D7 | Tarjetas | Las compras de una tarjeta sin día de cierre no pertenecían a ningún ciclo y desaparecían; el monto oficial del resumen no se exportaba. | Columnas nuevas al final: «Compras sin ciclo asignado» y «Monto oficial del resumen». |
| D8 | PDF | La fuente estándar solo dibuja Latin-1: comillas y guiones tipográficos, `€`, `−` y similares salían como glifos erróneos u omitidos, y CSV/Excel no coincidían. | `pdfSafe` sustituye por el equivalente simple y el resto por `?`. CSV y Excel conservan el texto original. |

Sin defecto: rango de fechas inclusivo, aislamiento entre titulares, neutralización de fórmulas (`=`, `+`, `-`, `@`), reembolso acreditado en un mes distinto del de la compra (va aparte, en el mes acreditado, sin reducir compras ni presupuesto), pago de tarjeta sin duplicar gasto, informes vacíos y tope de filas.

## Matriz de cobertura final

Todas las celdas se verifican leyendo el contenido real del archivo (no solo su existencia) contra las filas del informe y contra valores calculados a mano.

| Sección | CSV | Excel | PDF | Verificado contra |
| --- | --- | --- | --- | --- |
| Resumen | ✔ | ✔ | ✔ | totales y tramos por moneda; ingresos y gastos por categoría; reembolso aparte; resultado |
| Movimientos | ✔ | ✔ | ✔ | límites del rango, sin filas duplicadas ni de otro titular; categoría vigente; débito bancario y comisión |
| Saldos | ✔ | ✔ | ✔ | `listBankBalances` (confirmado y proyección) |
| Tarjetas | ✔ | ✔ | ✔ | ciclos, pagos, saldo pendiente, abonos, sin ciclo y monto oficial |
| Presupuestos | ✔ | ✔ | ✔ | consumo convertido con cotizaciones históricas, cuotas en USD |
| Fondos | ✔ | ✔ | ✔ | aporte, reserva y liberación al cierre; fondo inexistente en el período |

Consistencia entre formatos: mismas filas, mismas columnas y títulos en los tres; Excel sin fórmulas; CSV con apóstrofo ante texto que empieza como fórmula; PDF con el mismo contenido salvo los caracteres fuera de Latin-1 (ver limitaciones).

## Pruebas

- `tests/unit/report-files.test.mjs` (4) y `tests/unit/report-format.test.mjs`: formatos, `pdfSafe`, neutralización de fórmulas.
- `tests/integration/export-fix.test.mjs`: escenario descrito arriba, con subpruebas por sección, consistencia entre formatos, aislamiento, fondos y período vacío.
- Expectativas existentes actualizadas por diseño en `bank-benefits.test.mjs` (ceros con 4 decimales, dos columnas nuevas de Tarjetas) y `account-backup.test.mjs` (proyección = saldo confirmado).
- Se ejecutan en `F0 CI` (PostgreSQL 17.6): calidad, build, e2e y base de datos.

## Limitaciones de producto que se mantienen

- PDF: los caracteres fuera de Latin-1 (por ejemplo emoji) se muestran como `?`; CSV y Excel conservan el texto exacto. Incrustar una fuente Unicode queda fuera de esta tarea.
- Las líneas largas del PDF se parten en los guiones (p. ej. identificadores); el contenido no cambia.
- La cuota de un mes futuro dentro del rango usa una estimación provisional, etiquetada como tal; no es un valor fijado hasta que llegue la fecha.
- Si el proveedor de cotizaciones no responde, la fila de presupuesto queda marcada «Faltan cotizaciones históricas» en lugar de bloquear la exportación.
- Tope de 366 días y de 4000 movimientos por informe (sin cambios).
