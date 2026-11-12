# F5-04 — Filtros guardados y clasificación masiva

Los filtros de Historial guardan criterios con nombre por titular. «Mes actual», «Mes anterior», «Últimos 3 meses» y «Año actual» se resuelven en cada consulta en America/Montevideo. El titular puede guardar, renombrar, reemplazar los criterios por la búsqueda actual o eliminar el filtro. Las modificaciones exigen versión e idempotencia. Los criterios archivados siguen disponibles para consultas históricas.

La búsqueda combina los criterios del historial y pagina en PostgreSQL con cursor de fecha, ID y tipo. La búsqueda de texto incluye comercios canónicos y personas vinculadas cuando está presente el catálogo de F5-03. La integración del selector de comercio de F5-03 se revisará al incorporar su PR.

En Historial se pueden seleccionar hasta 20 ingresos, gastos o compras con tarjeta confirmados de una página. La confirmación muestra el número de registros y permite aplicar una categoría compatible o agregar una etiqueta. Para categorizar, un desglose existente o una compra mixta, con cuotas, multimoneda o con devolución vinculada requiere revisión individual. Agregar una etiqueta conserva las asignaciones y etiquetas previas.

`POST /api/history/bulk-category` acepta `entries: [{id, kind, version}]`, `idempotencyKey` y exactamente uno de `categoryId` o `tagId`. La sesión y el titular se verifican en servidor. El lote se serializa con la edición individual y las operaciones monetarias del titular. Un conflicto cancela toda la operación. Una repetición idéntica devuelve el mismo `{updated}`. Cada cambio conserva una versión en `classification_changes` y una entrada en `audit_changes`. Las escrituras se limitan a clasificación, auditoría y recibo del lote.

## Migraciones

- [0024_F5-04_filtros_guardados.sql](../../src/db/migrations/0024_F5-04_filtros_guardados.sql) crea el catálogo de filtros y su historial de comandos con RLS por titular. SHA-256 `d1a08a7cf7bc98803f94fefe33fd7738afe62f9e4aff9a633e433b4efb7870e2`.
- [0029_F5-04_bulk_classification.sql](../../src/db/migrations/0029_F5-04_bulk_classification.sql) agrega el recibo inmutable de lote con RLS, el tipo de auditoría y el permiso acotado para reemplazar criterios guardados. Requiere la migración 0028 de F5-02. SHA-256 `ea95712911c5290492d5b245b964c711499a0201716a67fed10374fa8a8f1abe`.

El destino previsto para validar fuera del clúster local es Neon development. La aplicación allí queda pendiente de aprobación específica según ADR 0004.

## Verificación

CA-057 cubre diez gastos, banco y deuda exactos, aislamiento A/B, versiones obsoletas, reintento concurrente, rollback ante fallo de auditoría y conservación de un desglose al etiquetar. CA-058 cubre período vigente, cambio de mes y reemplazo de criterios. Las pruebas de integración y navegador usan datos sintéticos en PostgreSQL local desechable.

[RF-043](01-alcance-y-requisitos.md) · [CA-057/058](03-criterios-de-aceptacion.md) · [Invariantes](02-modelo-de-dominio-y-datos.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md)
