# F0-05 — Esquema y migraciones

Fecha: 2026-11-07, America/Montevideo. Estado: **preparado localmente;
migración y pruebas Neon pendientes de autorización humana**.

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

## Entrega preparada

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

## Evidencia observada antes de autorización

| Comando / verificación | Resultado |
| --- | --- |
| `npm run test:unit` | 9/9 pasan, incluidas tres monedas, números grandes, escala, overflow y rechazo de float/mezcla. |
| `npm run format:check` | Pasa. |
| `npm run lint` | Pasa tras importar console explícitamente en scripts. |
| `npm run typecheck` | Pasa. |
| `npm run build` | Pasa con permisos de ejecución necesarios; primer intento en sandbox falló EPERM al crear directorio generado .next. |
| `npm run db:plan` | Pasa sin conectar; muestra destino y checksum exactos. |
| `git diff --check` | Pasa. |
| Integración PostgreSQL local | No ejecutada: no hay servicio escuchando en 127.0.0.1:55432 ni binarios Docker/PostgreSQL disponibles. CI usará su PostgreSQL desechable. |
| Migración y fixtures Neon | No ejecutados: requieren autorización expresa solicitada por el titular. |
| Revisión móvil/escritorio | Sin cambios de UI, no corresponde nueva aceptación visual. |

## Comandos de verificación después de autorizar

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

RF-004 y CA-001: capa de persistencia preparada, pendiente ejecución DB; no se
declara API autenticada. RNF-01/02/03/04/12/15; I-10/11/12 de estructura y
permisos. La unicidad es mecanismo DB de idempotencia, no servicio completo
de replay/hash/respuesta. El rollback verifica atomicidad, sin motor F1.
No se acepta globalmente CA-006 ni los escenarios financieros de F1.

R-12 se mitiga con Money y dominio exacto; R-13 requiere evidencia DB y aún
integración real de sesiones/caché/exportaciones. R-01/02/17 de F0-04 y SMTP
continúan abiertos; acceso owner del tooling no es credencial final de runtime.
Puerta F0 abierta. Siguiente trabajo pendiente recomendado: retomar F0-04
para integración Auth/admisión y sesiones; no iniciar F1 automáticamente.
No hubo cambio de production, Auth administrado, facturación, merge ni deploy.
