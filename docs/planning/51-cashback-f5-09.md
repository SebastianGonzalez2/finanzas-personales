# F5-09 · Reembolsos de meses anteriores y cashback bancario

RF-047 y RF-053 · CA-028 y CA-067 · I-01, I-02, I-08, I-10, I-11 e I-12. [Plan](05-plan-de-implementacion.md) · [Decisiones v9.41 y v9.42](../product/decisiones-producto.md) · [Contrato F2-09](40-devoluciones-f2-09.md).

## Registro de beneficios · etapa A de Claude

«Registrar beneficio bancario» anota una recompensa o bonificación **ya acreditada** que no corresponde a una compra concreta. Una devolución identificada de una compra sigue usando el flujo de F2-09.

- **Acreditado en Bancos:** aumenta Bancos de esa moneda en la fecha real y registra un ingreso por beneficio bancario una sola vez.
- **Acreditado como abono en tarjeta de crédito:** reduce la deuda de la tarjeta y el excedente queda como saldo a favor. Registra el mismo ingreso y **no crea ningún depósito en Bancos**. Solo admite fechas iguales o posteriores al último movimiento de la tarjeta; una fecha anterior requiere conciliación.
- La API exige la confirmación explícita `credited: true`. No hay beneficios estimados ni futuros.
- Las compras históricas, las devoluciones, el consumo presupuestario y los resúmenes oficiales no cambian.
- Reintentar el mismo envío devuelve el registro original. La misma clave con otros datos se rechaza. La anulación revierte el efecto con la traza auditada existente. En tarjeta exige que no haya movimientos posteriores.

## Integración financiera · etapa B de Codex

- La acreditación vinculada usa el evento de F2-09. Si una compra de Ropa de enero por UYU 2.000 recibe UYU 500 en febrero, enero conserva UYU 2.000. Con UYU 3.000 de compras de Ropa y un límite de UYU 5.000 en febrero, el presupuesto muestra UYU 3.000 consumidos y UYU 2.000 restantes. Resumen, Estadísticas e Informes muestran UYU 500 de devolución en febrero. Bancos o tarjeta recibe solo el importe acreditado en ese medio.
- El informe exporta el identificador de la compra original y los medios que intervinieron en el reembolso. La solicitud completada queda como traza en el Historial y el informe de movimientos incluye su acreditación efectiva.
- La parte del cashback que reduce deuda entra en la estimación del ciclo por fecha de acreditación. Los informes muestran los abonos de la estimación junto con compras, pagos y remanente. El emisor sigue siendo la fuente del resumen oficial y del mínimo. El cashback se aplica a la deuda total de la tarjeta y la asignación por compra sigue requiriendo un vínculo explícito.
- Historial permite encontrar un beneficio por etiqueta y con el filtro «Sin categoría». La clasificación admite etiquetas para beneficios.

## Modelo

[0035_F5-09_bank_benefits.sql](../../src/db/migrations/0035_F5-09_bank_benefits.sql) agrega el tipo de evento `bank_benefit` y la tabla `finance.bank_benefits` con RLS forzada, lectura e inserción. El importe monetario de Bancos usa `bank_effects` y el de tarjetas usa `credit_lines` y `card_credit_changes`, igual que las devoluciones. La migración también agrega la tabla a la copia de cuenta (`account_backup_tables`) y renueva la huella de diseño. De lo contrario, la copia y la restauración de F5-07 fallarían.

Destino previsto en Neon development, base `neondb`, después de 0034. SHA-256 `1cb4c47b9ec79fdc3fe8536cd3d90a8280c641e1cbde0c111b00e6b965e1f3d5`. La aplicación en Neon está pendiente de autorización específica según el [ADR 0004](../adr/0004-google-only-allowlist-auth.md). La integración verificó el SQL en PostgreSQL 17.6 desechable. Los respaldos del esquema 0034 requieren compatibilidad de esquema para restaurarse después de 0035, por el cambio en la huella del inventario.

## Dónde se ve

- `/beneficios`: formulario con revisión previa y lista de beneficios con anulación.
- Historial: tipo «Beneficio bancario», filtros de moneda, importe, fecha, medio y estado; detalle con anulación.
- Resumen: el ingreso del mes de acreditación incluye el beneficio.
- Estadísticas e Informes: se cuenta como ingreso sin categoría.

## Verificación de la etapa B

- `npm run test:unit` · 121 pruebas aprobadas. `npm run test:integration` · 107 aprobadas en PostgreSQL local. Incluyen el caso conjunto de CA-028 y CA-067 en dos meses, presupuesto, historial, estadísticas, informes, aislamiento A/B, anulación y dos conexiones concurrentes con la misma clave.
- `npm run test:e2e:finance -- bank-benefits.spec.mjs refunds.spec.mjs card-cycles.spec.mjs exports.spec.mjs statistics.spec.mjs budgets.spec.mjs` · 14 pruebas aprobadas en Chromium de escritorio y móvil con sesiones sintéticas. Se revisaron las capturas del formulario de confirmación y la lista de beneficios.
- `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm run build` aprobados.

## Revisión manual

1. Con un saldo bancario UYU, registrar un beneficio de UYU 300 acreditado en Bancos. Verificar Bancos +300, un solo ingreso en el mes y que las compras de meses anteriores no cambien.
2. Con una tarjeta con deuda de UYU 1.000, registrar un abono de UYU 300 y luego uno de UYU 800. Verificar deuda 0, saldo a favor 100 y Bancos sin cambios.
3. Anular en orden inverso y comprobar que se restablecen deuda, saldo a favor e ingreso.
4. Acreditar en febrero una devolución de la compra de enero y abrir el detalle desde Historial. Comparar presupuesto y compras de ambos meses, revisar el desglose de Estadísticas y exportar febrero para comprobar la referencia a la compra original.

Siguiente ticket del plan F6-01 · auditoría de criterios de aceptación. La validación HTTPS con cuentas Google reales sigue pendiente antes del uso financiero real.
