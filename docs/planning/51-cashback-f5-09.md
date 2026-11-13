# F5-09 · Cashback bancario (etapa A, Claude)

RF-053 · CA-067 · I-01, I-02, I-10, I-11 e I-12. [Plan](05-plan-de-implementacion.md) · [Decisión 5A, v9.41](../product/decisiones-producto.md). **F5-09 no está cerrado:** esta etapa entrega el cashback independiente. La integración con devoluciones posteriores, consumo presupuestario y el cierre del ticket quedan para Codex.

## Alcance de la etapa A

«Registrar beneficio bancario» anota una recompensa o bonificación **ya acreditada** que no corresponde a una compra concreta. Una devolución identificada de una compra sigue usando el flujo de F2-09.

- **Acreditado en Bancos:** aumenta Bancos de esa moneda en la fecha real y registra un ingreso por beneficio bancario una sola vez.
- **Acreditado como abono en tarjeta de crédito:** reduce la deuda de la tarjeta y el excedente queda como saldo a favor. Registra el mismo ingreso y **no crea ningún depósito en Bancos**. Solo admite fechas iguales o posteriores al último movimiento de la tarjeta; una fecha anterior requiere conciliación.
- La API exige la confirmación explícita `credited: true`. No hay beneficios estimados ni futuros.
- Las compras históricas, las devoluciones, el consumo presupuestario y los resúmenes oficiales no cambian.
- Reintentar el mismo envío devuelve el registro original. La misma clave con otros datos se rechaza. La anulación revierte el efecto con la traza auditada existente. En tarjeta exige que no haya movimientos posteriores.

## Modelo

[0035_F5-09_bank_benefits.sql](../../src/db/migrations/0035_F5-09_bank_benefits.sql) agrega el tipo de evento `bank_benefit` y la tabla `finance.bank_benefits` con RLS forzada, lectura e inserción. El importe monetario de Bancos usa `bank_effects` y el de tarjetas usa `credit_lines` y `card_credit_changes`, igual que las devoluciones. La migración también agrega la tabla a la copia de cuenta (`account_backup_tables`) y renueva la huella de diseño. De lo contrario, la copia y la restauración de F5-07 fallarían.

Destino previsto: Neon development, base `neondb`, después de 0034. SHA-256 `1cb4c47b9ec79fdc3fe8536cd3d90a8280c641e1cbde0c111b00e6b965e1f3d5`. **No se aplicó a Neon.** Requiere autorización del SQL exacto y su hash según el [ADR 0004](../adr/0004-google-only-allowlist-auth.md). Verificada en PostgreSQL 17 desechable con las suites de integración.

## Dónde se ve

- `/beneficios`: formulario con revisión previa y lista de beneficios con anulación.
- Historial: tipo «Beneficio bancario», filtros de moneda, importe, fecha, medio y estado; detalle con anulación.
- Resumen: el ingreso del mes de acreditación incluye el beneficio.
- Estadísticas e Informes: se cuenta como ingreso sin categoría.

## Revisión manual

1. Con un saldo bancario UYU, registrar un beneficio de UYU 300 acreditado en Bancos. Verificar Bancos +300, un solo ingreso en el mes y que las compras de meses anteriores no cambien.
2. Con una tarjeta con deuda de UYU 1.000, registrar un abono de UYU 300 y luego uno de UYU 800. Verificar deuda 0, saldo a favor 100 y Bancos sin cambios.
3. Anular en orden inverso y comprobar que se restablecen deuda, saldo a favor e ingreso.

Siguiente: Codex cierra F5-09 con la integración financiera pendiente.
