# F2-04 · Ciclos y resúmenes de tarjeta

RF-017, componente de vencimientos de RF-037 y CA-023. Aplica las decisiones de producto §9.3 a §9.3.7, §9.3.10 y §9.3.11. Preserva I-01, I-02, I-10, I-11 e I-12 y el aislamiento del ADR 0004.

## Contrato

- El ciclo se identifica por el mes de cierre de la tarjeta. Una compra de un pago efectuada el día de cierre se estima en ese ciclo y una posterior en el siguiente si hay fechas suficientes. Un día habitual que no existe en el mes cae en el último día. El día habitual de vencimiento corresponde al mes del cierre o al siguiente según el orden de ambas fechas habituales. Si un cierre excepcional vuelve incoherente esa fecha estimada, se muestra el vencimiento como desconocido hasta informarlo.
- Cada cuota parte del mes de su plan. La reasignación al resumen se aplica a una compra de un pago o a una sola cuota y se puede revertir. Si el ciclo de origen o destino ya tiene un total oficial o pagos, se exige confirmación de la revisión. El gasto, su fecha y categoría, el plan y la deuda se conservan.
- El detalle por moneda separa deuda total, estimación, importe oficial, mínimo y pagos registrados en el ciclo. Una diferencia permanece visible hasta que los importes coincidan. Registrar o editar un resumen solo agrega una revisión de metadatos.
- El aviso interno de Tarjetas se calcula con el remanente de cada tarjeta, ciclo y moneda. El importe oficial prevalece sobre el estimado. La fecha oficial de la moneda prevalece sobre la fecha excepcional del ciclo y la habitual estimada. Se muestra desde la antelación configurada (tres días por defecto) mientras haya remanente registrado. Al cubrir el mínimo se vuelve informativo. Si se anula el pago, el aviso vuelve a calcularse. Las fechas estimadas pueden diferir de las bancarias.
- Registrar un pago desde el ciclo usa el formulario de crédito existente, con remanentes editables y selección explícita del saldo bancario. Solo el guardado del pago real afecta Bancos y deuda. Los pagos anteriores a la migración y los registrados fuera de un ciclo conservan su efecto financiero y quedan sin imputación al resumen. El centro transversal y el push opcional corresponden a F4-05.

## Migración y permisos

[`0010_F2-04_card_cycles.sql`](../../src/db/migrations/0010_F2-04_card_cycles.sql) agrega revisiones por titular con RLS forzada y permisos de lectura e inserción, una vista con permisos del invocador y un mes de resumen opcional en las líneas de pago. El SQL no incluye actualización de filas históricas. Las llaves incluyen titular, tarjeta y moneda cuando corresponde. El hash de comando y la versión esperada protegen reintentos y escrituras concurrentes.

SHA-256 de `0010` según `npm run db:plan` · `cd829c24be9ad2fcd8b3fd46ae29d0fa56e25b6e8018c88d16ee270ac1e5579d`.

El historial de Neon `development` (`dry-voice-45959315`, `br-late-feather-b6czfkx0`, `neondb`) se verificó por lectura. Registra `0001` a `0009` con los hashes versionados. `0010` se probó en PostgreSQL 17.6 desechable, incluida una actualización desde `0009` con datos sintéticos y rollback. Para aplicar el SQL exacto en Neon development se requiere autorización expresa del hash, según el migrador del repositorio y el ADR 0004.

## Revisión manual

1. Abrir **Tarjetas → Resúmenes y ciclos** de una tarjeta de crédito. Configurar cierre 25, vencimiento 10 y tres días de anticipación. Registrar compras reales o sintéticas en el entorno de prueba antes y después del cierre.
2. Ingresar un total oficial de 5.500 UYU frente a una estimación de 4.000 UYU y un mínimo de 1.000 UYU. Comprobar la diferencia de +1.500 UYU y el aviso único por moneda, con vencimiento y remanente del ciclo.
3. Cambiar una fecha excepcional y reasignar una compra desde **Revisar mis compras**. Comprobar que se conserva la cifra oficial y que la diferencia se recalcula.
4. Desde el aviso, registrar un pago real de 1.000 UYU y elegir el saldo bancario efectivamente usado. Verificar que el aviso pasa a informativo con 4.500 UYU restantes, que el pago aparece en el historial del ciclo y que el gasto original se conserva.

Siguiente ticket del plan · **F2-05**, compra con dos medios, porción de crédito financiada y categorías repartidas.
