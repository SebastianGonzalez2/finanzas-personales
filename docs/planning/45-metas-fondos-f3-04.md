# F3-04 — Metas, pausa y reactivación de fondos

Ruta MIX: se conserva la edición visual de OpenCode y se integra con el motor de aportes de F3-03. Contrato: [RF-029](01-alcance-y-requisitos.md), [CA-040/050](03-criterios-de-aceptacion.md), I-03, I-11 e I-12; decisiones v5.6, v9.28–31, v9.36 y v9.47.

- La meta y la fecha son opcionales. Alcanzar la meta con un aporte, traspaso o cambio de meta pausa el plan activo. La última aportación automática se limita a lo que falta: si faltan 50 de un aporte de 200, se reservan 50 y el historial marca el aporte final. Si ni siquiera hay 50 disponibles, queda una aportación pendiente por 50 sin reserva parcial; el importe habitual no cambia.
- Bajar la reserva, aumentar la meta o quitarla conserva la pausa por meta. Reactivar exige confirmar y agenda una primera aportación el día elegido del mes siguiente, ajustado al último día si corresponde. Se conservan las aportaciones pendientes de meses anteriores para resolución manual.
- El centro de avisos y el detalle leen los estados persistidos del fondo. Hay un aviso vigente por fondo y condición, sin generar filas diarias. Vencer la fecha solo informa el faltante; al moverla al futuro o alcanzar la meta, ese aviso desaparece.
- Cerrar requiere confirmar el importe exacto a liberar y la lista de pendientes a descartar. Se revalidan la versión y la lista bajo los mismos bloqueos que usan Bancos y los fondos. Cierre, efecto virtual y descartes se registran juntos; se conserva el historial. El modelo actual no tiene compromisos de tarjeta contra fondos. F3-05 debe impedir este cierre cuando introduzca esas reservas comprometidas.

## Migración pendiente de autorización

Destino: Neon **development** (`br-late-feather-b6czfkx0`, base `neondb`, proyecto `dry-voice-45959315`), con 0017 como predecesora.

| SQL exacto | SHA-256 | Impacto |
| --- | --- | --- |
| [0018_F3-04_fund_targets.sql](../../src/db/migrations/0018_F3-04_fund_targets.sql) | `b56799e25593e6002ecdf028f8cb78c458b20bd159c0a995ef8429074f7b2810` | Habilita edición de meta y fecha, conserva la pausa si se quita la meta y admite auditar el cierre y el motivo de resolución. No migra saldos ni registros históricos. |

La migración se aplica en las pruebas sobre PostgreSQL desechable. La aplicación a Neon compartido exige aprobación específica de ese SQL y su hash, conforme a [ADR 0004](../adr/0004-google-only-allowlist-auth.md) y las reglas del repositorio.

## Verificación

- Las pruebas de integración cubren aporte exacto, insuficiencia, idempotencia, reversión atómica, concurrencia, RLS A/B, reactivación y cierre con un aviso obsoleto.
- La prueba de navegador recorre CA-040/050 y el cierre en escritorio y móvil, con sesiones y saldos sintéticos.
