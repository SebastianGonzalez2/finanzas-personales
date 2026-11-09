# F2-01 — Catálogo de tarjetas

El catálogo cubre **RF-014** y la configuración opcional vinculada a **RF-017**. La separación entre débito, crédito y Bancos prepara **CA-020**. La compra a crédito que completa ese escenario y la deuda inicial están asignadas a **F2-02**. Los ciclos de cierre corresponden a F2-04 y las devoluciones a F2-09. [Plan](05-plan-de-implementacion.md) · [CA](03-criterios-de-aceptacion.md) · [Decisiones §9](../product/decisiones-producto.md).

## Contrato del catálogo

- Una tarjeta tiene nombre, tipo explícito, emisor opcional y una o más monedas entre UYU, USD y EUR. Se pueden editar el nombre, el emisor, las monedas sin posiciones registradas y los límites. El tipo se fija al crear la tarjeta para conservar su identidad contable.
- Débito identifica el vínculo con Bancos por moneda. Crédito expone deuda registrada y saldo a favor por separado en cada moneda. Las posiciones sin actividad registrada se muestran en cero. Cada moneda de crédito puede tener un límite positivo opcional y exacto, con hasta cuatro decimales.
- Archivar conserva identidad, monedas y posiciones. Las tarjetas archivadas se consultan en un grupo separado. Las operaciones del catálogo escriben únicamente en sus tablas. La creación y actualización del catálogo son independientes de los movimientos y checkpoints bancarios (**I-02**).
- La sesión Google autorizada determina el titular. Las claves y relaciones incluyen el titular y las tres tablas aplican RLS forzada. El runtime escribe configuración y agrega auditoría. Una versión por tarjeta evita sobrescribir una edición reciente y la clave por titular deduplica reintentos. La modificación y la auditoría se confirman juntas (**I-11/I-12**).

## Migración y revisión

La migración [0007](../../src/db/migrations/0007_F2-01_card_catalog.sql) agrega `finance.cards`, `finance.card_currencies`, `finance.card_changes` y sus permisos. Usa los dominios exactos existentes y requiere que el historial esté aplicado hasta `0006`. El plan local `npm run db:plan` calcula el hash del SQL sin conectarse a Neon.

- **Destino pendiente de autorización:** Neon `development`, base `neondb`, mediante la conexión directa del repositorio. Revisar y aplicar `0006` por separado si sigue pendiente.
- **SHA-256 de `0007`:** `c8d332a0d179e3bf350d0873594cca8d572ade0a3604b86b066a10d668aa0745`.
- **Revisión local:** con el entorno de prueba de [F1-08](32-regresion-aislamiento-f1-08.md), ejecutar `npm run build` y `npm run test:e2e:finance` sobre PostgreSQL desechable vacío. En **Tarjetas**, crear un débito en UYU y una tarjeta de crédito en UYU/USD con límite en una sola moneda. Editar el límite y archivar la tarjeta. El recorrido automatizado siembra posiciones sintéticas para comprobar que siguen visibles tras archivar y verifica el acceso con un segundo titular.

## Verificación local del 2026-11-09

| Comando                   | Resultado                                                       |
| ------------------------- | --------------------------------------------------------------- |
| `npm run check`           | Formato, ESLint, TypeScript y build correctos                    |
| `npm run test:unit`       | 23/23                                                           |
| `npm run test:integration` | 48/48 en PostgreSQL 17.6 desechable                              |
| `npm run test:e2e:finance` | 4/4, catálogo y regresión F1-08 en Chromium móvil y escritorio   |
| `npm run test:e2e`         | 18/18 en Chromium móvil y escritorio                            |

La prueba autenticada usó sesiones sintéticas validadas por Better Auth y el runtime limitado de PostgreSQL local. La migración y la validación con Google y Neon development siguen pendientes.
