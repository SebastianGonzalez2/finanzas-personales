# F2-09 · Devoluciones reales

RF-021 y RF-047 · CA-028, CA-029 y CA-037 · I-01, I-02, I-06, I-10, I-11 e I-12. [Plan](05-plan-de-implementacion.md) · [Decisiones §9.1.1, §9.3.12–14 y §9.6](../product/decisiones-producto.md).

Desde el detalle de una compra se registra una solicitud pendiente o el resultado confirmado por el emisor. Cada acreditación conserva su fecha y los importes elegidos por medio y categoría. La compra y sus gastos brutos conservan su importe. Resumen muestra las devoluciones recibidas del mes por separado. La devolución de una compra anterior queda fuera de los ingresos y del consumo presupuestario del mes receptor. El caso del mismo mes también conserva los gastos brutos mientras la regla de presupuesto siga abierta.

El débito acreditado suma a Bancos. En crédito el abono reduce deuda y el excedente se registra como saldo a favor. En una compra posterior se puede informar el importe de saldo a favor que aplicó el emisor. Un reintegro del saldo a la cuenta bancaria registra una transferencia por el importe recibido. Las confirmaciones históricas de tarjeta requieren revisión cuando entrarían en conflicto con un ancla o con operaciones dependientes.

Las cancelaciones confirmadas retiran del calendario las cuotas elegidas. Un abono por sí solo conserva ese calendario. Si ambos registros cubren parte del mismo importe, el usuario puede indicarlo para descontar la coincidencia del tope de la devolución una sola vez. Los resúmenes oficiales y las anclas bancarias conservan sus importes. Las correcciones de compras con devoluciones activas requieren revisar primero los registros vinculados. Las compras con obligaciones compartidas quedan fuera de este flujo hasta definir el tratamiento de esas obligaciones. Las acreditaciones se registran en la moneda de la compra.

## Revisión manual

1. Registrar en una compra de débito de un mes anterior una devolución de UYU 500. Revisar el abono en Bancos, la fila separada en el mes receptor y el vínculo a la compra.
2. Registrar una devolución de UYU 300 a una tarjeta con deuda cero. Verificar el saldo a favor. Registrar una compra con UYU 100 de crédito aplicado y un reintegro de UYU 200 a Bancos.
3. En una compra mixta en cuotas con categorías repartidas, registrar una solicitud, confirmar el importe real de cada medio y marcar solo las cuotas canceladas. Verificar las categorías restantes, el calendario y el resumen oficial. Si los dos hechos corresponden al mismo importe, marcar la coincidencia.

## Migración

[0014_F2-09_purchase_refunds.sql](../../src/db/migrations/0014_F2-09_purchase_refunds.sql) agrega registros con claves por titular, RLS forzada y permisos de lectura e inserción. El saldo a favor se proyecta a partir de movimientos confirmados. El runtime conserva su restricción sobre la edición directa de ese saldo.

Destino previsto para la migración: Neon development, base `neondb`, después de 0013. SHA-256 `ba4800b36209437a14e988e7e824f41f11bccfbb8023b2bfd2e2316382887d9a`. La aplicación requiere autorización del SQL y hash según el [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

Siguiente ticket F2-10 · regresión de consistencia, autorización, reintentos y concurrencia.
