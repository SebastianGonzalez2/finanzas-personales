# ADR 0001 — Contratos de módulos, dinero, fechas y autorización (F0-09)

Fecha: 2026-11-07. Estado: decisión técnica propuesta e ilustrada con pruebas locales, pendiente de revisión. Producto v9.48 prevalece. No implementa persistencia, identidad ni funciones de F1. [Spike reproducible](../../spikes/foundation-contracts/) sin dependencias de runtime.

## Contexto y decisión

| Contrato | Decisión y razón |
| --- | --- |
| Módulos | UI/routing `src/app` y features llaman servicios `src/server`; dominio puro en `src/domain`; adaptadores/migraciones en `src/db`. Dominio no importa React, cookies ni SDK. Marcar adaptadores con `server-only` cuando existan; no crear directorios vacíos ahora. |
| IDs | UUID generado en servidor para nuevos objetos/eventos; opaco en transporte, no concede acceso. ID Neon se conserva como string opaco, sin asumir UUID ni duplicar identidad. FK y unicidad por `(owner_id,id)` para validar relaciones del mismo titular. Validación DB final en F0-05. |
| Dinero | String decimal canónico en JSON/DB y entero BigInt de unidades 10^-4 para suma/resta exactas, acotado al NUMERIC(20,4) propuesto. Sin float contable ni conversión implícita. UYU/USD/EUR obligatorias; no mezclar monedas. La escala técnica de cuatro posiciones no autoriza pagos bancarios fraccionarios: el formulario validará precisión real de la moneda/operación y nunca redondeará silenciosamente. |
| Cuotas/redondeo | Igualdad y suma exacta; división con resto rechazada en este contrato. F2 debe pedir/validar cuota real y cantidad. No distribuir un resto automáticamente alterando la regla de cuotas iguales. FX/rates requieren aritmética racional o biblioteca decimal revisada en F5, escala NUMERIC(24,10) propuesta; el spike no las implementa. |
| Fechas | Hecho/vencimiento: `YYYY-MM-DD`, período `YYYY-MM`, sin inferir desde timestamp. Auditoría/registro: instante UTC ISO con milisegundos (`timestamptz` en PG). Validar fechas reales, bisiestos, cierre mensual y canonicalidad. Fecha efectiva explícita; viajes no cambian período histórico. |
| Sesión/propiedad | Resolver sesión fresca y admisión con adaptador servidor validado en F0-04; nunca confiar en owner del cuerpo, URL o cookie sin verificación. Consultas por titular y relación; comprobar cada ID vinculado antes de mutar. Guarda pura del spike solo comprueba política tras recibir identidad confiable; **no autentica** ni debe exponerse como endpoint. |
| Transacción | Un cliente/una transacción PostgreSQL para evento, efectos, asignaciones, auditoría y proyección. Validar propietario, versión, disponibilidad e idempotencia dentro. Driver/ORM y nivel de aislamiento/locks se deciden y prueban en F0-05; no afirmar atomicidad sin DB. |
| Idempotencia | Clave aleatoria por operación lógica, única por titular; guardar hash canónico del comando y resultado en la misma transacción. Repetición igual devuelve resultado previo; misma clave/datos distintos rechaza conflicto. Reintento de fallo de red conserva clave; nuevo hecho usa otra. Límites de tamaño/retención deben preservar historia contable. |
| Eventos | Operación lógica identificada, versión de esquema y estados explícitos. Separar efectos banco, crédito, préstamo, reserva y estadísticas; corregir/anular con auditoría e inversa exacta. No convertir diferencia de checkpoint en movimiento; devolución posterior es evento separado (v9.42). No hay bus ni event sourcing completo elegido por este ADR. |

BigInt incorporado reduce dependencias y basta para los cálculos probados; no sustituye una biblioteca de precisión arbitraria para todas las futuras conversiones. TypeScript 5.9.3 Apache-2.0 y @types/node 24.19.2 MIT son solo desarrollo, fijados con lockfile; Node 24.19.0 ejecuta TS borrable y test runner. [Node TS](https://nodejs.org/docs/latest-v24.x/api/typescript.html), [PG numeric](https://www.postgresql.org/docs/current/datatype-numeric.html), [PG transacciones](https://www.postgresql.org/docs/current/tutorial-transactions.html). La escala y nombres físicos continúan sujetos a pruebas de F0-05.

## Amenazas y controles exigidos

| Amenaza | Control y evidencia pendiente |
| --- | --- |
| IDOR/relaciones entre titulares | WHERE owner_id en cada lectura/escritura; FK compuesta; CA-001/006 con dos sesiones/DB real. Política negativa sintética probada aquí; seguridad end-to-end pendiente. |
| Sesión revocada o usuario sin invitación/verificación | Sesión fresca + admisión; fallar cerrado ante error de proveedor; no usar caché como prueba de revocación. F0-04 conserva responsabilidad y sus hallazgos. |
| Replay/doble envío y dos dispositivos | Unicidad compuesta, hash y resultado idempotentes, locks/versiones con prueba concurrente real. I-11; pendiente F0-05/F1-04. |
| Inyección SQL, manipulación de importes/moneda | Parámetros SQL; validación de esquema y límites servidor; strings estrictos en contrato de dinero. No aceptar números JSON para valor contable final. |
| CSRF, caché compartida y cierre de sesión | Mecanismo oficial de cookies/CSRF, origen permitido, no-store en datos privados; CA-006 en navegador. Nada implementado por este spike. |
| Filtración en logs/backup/export | Errores genéricos, sin payloads/tokens/importes en logs; export titular y backup validado/atómico. Pendiente funcionalidades posteriores. |
| Edición histórica/refund/reservas ficticias | I-01…12, pruebas específicas de CA-015/028; checkpoints inmutables y diferencias explícitas; motor pendiente F0-08. |
| Offline/respuesta desconocida | Éxito solo tras commit confirmado, sin cola financiera local, reintento misma clave; pendiente CA-065. |

## Evidencia y límites

Desde `spikes/foundation-contracts`: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:timezones`. Nueve casos cubren tres monedas, 0.1+0.2, cifras mayores que Number.MAX_SAFE_INTEGER, overflow positivo/negativo, mezcla, restos, fechas inválidas/bisiestos, instante canónico, dueño/relaciones ajenas y ausencia de identidad. Tres husos repiten los mismos nueve casos. Datos sintéticos exclusivamente.

Trazabilidad: F0-09; RF-004/010/012, RNF-01/02/03/04/12/15, CA-001/006/013/014/015 (contratos preparatorios; no cierre funcional), I-01/08/10/11/12. R-12/R-16 parcialmente mitigados por los tests; R-13 abierto hasta sesión+DB; R-04 requiere motor F0-08. No migraciones, UI, auth, servicios cloud ni cambios en neon_auth.

Integrar contratos al código de aplicación será un incremento posterior revisado; no copiar el spike como autenticación. F0-05 requiere proyecto Neon Free aislado y acceso seguro del titular, pendiente en F0-04; no se aplicaron migraciones. F0-08 puede estudiar el algoritmo puro después de revisar este contrato; no se inicia aquí ni se declara segura persistencia histórica.
