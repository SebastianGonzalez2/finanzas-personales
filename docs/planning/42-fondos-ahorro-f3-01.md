# F3-01 — Fondos de ahorro virtuales

Implementación MIX sobre la rama `codex/F3-01-fondos-ahorro`. OpenCode entregó el catálogo. Codex completó las operaciones monetarias virtuales, el cálculo de disponible y las pruebas de aceptación.

- [RF-026 y RF-027](01-alcance-y-requisitos.md)
- [CA-038](03-criterios-de-aceptacion.md)
- [I-03 e I-12](02-modelo-de-dominio-y-datos.md)

## Operaciones manuales

Desde `/fondos` se puede reservar, liberar o traspasar un importe exacto. La confirmación muestra el importe, la moneda y los fondos involucrados. El traspaso requiere dos fondos del mismo titular y moneda. La pausa del fondo permite operaciones manuales. Los fondos cerrados conservan su historial.

El disponible libre por moneda parte de la proyección vigente de Bancos y resta las reservas del titular. En este esquema, los compromisos de tarjeta asociados a fondos se incorporarán en F3-05 y quedarán contenidos dentro de la reserva del fondo. Si una moneda carece de saldo inicial, el catálogo lo indica y la reserva se rechaza.

El servidor valida el disponible antes de reservar y el saldo del fondo origen antes de liberar o traspasar. La transacción toma los bloqueos por titular de Bancos y de fondos en ese orden, comprueba las versiones de los fondos involucrados y aplica los cambios y su auditoría juntos. `fund_changes` registra la solicitud, su clave de idempotencia y la fecha. `reserve_effects` registra un delta exacto por fondo y dos deltas opuestos para un traspaso. El rol de aplicación tiene lectura e inserción de efectos con RLS forzada y claves foráneas por titular y moneda.

Las operaciones modifican únicamente las reservas virtuales. Con 10.000 UYU en Bancos y una reserva de 3.000 UYU, el banco sigue en 10.000 UYU, el fondo queda en 3.000 UYU, el disponible libre queda en 7.000 UYU y el gasto es cero.

F3-02 incorporará la protección del disponible libre al gastar desde Bancos. F3-03, F3-04 y F3-05 cubren los aportes programados, las metas y el cierre, y el uso de reservas para cubrir gastos, respectivamente.

## Migraciones para Neon development

Destino previsto según [la configuración aprobada](../../src/server/neon-development-config.ts) y [ADR 0004](../adr/0004-google-only-allowlist-auth.md) — proyecto `dry-voice-45959315`, rama `development` (`br-late-feather-b6czfkx0`), base `neondb`.

| Orden | SQL exacto | SHA-256 | Impacto |
| --- | --- | --- | --- |
| 0015 | [Catálogo de fondos](../../src/db/migrations/0015_F3-01_savings_funds.sql) | `f1c728994b1a6c103d79516fea3998e871e798419423d7b9b157d46d1a8018d7` | Crea el catálogo y su auditoría con RLS por titular. |
| 0016 | [Efectos de reserva](../../src/db/migrations/0016_F3-01_reserve_effects.sql) | `d514325230518d9f58f1e7a633191e666155efefcfa403801012f4f05973620f` | Amplía los comandos auditados, crea los efectos con RLS y habilita la actualización de la reserva por el rol de aplicación. Conserva las filas y versiones existentes. |

Aplicación a Neon pendiente de autorización específica. La prueba de migración cubre un catálogo creado con 0015, su lectura después de 0016 y el reintento por checksum en PostgreSQL desechable.

## Verificación local

- `npm run check` — formato, lint, tipos y build aprobados.
- `npm run test:unit` — 33 pruebas aprobadas.
- `npm run test:integration` — 61 pruebas aprobadas en PostgreSQL 17.6 desechable. Incluye CA-038, aislamiento A/B, integridad de ambas monedas y fondos, reintentos, reversión ante un fallo de auditoría y dos reservas concurrentes tras un débito de Bancos.
- `npm run test:e2e:finance` y `npm run test:e2e` — 22 y 18 pruebas aprobadas en Chromium de escritorio y móvil. Se revisó el formulario de traspaso en ambos tamaños.
