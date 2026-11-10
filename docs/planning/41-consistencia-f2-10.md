# Consistencia, autorización y concurrencia en F2-10

**Ruta MIX.** OpenCode preparó el inventario, los fixtures sintéticos y las primeras pruebas. Codex completó la auditoría y la regresión en la misma rama.

**Trazabilidad:** F2 de [plan de implementación](05-plan-de-implementacion.md) — I-02, I-04, I-05, I-06, I-11 e I-12 de [modelo de dominio](02-modelo-de-dominio-y-datos.md) — R-05 de [riesgos](06-riesgos-y-pendientes.md) — [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

## Alcance

La cobertura de F2-10 se concentra en tres archivos.

- `tests/support/f2-10-fixtures.mjs` define los titulares, importes y comandos sintéticos.
- `tests/unit/f2-10-invariants.test.mjs` verifica los contratos de entrada.
- `tests/integration/f2-10-consistency.test.mjs` verifica las operaciones y el esquema con PostgreSQL real.

## Inventario de invariantes y cobertura

| Invariante | Efecto observable esperado | Dónde se aplica | Cobertura previa | Prueba F2-10 |
|---|---|---|---|---|
| **I-02** tarjeta | La compra aumenta deuda; el pago parcial resta deuda y banco sin crear gasto; nunca queda deuda negativa ni se paga más que la deuda disponible en esa fecha. | `src/server/credit-operations.ts` (`action === "payment"`, `minimumDebtFrom`), `src/server/bank-balances.ts` | `tests/integration/credit-installments.test.mjs`, `tests/integration/card-cycles.test.mjs`, `tests/integration/shared-expenses.test.mjs` | pago parcial, reintento, sobrepago, carrera por el saldo restante y banco insuficiente |
| **I-04** préstamo | Entregar capital resta banco y crea derecho por cobrar; cobrar capital aumenta banco y reduce el derecho; ninguno es ingreso/gasto ordinario. El cobro parcial no supera el pendiente. | `src/server/loans.ts` (`settle`, `openingEffects`, `changeEffects`) | `tests/integration/loans.test.mjs`, `tests/integration/shared-expenses.test.mjs` | alta, cobro parcial, reintento, sobrecobro y carrera con `expectedVersion` |
| **I-05** gasto compartido | Banco registra el total una vez; el gasto de consumo muestra solo la parte propia; cada parte ajena queda por cobrar y su cobro no crea ingreso. | `src/domain/shared-expenses.ts`, `src/server/shared-expenses.ts`, `src/server/loans.ts` | `tests/integration/shared-expenses.test.mjs` | partición exacta, cobro concurrente y sobrecobro de una parte ajena |
| **I-06** dos medios | Débito + crédito suman el total; cada medio y cada categoría reflejan solo su porción, sin duplicar el importe estadístico. | `src/domain/credit-operations.ts` (`mixedPurchase`) | `tests/integration/mixed-purchases.test.mjs` | importe exacto y rollback de ambas porciones |
| **I-11** reintentos | La misma `idempotency_key` no multiplica efectos; dos envíos concurrentes dejan un solo efecto confirmado; un fallo no deja media operación. | `findReplay`, `lockBankWrites`, `lockCardWrites`, transacciones `withOwnerTransaction` | `tests/integration/bank-balances.test.mjs`, `tests/integration/movements.test.mjs`, `tests/integration/movement-revisions.test.mjs`, `tests/integration/shared-expenses.test.mjs` | reintentos de pago y cobro, débito competitivo entre módulos, carrera de reembolsos |
| **I-12** aislamiento | `owner_id` de evento, tarjeta, préstamo y relación debe coincidir; un titular B no puede leer ni escribir por ID externo de A. | `setOwnerContext` + RLS forzada, filtros `owner_id` en cada consulta, `withOwnerTransaction` | `tests/integration/schema.test.mjs`, pruebas A/B de cada integración F2 | RLS y claves foráneas por titular en tablas de F2, comandos sin `ownerId` inyectable |

## Fixtures sintéticos

`tests/support/f2-10-fixtures.mjs` centraliza datos que no provienen de ninguna cuenta real:

- dos titulares sintéticos por escenario (`consistencyOwners`);
- saldo bancario de apertura, compra, pago parcial, deuda restante, sobrepago, gasto compartido y préstamo;
- comandos crudos para `parseCreditCommand`, `parseLoanCommand`, `parseSharedExpense` y `parseRefundCommand`;
- claves de idempotencia nuevas por comando, salvo cuando la prueba necesita repetir la misma clave.

## Escenarios verificados

1. **Pago parcial de tarjeta:** compra 1.000, pago 400; deuda 600, banco 9.600, gasto 1.000 sin cambios.
2. **Reintento idempotente concurrente:** mismo comando y clave dos veces; una respuesta `created`, otra `replayed`; un solo efecto.
3. **Sobrepago:** pago 700 sobre deuda 600; `conflict`; deuda y banco no cambian.
4. **Carrera por el saldo restante:** dos pagos distintos de 600 sobre deuda 600; uno `created`, otro `conflict`; deuda 0 y banco 9.000.
5. **Banco insuficiente:** un pago de tarjeta y un préstamo compiten por los últimos 300 de Bancos. El pago gana y el préstamo se rechaza sin registrar una obligación. La deuda restante de 700 sigue vigente con banco 0.
6. **Préstamo parcial:** entrega 1.000; cobro parcial 400; pendiente 600; banco 9.400; sin ingreso/gasto.
7. **Reintento y carrera de cobro:** mismo reintento produce `created` + `replayed`. Dos cobros distintos de 300 sobre un pendiente de 600 comparten `expectedVersion` 2. Solo se confirma uno, aunque todavía hay margen para el segundo.
8. **Gasto compartido:** 4.000 pagados por banco, parte propia 1.000 y tres derechos de 1.000; cobros concurrentes de 800 dejan un solo cobro, pendiente 200 y banco 6.800; el gasto sigue en 1.000.
9. **Compra mixta y rollback:** un trigger de prueba fuerza el fallo al vincular la compra, después de registrar las dos porciones. Bancos, deuda y gasto conservan sus valores previos. La misma clave puede completar la compra y un nuevo reintento devuelve el mismo ID.
10. **Reembolso posterior:** dos acreditaciones de 750 compiten por una compra mixta de 1.000. Solo se confirma una. En febrero se registran 300 en Bancos y 450 de reducción de deuda. El reembolso se informa por separado y se conservan los totales de compras.
11. **Autorización A/B:** B no puede operar sobre tarjeta, préstamo, gasto compartido ni devolución de A. Con el rol `finanzas_app`, las lecturas SQL sin filtro de titular respetan RLS y las escrituras cruzadas fallan por política de acceso o clave foránea.
12. **Contratos:** claves normalizadas a minúsculas, rechazo de `ownerId` inyectado e importes cero, negativos o con más de cuatro decimales, y suma exacta de partes y medios.

En las carreras instrumentadas, la primera conexión conserva su transacción abierta hasta que PostgreSQL informa que la segunda espera su lock consultivo. Después del commit se comprueban el resultado, los saldos exactos y la traza. La auditoría verificó que las operaciones de crédito y devoluciones toman el lock de Bancos antes del de tarjeta, y que préstamos y gastos compartidos toman el mismo lock de Bancos por titular.

## Verificación local

- `npm run test:unit` aprobó 34 pruebas.
- `npm run test:integration` aprobó 59 pruebas en PostgreSQL 17.6 desechable en loopback, con la [guarda de pruebas](../testing.md#postgresql-desechable).
- Playwright aprobó 20 pruebas financieras y 18 de acceso y navegación en Chromium, con resoluciones de escritorio y móvil.
- Formato, ESLint, tipos y compilación aprobados. Next.js requirió ejecutar la compilación fuera del sandbox por un error de permisos de Windows durante el prerender.

El cambio está acotado a pruebas y documentación. El esquema y el trigger de prueba se ejecutaron en el clúster desechable. La aceptación con cuentas Google reales por HTTPS de ADR 0004 sigue pendiente antes del uso con datos reales.
