# F2-02 — Compras y pagos de tarjeta de crédito

**Trazabilidad** · F2 · RF-015, deuda inicial de RF-017 y pagos de RF-018 · CA-020, CA-021 y parte contable de CA-024 · I-02, I-10, I-11 e I-12. [Plan](05-plan-de-implementacion.md) · [Criterios](03-criterios-de-aceptacion.md) · [Decisiones §9.2](../product/decisiones-producto.md).

## Reglas verificables

- Una compra simple aumenta la deuda en la moneda del cargo y se reconoce como gasto en la fecha de compra. Está disponible desde **Tarjetas** y desde **Resumen → Nueva transacción**. Una compra ya incluida en una confirmación de deuda puede registrarse para completar el detalle de gastos y conserva la deuda confirmada.
- Al crear la tarjeta se pueden informar deudas iniciales por moneda con una fecha de referencia. **Actualizar deuda** registra la diferencia no clasificada. Ambos flujos conservan una referencia de deuda y tienen efecto exclusivamente sobre el pasivo.
- Un pago reduce la deuda por moneda y registra la salida efectiva del banco. Puede cubrir una o más monedas de la misma tarjeta en una sola confirmación. Si se usa otra moneda bancaria se conserva el importe efectivamente debitado y la tasa derivada es informativa. Las líneas que usan el mismo saldo bancario se agrupan en un solo débito. Una comisión explícita se reconoce como gasto bancario una vez.
- Se puede asignar manualmente parte o todo un pago a compras de la misma tarjeta y moneda. La parte sin asignación queda como cancelación de deuda general. El detalle del historial distingue pago parcial de deuda saldada al guardar y conserva los importes, la comisión y las asignaciones.
- En **Historial** se puede anular una compra o un pago y volver a registrar el dato correcto. Los registros originales y las referencias confirmadas posteriores se conservan. Una compra que respalda pagos vigentes requiere revisar esos pagos antes de anularla. Para actualizar deuda se exige una fecha igual o posterior al último movimiento con efecto en la posición. Para pagos se valida que la fecha y el importe sean compatibles con la referencia y el saldo de deuda, y que haya fondos en el saldo bancario afectado.

## Persistencia y autorización

[La migración 0008](../../src/db/migrations/0008_F2-02_credit_operations.sql) amplía los eventos financieros y agrega operaciones de crédito, sus líneas, asignaciones y una vista de gastos con RLS aplicada en las tablas de origen. Las relaciones incluyen titular, tarjeta y moneda. El servicio reutiliza la sesión Google, los bloqueos de escritura de Bancos y Tarjetas, y la auditoría de anulaciones. La clave de idempotencia y el hash cubren el comando completo. Se valida cada línea antes de guardar, dentro de la misma transacción que actualiza la deuda y registra los efectos bancarios. Los checkpoints bancarios mantienen las reglas de F1-05.

El plan local `npm run db:plan` calcula el hash sin conectarse. El SHA-256 de `0008` es `55dd7e2070c5c08a4060c6c06a3263354f4f09f222918df2024a63bac7b35c84`. La aplicación a Neon development sigue pendiente y requiere las migraciones previas, incluida `0007`, y autorización del hash. La prueba de HTTPS con dos dispositivos y cuentas Google reales sigue pendiente según R-13 y R-19.

## Revisión reproducible

1. Iniciá el [PostgreSQL desechable](../testing.md#postgresql-desechable) y configurá las variables de prueba. Ejecutá `npm run build` y `npm run test:e2e:finance -- --grep F2-02`.
2. Con Bancos UYU en 10.000, creá una tarjeta UYU/USD con deuda inicial de 100 USD. Registrá una compra de 3.000 UYU. Bancos UYU sigue en 10.000 y el gasto mensual sube a 3.000 UYU.
3. Pagá 1.000 UYU de deuda y 40 USD con un débito real de 1.680 UYU y una comisión explícita de 20 UYU. Quedan 7.300 UYU en Bancos, deudas de 2.000 UYU y 60 USD, y gastos del mes de 3.020 UYU. En Historial abrí el pago para ver el desglose.
4. Pagá los restantes 2.000 UYU y 60 USD, estos últimos con 2.520 UYU. Bancos queda en 2.780 UYU, las deudas quedan en cero y los gastos siguen en 3.020 UYU. Anulá ese pago para verificar la reversión auditada.

## Verificación local

| Comando | Resultado |
| --- | --- |
| `npm run check` | Formato, ESLint, TypeScript y build correctos |
| `npm run test:unit` | 25/25 |
| `npm run test:integration` | 48/48 en PostgreSQL 17.6 desechable |
| `npm run test:e2e` | 18/18 en Chromium de escritorio y móvil |
| `npm run test:e2e:finance` | 6/6 en Chromium de escritorio (1440 × 900) y móvil (390 × 844) |

El recorrido autenticado usa sesiones sintéticas validadas por Better Auth y verifica el acceso cruzado A/B, el rechazo de un pago que supera el banco, el reintento concurrente, el gasto mensual y la anulación. Playwright guarda una captura del formulario de pago en cada tamaño. La revisión de la migración incluye el historial anterior y la autorización por hash.

## Siguientes incrementos

F2-03 agrega cuotas. F2-04 incorpora ciclos, resumen y mínimo oficial, incluido el estado por mínimo de CA-024. Los fondos reservados corresponden a F3. Las compras de este incremento registran el cargo confirmado en la moneda de deuda.
