# F5-02 · División por categorías y etiquetas

RF-040/042, CA-052/056 e invariantes I-01/02/05/06/07/08/10/11/12.

- Una transacción conserva su importe, moneda, fecha y medio. Las asignaciones positivas y en moneda original deben sumar exactamente el importe de consumo. Se puede asignar una porción a «Sin categorizar». La clasificación vigente sustituye a la categoría original para presupuestos, estadísticas y filtros del historial.
- El desglose de compras inmediatas usa la misma transacción de Bancos o de crédito. Las compras con dos medios usan su reparto existente por medio, incluidos los reintegros. El gasto compartido se puede clasificar desde el detalle por su porción propia. Los planes de cuotas conservan sus reglas de periodización y las devoluciones acreditadas conservan fecha, medio y atribución explícita.
- Las ediciones de clasificación agregan una versión auditable con las porciones y etiquetas del titular. El detalle permite consultar versiones anteriores. Una corrección financiera conserva las etiquetas y exige que el desglose cierre con el nuevo importe. Una compra con devoluciones vinculadas conserva sus porciones para mantener los máximos acreditables por categoría.
- Las etiquetas se crean desde los formularios o desde `/etiquetas`. Renombrarlas, archivarlas o restaurarlas conserva sus vínculos. Los filtros de historial y estadísticas coinciden con cualquiera de las etiquetas seleccionadas y evalúan pertenencia una vez por movimiento. Los presupuestos siguen calculándose por categoría y subcategoría.

## Migración

[SQL de la migración](../../src/db/migrations/0028_F5-02_movement_classification.sql).

La migración se aplicaría a Neon **development** tras la aprobación específica. La migración agrega cuatro tablas con RLS forzada y claves compuestas por titular, una comprobación diferida de la suma exacta, vistas de clasificación vigente y una proyección de consumo para presupuestos. Conserva los registros anteriores y usa sus categorías vigentes como respaldo cuando no existe un desglose. La numeración `0028` evita ocupar los números de migraciones previas en revisión.

El SHA-256 del SQL es `5ae2db3ab92f1ed3bad006b01cbd4407d35f94bab6ff7265267d8ab6529b3e5f`.

La validación automatizada usa PostgreSQL desechable y datos sintéticos. Aplicar la migración en el esquema compartido requiere aprobación conforme al ADR 0004.

Siguiente ticket sugerido, F5-03.
