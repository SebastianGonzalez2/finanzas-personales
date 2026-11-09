# F1-08 — Regresión y aislamiento del núcleo financiero

**Trazabilidad** · F1 · RF-004/005/006/007/008/009/010/011/012 · RNF-01/02/04/12 · CA-001/006 y regresión de CA-007…017 · I-01/10/11/12. [Plan](05-plan-de-implementacion.md) · [Criterios](03-criterios-de-aceptacion.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

## Cobertura

| Control | Evidencia automatizada |
| --- | --- |
| CA-001 · Privacidad A/B | Cada titular ve sus propios saldos. El filtro de historial no devuelve movimientos ajenos. La URL de detalle y la API de anulación devuelven 404 tanto para un ID ajeno como para uno inexistente. El cuerpo con un propietario inyectado recibe 400. Las respuestas privadas impiden el almacenamiento en caché. |
| CA-006 · Dos sesiones de A | A1 y A2 usan cookies firmadas distintas y ven el mismo saldo al volver a consultar. Ante dos envíos simultáneos de la misma operación se devuelve el mismo ID y se aplica un solo par de efectos. Un payload distinto con la misma clave se rechaza. La misma clave puede usarse en B con una operación propia. Cerrar A1 invalida su cookie, incluso si se reinyecta, y A2 sigue activa. |
| I-01/I-11 · Exactitud y atomicidad | Desde el saldo confirmado de 30.000 UYU se entregan 4.000,0001 UYU y se reciben 100,1251 USD. Las dos sesiones ven 25.999,9999 UYU y 100,1251 USD. Un intento posterior que supera el disponible deja ambos saldos iguales. |
| I-10 · Conciliación y auditoría | Al corregir un gasto anterior de 2.000 a 1.500,0001 UYU, se conserva la confirmación de 30.000 UYU y aparece la diferencia de −499,9999 UYU. Si la respuesta se pierde después del guardado, la interfaz informa la incertidumbre y reenvía el mismo cuerpo y clave. El original, su reemplazo y la anulación siguen visibles desde otra sesión. |

## Reproducción

1. Iniciá el [PostgreSQL desechable documentado](../testing.md#postgresql-desechable) en `127.0.0.1:55432` y configurá `TEST_DATABASE_URL` y `TEST_DATABASE_CONFIRM` según esa guía.
2. Ejecutá `npm ci`, `npx playwright install chromium`, `npm run build` y `npm run test:e2e:finance`. La suite inicia Next.js en el puerto 3108 y corre el mismo recorrido en Chromium de escritorio (1440 × 900) y móvil (390 × 844).
3. En GitHub Actions, el job **F0 database** ejecuta esta suite sobre la base vacía y después la integración PostgreSQL existente. Para ejecutar ambas localmente, usá ese orden, ya que la suite de integración deja el esquema financiero de prueba instalado.

Las sesiones sintéticas se siembran con cookies firmadas y pasan por la validación real de Better Auth, la autorización de sesión en SQL y los dos roles limitados del runtime. El proceso de prueba redirige los pools al PostgreSQL local validado por la guarda existente. Aplica el SQL versionado sobre una base de prueba vacía y elimina los esquemas y roles que creó al terminar.

## Resultados del 2026-11-09

| Comando | Resultado local |
| --- | --- |
| `npm run check` | Pasó formato, ESLint, TypeScript y build |
| `npm run test:unit` | 21/21 |
| `npm run test:integration` | 47/47 en PostgreSQL 17.6 desechable |
| `npm run test:e2e` | 18/18 en Chromium móvil y escritorio |
| `npm run test:e2e:finance` | 2/2 en Chromium móvil y escritorio, con el servidor Next.js y PostgreSQL 17.6 local |

El primer intento con PostgreSQL iniciado dentro del sandbox quedó sin conexión desde el proceso de prueba. Se reinició una instancia local desechable accesible para ambos procesos. También se ajustó el orden de CI tras comprobar que la integración deja instalado el esquema financiero, y se corrigió la carga de la configuración compartida de Playwright para ejecutar ambos tamaños de pantalla. La repetición final pasó en ambos proyectos y luego pasó la integración.

Un intento de build dentro del sandbox devolvió un error genérico de Webpack. El comando completo `npm run check` pasó al repetirlo fuera del sandbox.

## Estado y límites

La base del PR es F1-07 mientras su revisión siga abierta, porque el recorrido prueba el historial y sus revisiones. El diff de F1-08 contiene pruebas, configuración de CI y documentación.

R-13 y R-19 conservan la verificación pendiente en HTTPS entre dispositivos con cuentas Google reales. La suite local usa el SQL de F1-07 en PostgreSQL desechable. La aplicación de la migración `0006` en Neon development y su verificación allí se gestionan en [F1-07](31-historial-movimientos-f1-07.md). [Riesgos](06-riesgos-y-pendientes.md).

El siguiente ticket del plan es **F2-01 — Catálogo de tarjetas débito/crédito**, después de revisar e integrar el cierre del núcleo F1.
