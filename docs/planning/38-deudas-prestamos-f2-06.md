# F2-06 · Deudas y préstamos

**RF-022/023 · CA-030/031/032 · I-04/10/11/12.** Reglas de [decisiones §9.4.1–§9.4.2](../product/decisiones-producto.md) y [plan F2](05-plan-de-implementacion.md).

- El alta de una obligación existente conserva el saldo registrado. Entregar o recibir capital registra el efecto bancario en la moneda de la obligación en la misma transacción.
- Un pago o cobro simple reduce el pendiente. Un pago de cuota sin desglose registra la salida bancaria y deja el saldo pendiente de conciliación. Con desglose completo, el capital reduce la deuda y los cargos informados cuentan en los gastos mensuales.
- El interés real devengado de una deuda simple aumenta el pendiente y se incluye una sola vez en los gastos del mes. Un pago parcial indica cuánto abona de ese interés. Al saldar la deuda se puede aplicar el saldo conocido de interés automáticamente.
- Actualizar el pendiente registra el antes y el después, y cierra la conciliación sin efecto en Bancos ni en gastos. Cada obligación se registra en orden de fecha efectiva, con la misma fecha permitida. Esto evita aplicar un pago anterior otra vez después de una actualización del saldo. Los efectos bancarios siguen el orden y las anclas de F1-05.
- Un préstamo simple entregado puede guardar un total pactado distinto del capital histórico. Se cobra el importe real y se mantiene separado de los ingresos ordinarios, según v9.43 y R-09.

La [migración 0012](../../src/db/migrations/0012_F2-06_loans.sql) agrega dos tablas con relaciones por titular, RLS forzada y permisos de lectura e inserción. Usa el evento, la auditoría y el bloqueo bancario existentes. La versión esperada protege ante operaciones concurrentes y la clave idempotente conserva el resultado ante reintentos.

**Destino previsto:** Neon `development`, base `neondb`, después de `0011`. SHA-256 `3d1ec927efd36399796f08bd78b2e5d5f4adb7e26c55eb15c16520ba4f264325`. La migración se probó en PostgreSQL 17.6 desechable. Su aplicación en Neon requiere autorización del SQL exacto según el [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Siguiente:** F2-07, pago y cobro en otra moneda con ambos importes confirmados. Los avisos por fecha conocida corresponden a F4-05.
