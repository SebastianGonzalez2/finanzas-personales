# Consistencia, autorización y concurrencia en F2-10

**Fecha:** 2026-11-10. **Ruta:** MIX. **Alcance de esta rama:** inventario de invariantes, fixtures sintéticos y pruebas iniciales preparadas por OpenCode. **No cierra F2-10 ni la puerta de F2.**

**Trazabilidad:** F2 de [plan de implementación](05-plan-de-implementacion.md) — I-02, I-04, I-05, I-06, I-11 e I-12 de [modelo de dominio](02-modelo-de-dominio-y-datos.md) — R-05 de [riesgos](06-riesgos-y-pendientes.md) — [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

## Límite de la ruta MIX

OpenCode preparó, sin conexión a Neon ni credenciales:

- el inventario de invariantes y escenarios de riesgo de abajo;
- fixtures sintéticos en `tests/support/f2-10-fixtures.mjs`;
- pruebas unitarias de contratos en `tests/unit/f2-10-invariants.test.mjs`;
- pruebas iniciales de integración en `tests/integration/f2-10-consistency.test.mjs`.

Codex debe continuar en esta misma rama con **Sol High** para auditar las aserciones, ejecutar la integración contra PostgreSQL desechable, completar los casos de locks/atomicidad/RLS que falten, corregir la implementación si alguna prueba revela un fallo y abrir la PR. Las pruebas de integración nuevas **no se ejecutaron en esta pasada**: no hay Docker ni PostgreSQL local en `127.0.0.1:55432`. No se aplicaron migraciones ni se modificó Neon.

## Inventario de invariantes y cobertura

| Invariante | Efecto observable esperado | Dónde se aplica | Cobertura previa | Prueba F2-10 |
|---|---|---|---|---|
| **I-02** tarjeta | La compra aumenta deuda; el pago parcial resta deuda y banco sin crear gasto; nunca queda deuda negativa ni se paga más que la deuda disponible en esa fecha. | `src/server/credit-operations.ts` (`action === "payment"`, `minimumDebtFrom`), `src/server/bank-balances.ts` | `tests/integration/credit-installments.test.mjs`, `tests/integration/card-cycles.test.mjs`, `tests/integration/shared-expenses.test.mjs` | pago parcial, reintento, sobrepago, carrera por el saldo restante y banco insuficiente |
| **I-04** préstamo | Entregar capital resta banco y crea derecho por cobrar; cobrar capital aumenta banco y reduce el derecho; ninguno es ingreso/gasto ordinario. El cobro parcial no supera el pendiente. | `src/server/loans.ts` (`settle`, `openingEffects`, `changeEffects`) | `tests/integration/loans.test.mjs`, `tests/integration/shared-expenses.test.mjs` | alta, cobro parcial, reintento, sobrecobro y carrera con `expectedVersion` |
| **I-05** gasto compartido | Banco registra el total una vez; el gasto de consumo muestra solo la parte propia; cada parte ajena queda por cobrar y su cobro no crea ingreso. | `src/domain/shared-expenses.ts`, `src/server/shared-expenses.ts`, `src/server/loans.ts` | `tests/integration/shared-expenses.test.mjs` | partición exacta, cobro concurrente y sobrecobro de una parte ajena |
| **I-06** dos medios | Débito + crédito suman el total; cada medio y cada categoría reflejan solo su porción, sin duplicar el importe estadístico. | `src/domain/credit-operations.ts` (`mixedPurchase`) | `tests/integration/mixed-purchases.test.mjs` | suma exacta del total, porciones por medio y categorías repetidas |
| **I-11** reintentos | La misma `idempotency_key` no multiplica efectos; dos envíos concurrentes dejan un solo efecto confirmado; un fallo no deja media operación. | `findReplay`, `lockBankWrites`, `lockCardWrites`, transacciones `withOwnerTransaction` | `tests/integration/bank-balances.test.mjs`, `tests/integration/movements.test.mjs`, `tests/integration/movement-revisions.test.mjs`, `tests/integration/shared-expenses.test.mjs` | reintento concurrente de pago de tarjeta y de cobro de préstamo (`created` + `replayed`) |
| **I-12** aislamiento | `owner_id` de evento, tarjeta, préstamo y relación debe coincidir; un titular B no puede leer ni escribir por ID externo de A. | `setOwnerContext` + RLS forzada, filtros `owner_id` en cada consulta, `withOwnerTransaction` | `tests/integration/schema.test.mjs`, pruebas A/B de cada integración F2 | tarjeta y préstamo invisibles/inmutables para B; comandos sin `ownerId` inyectable |

## Fixtures sintéticos

`tests/support/f2-10-fixtures.mjs` centraliza datos que no provienen de ninguna cuenta real:

- dos titulares sintéticos por escenario (`consistencyOwners`);
- saldo bancario de apertura, compra, pago parcial, deuda restante, sobrepago, gasto compartido y préstamo;
- comandos crudos para `parseCreditCommand`, `parseLoanCommand`, `parseSharedExpense` y `parseRefundCommand`;
- claves de idempotencia nuevas por comando, salvo cuando la prueba necesita repetir la misma clave.

## Escenarios cubiertos por las pruebas iniciales

1. **Pago parcial de tarjeta:** compra 1.000, pago 400; deuda 600, banco 9.600, gasto 1.000 sin cambios.
2. **Reintento idempotente concurrente:** mismo comando y clave dos veces; una respuesta `created`, otra `replayed`; un solo efecto.
3. **Sobrepago:** pago 700 sobre deuda 600; `conflict`; deuda y banco no cambian.
4. **Carrera por el saldo restante:** dos pagos distintos de 600 sobre deuda 600; uno `created`, otro `conflict`; deuda 0 y banco 9.000.
5. **Banco insuficiente:** deuda válida de 700 con banco 0; `conflict`; la deuda no se reduce ni el banco queda negativo.
6. **Préstamo parcial:** entrega 1.000; cobro parcial 400; pendiente 600; banco 9.400; sin ingreso/gasto.
7. **Reintento y carrera de cobro:** mismo reintento produce `created` + `replayed`; dos cobros distintos de 600 con `expectedVersion` 2 producen uno `created` y uno `conflict`; pendiente 0.
8. **Gasto compartido:** 4.000 pagados por banco, parte propia 1.000 y tres derechos de 1.000; cobros concurrentes de 800 dejan un solo cobro, pendiente 200 y banco 6.800; el gasto sigue en 1.000.
9. **Autorización A/B:** B no ve la tarjeta ni el préstamo de A y recibe `not-found` al intentar operar con sus IDs.
10. **Contratos:** claves normalizadas a minúsculas; `ownerId` inyectado rechazado; importes nulos, negativos o con precisión distinta de cuatro decimales rechazados en pago, cobro y devolución; suma exacta de partes y de medios.

## Verificación ejecutada en esta rama

- `node --check` sobre los tres archivos nuevos: sin errores de sintaxis.
- `npm run test:unit`: **34/34 pruebas aprobadas** (30 previas + 4 nuevas).
- `npm run test:integration` y E2E: **no ejecutados** por falta de PostgreSQL desechable/Docker en esta máquina. No se declaran aprobados.

## Pendiente para Codex (cierre de F2-10)

1. Ejecutar la suite completa contra PostgreSQL local desechable (`TEST_DATABASE_CONFIRM=isolated-local-test`, URL documentada) y confirmar que `tests/integration/f2-10-consistency.test.mjs` pasa.
2. Auditar que los locks (`pg_advisory_xact_lock` por titular, bloqueo de banco/tarjeta) realmente serializan las carreras y que `expectedVersion` impide dobles cobros; completar casos de dos conexiones simultáneas si falta alguno.
3. Revisar RLS forzada y FK por titular en `schema.test.mjs` para tarjetas, préstamos, gastos compartidos y devoluciones; agregar el caso A/B que falte.
4. Corregir cualquier implementación que falle las aserciones nuevas, sin debilitar validaciones ni ocultar errores.
5. Ejecutar regresión F1/F2 (`npm run test:unit`, `npm run test:integration`, E2E de finanzas cuando aplique) y revisar permisos/efectos.
6. Abrir la PR `[F2-10] ...` con la plantilla del repositorio, indicando qué pruebas se ejecutaron realmente. No aplicar migraciones ni tocar Neon production sin autorización específica.
