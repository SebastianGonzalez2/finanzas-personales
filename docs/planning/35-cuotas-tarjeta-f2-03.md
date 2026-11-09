# F2-03 — Compras en cuotas y distribución mensual

**Trazabilidad** · RF-016, CA-022, I-01/I-02/I-10/I-11/I-12. [Plan](05-plan-de-implementacion.md) · [Decisiones del producto §9.5](../product/decisiones-producto.md#95-compras-con-tarjeta-de-crédito-en-cuotas--confirmado-detalles-operativos-pendientes).

## Reglas verificables

- Desde **Tarjetas → Registrar compra** o **Resumen → Nueva transacción → Compra con tarjeta de crédito**, elegí **Compra en cuotas iguales**. El total financiado se calcula con decimales exactos a partir del importe fijo y la cantidad. El formulario admite de 2 a 120 cuotas y un mes inicial elegido por el titular.
- El cargo informado al alta aumenta la deuda únicamente por el importe confirmado. Si ya se incluyó en una referencia de deuda, queda registrado como parte de la compra y se conserva la referencia. Si todavía no figura un cargo, se puede guardar solo el plan. Bancos se debita al registrar un pago real.
- **Resumen → Mes del reporte** incluye una cuota en cada mes vigente, en su moneda y categoría original. Una compra de tres cuotas de 2.000 UYU muestra 2.000 UYU en enero, febrero y marzo cuando empieza en enero. El total financiado y el capital del pago de tarjeta quedan fuera del cálculo de gastos. Los meses futuros muestran una proyección.
- El detalle de la compra permite corregir el importe fijo, la cantidad y el mes inicial. Cada corrección recalcula el reporte con la versión vigente y conserva las anteriores, el cargo informado y los pagos. La versión esperada evita sobrescribir una corrección simultánea.
- Para una cancelación anticipada confirmada por el emisor, elegí el primer mes futuro cancelado. El reporte deja de incluir esa cuota y las siguientes. La cantidad original queda fija tras una cancelación para preservar los números de cuota. Los cambios efectivos de saldo del emisor se registran en **Actualizar deuda**. Una anulación completa por error de registro usa las validaciones y la traza de F2-02.

## Persistencia y permisos

La [migración 0009](../../src/db/migrations/0009_F2-03_credit_installments.sql) agrega versiones de solo inserción con RLS forzada y FK por titular, compra y moneda. El calendario se deriva de la versión vigente. La vista `credit_expenses` usa los importes por mes para compras en cuotas y conserva las compras simples y comisiones previas. Crear el plan, registrar el cargo y guardar auditoría se ejecutan en una sola transacción. Las revisiones comparten claves de idempotencia y bloqueos con las operaciones de crédito.

SHA-256 de `0009` según `npm run db:plan` · `62d651906d4c40649fcffe87c896161f7ce247f2e9bd9b98f26f64a030446128`. La migración se probó en PostgreSQL 17.6 desechable. Su aplicación en Neon development requiere las migraciones previas y autorización del SQL exacto para ese destino. R-13 y R-19 siguen abiertos para el uso con datos reales.

## Revisión local

1. Prepará el [PostgreSQL desechable](../testing.md#postgresql-desechable). Ejecutá `npm run build` y `npm run test:e2e:finance -- --grep F2-03`.
2. Registrá tres cuotas de 2.000 UYU con cargo confirmado de 2.000 UYU y verificá que **Tarjetas** muestre la deuda de 2.000 UYU y el total financiado de 6.000 UYU. Revisá los tres meses en **Resumen** y comprobá que Bancos conserve su saldo.
3. Desde **Tarjetas → Compras en cuotas**, abrí la compra, mové el mes inicial y revisá el reporte anterior y el nuevo. Registrá una cancelación desde un mes futuro y verificá el calendario, el reporte y el historial de versiones.

| Comando | Resultado local |
| --- | --- |
| `npm run check` | Formato, lint, tipos y build correctos |
| `npm run test:unit` | 26/26 |
| `npm run test:integration` | 49/49 en PostgreSQL 17.6 desechable |
| `npm run test:e2e` | 18/18 en Chromium |
| `npm run test:e2e:finance` | 8/8 en Chromium de escritorio (1440 × 900) y móvil (390 × 844), con sesiones sintéticas |

Playwright guarda capturas del alta, del reporte mensual y del detalle auditado en `test-results`. La integración verifica el cargo exacto, el pago sin gasto duplicado, la migración desde F2-02, el aislamiento entre titulares, los reintentos y el rechazo de ediciones obsoletas.

El siguiente ticket es **F2-04**, que incorpora los ciclos del emisor, los importes oficiales, las estimaciones, las alertas y la conciliación de ciclo.
