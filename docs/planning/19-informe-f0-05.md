# F0-05 — Esquema y migraciones

Fecha: 2026-11-08, America/Montevideo. Estado: **implementación y aceptación
técnica de persistencia F0-05 verificadas; PR #11 pendiente de revisión humana,
sin fusionar**. Puerta F0 y autenticación completa continúan abiertas.

## Base y alcance

Git inicial limpio en `codex/F0-NEON-conectar-entorno-desarrollo`. Fetch real
confirmó `origin/main` en `e3d1ec456054f659aef848aafd2e8f070b5452e8` (PR #10
integrado). Rama nueva `codex/F0-05-esquema-migraciones` desde ese SHA, sin
reescribir ramas previas. Chat renombrado y título verificado con F0-05.
`.env.local` ignorado, no editado; hash antes/después coincide.

Solo se consultó Neon `dry-voice-45959315`, development
`br-late-feather-b6czfkx0`, neondb. Catálogo: solo tablas administradas de
neon_auth, sin finance/finance_meta/finanzas_app. Se verificó la rama desde
PostgreSQL; no se leyeron usuarios, sesiones ni datos financieros.

## Entrega realizada

- SQL aditivo: seis tablas finance y ledger técnico, tipos exactos, cinco
  índices explícitos, FK compuestas, claves por titular, rol limitado y RLS.
- Migrador directo con transacción, lock, checksum, pin de entorno y modo
  predeterminado plan sin conexión. Reejecución segura y divergencia rechazada.
- Adaptador de contexto de servidor, transacción en un cliente y rechazo sin
  identidad. Sin rutas públicas ni resolver Auth ficticio.
- Money BigInt/string, conservando contrato F0-09 y escala técnica de 4 cifras.
- Prueba compartida de esquema para PostgreSQL desechable de CI y Neon
  development (con autorización adicional, fixtures siempre con rollback).

Detalle exacto por tabla y permisos:
[propuesta de autorización](18-autorizacion-f0-05.md).
Decisiones, licencia y límites: [ADR 0003](../adr/0003-esquema-migraciones-f0-05.md).
Resumen verificable sin secretos: [evidencia JSON](../evidence/f0-05-schema.json).

## Autorización y aplicación reales

Antes de escribir en Neon se presentó el SQL completo, sus tablas/permisos,
checksum y las pruebas con fixtures en rollback. El titular respondió
**«Autorizo ese SQL y las pruebas descritas»**. Solo entonces se ejecutó
el migrador con SHA-256
`2b61f79cae12eb1b6c504e9a2f30f296ba00a2cf5df87281c91daa39f4e29c7b`.
Ledger remoto: versión `0001_F0-05_initial.sql`, aplicado
`2026-11-08T03:02:46.359Z`, rama `br-late-feather-b6czfkx0`.
No se cambió el SQL después de autorizarlo.

## Evidencia observada

| Comando / verificación | Resultado |
| --- | --- |
| `npm run test:unit` | 9/9 pasan, incluidas tres monedas, números grandes, escala, overflow y rechazo de float/mezcla. |
| `npm run format:check` | Pasa. |
| `npm run lint` | Pasa tras importar console explícitamente en scripts. |
| `npm run typecheck` | Pasa. |
| `npm run build` | Pasa con permisos de ejecución necesarios; primer intento en sandbox falló EPERM al crear directorio generado .next. |
| `npm run db:plan` | Pasa sin conectar; muestra destino y checksum exactos. |
| `git diff --check` | Pasa. |
| Integración PostgreSQL en este ordenador | No ejecutada: sin servicio en 127.0.0.1:55432 ni binarios Docker/PostgreSQL. La integración real se ejecutó en CI. |
| `npm run test:integration` en CI | 2/2 pasan en PostgreSQL 17.6: prueba previa NUMERIC/rollback y suite nueva del esquema desde cero/reaplicación/aislamiento/precisión. [Job verificado](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42440966505/job/128609905226). |
| `npm run db:migrate -- --apply <sha autorizado>` | Exit 0, `applied: ["0001_F0-05_initial.sql"]`, pending 0. |
| Mismo migrador, segunda ejecución | Exit 0, `applied: []`, pending 0. No repite DDL. |
| `npm run test:db:development -- --approved-rollback-fixtures` | **Real directo:** 48 verificaciones, exit 0, rollback y contexto limpio confirmados. |
| Mismo test con `F0_05_TEST_CONNECTION=pooled` | **Real pooled:** 48 verificaciones, exit 0, rollback y contexto limpio confirmados. |
| SQL remoto de catálogo/conteos | Seis tablas RLS ENABLE/FORCE, política owner; rol sin login/superuser/createdb/createrole/bypass/inherit/CREATE; sin USAGE de meta/Auth. Las seis tablas financieras tienen 0 filas después de ambas suites. Ledger único y checksum correctos. |
| Seis checks del PR #11, commit 88c1052 | SUCCESS: quality (incluye build/unit/E2E), database, auth spike, contracts, provider evidence y visual documentation. |
| Revisión móvil/escritorio | Sin cambios de UI, no corresponde nueva aceptación visual. |

## Reproducción de las pruebas autorizadas

1. `npm run db:plan` y comparar hash con el SQL aprobado.
2. `npm run db:migrate -- --apply <sha256 autorizado>`; repetir y comprobar
   `applied: []`, sin repetir DDL.
3. `npm run test:db:development -- --approved-rollback-fixtures` (directa).
4. La misma prueba con `F0_05_TEST_CONNECTION=pooled` en el proceso.
5. Revisar ledger, objetos, políticas y privilegios por catálogo, sin consultar
   datos privados. Confirmar que fixtures no persisten y neon_auth no cambió.
6. CI `F0 database` ejecuta `npm run test:integration` contra PostgreSQL local
   desechable, aplicando el mismo SQL desde cero y reejecutándolo.

## Cobertura y pendientes

RF-004 y CA-001: capa de persistencia probada con identidades sintéticas A/B
y rol limitado real, con/sin filtro owner y por ID ajeno; no se declara API
autenticada. RNF-01/02/03/04/12/15; I-10/11/12 de estructura y
permisos. La unicidad es mecanismo DB de idempotencia, no servicio completo
de replay/hash/respuesta. El rollback verifica atomicidad, sin motor F1.
No se acepta globalmente CA-006 ni los escenarios financieros de F1.

Las 48 verificaciones incluyen SELECT sin filtro y con owner/ID ajeno,
inserción ajena denegada, FK evento/categoría/auditoría cruzadas rechazadas,
UPDATE/DDL denegados, ausencia de DELETE/TRUNCATE por consulta de privilegios,
ausencia de acceso a ledger/Auth, claves idempotentes por titular, rollback
de evento con efecto inválido, ausencia de contexto y aritmética por moneda.
No se ejecutaron DELETE/TRUNCATE ni operaciones de limpieza.

R-12 se mitiga con Money y dominio exacto; R-13 tiene evidencia DB, pero aún
requiere integración real de sesiones/caché/exportaciones. R-01/02/17 de F0-04 y SMTP
continúan abiertos; acceso owner del tooling no es credencial final de runtime.
Puerta F0 abierta. Siguiente trabajo pendiente recomendado: retomar F0-04
para integración Auth/admisión y sesiones; no iniciar F1 automáticamente.
No hubo cambio de production, Auth administrado, facturación, merge ni deploy.
