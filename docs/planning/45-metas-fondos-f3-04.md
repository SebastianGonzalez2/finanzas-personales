# F3-04 — Metas monetarias, fechas objetivo y mensajes

Implementación MIX sobre la rama `codex/F3-04-metas-ahorro`. OpenCode entregó la edición visual de metas, fechas y mensajes. Codex debe completar los aportes exactos, la pausa automática por meta, la reactivación expresa y el estado persistente de avisos.

- [RF-029](01-alcance-y-requisitos.md)
- [CA-040 y CA-050](03-criterios-de-aceptacion.md)
- Decisiones §11.3.2: v5.6, v9.28, v9.29, v9.30, v9.47.

## Edición visual (OpenCode)

- El editor de fondo en `/fondos` acepta **meta** (importe positivo exacto) y **fecha objetivo** opcionales. Campos vacíos quitan la meta o la fecha; cambiarlos no mueve dinero ni altera reservas. El alta (`create`) sigue sin exigir meta, conforme v2.9.
- El comando `update` de `/api/funds` lleva `targetAmount` y `targetDate` normalizados (`null` para quitar). `status` pasó a ser opcional: los fondos con estado `paused_target_reached` se editan **sin cambiar su estado**, y la reactivación queda reservada al aviso expreso (v9.28/v9.30). Quitar la meta con la pausa por meta activa se rechaza (además la exige la restricción de 0015).
- La tarjeta del fondo muestra **progreso porcentual** calculado con aritmética exacta a cuatro decimales, el faltante real («Te faltan …», sin recortes si supera el 100 %), **«Meta alcanzada»** cuando el reservado cubre la meta, el **ahorro mensual orientativo** hasta la fecha futura (v5.6, solo informativo) y el aviso de **fecha objetivo vencida** «Pasó la fecha objetivo; aún faltan …» (v9.47) sin pausar aportes ni marcar la meta cumplida.
- Los mensajes usan `today` del titular (Montevideo) ya disponible en el catálogo; fondos cerrados no muestran botones de edición.

## Pendiente de Codex

1. **Última aportación exacta** (v9.29/v9.40-CA-040): reservar solo el remanente positivo cuando el aporte programado excede lo que falta; pausar automáticamente y registrar «Aportación final para completar meta» en el historial. Si el disponible no alcanza ni para el remanente, dejar pendiente según v9.24 sin reservas parciales.
2. **Pausa automática por meta** (v9.28): transición a `paused_target_reached` al ejecutar el aporte que completa o supera la meta; distinguible de la pausa manual; no afecta fondos sin meta.
3. **Reactivación expresa** (v9.31): desde el aviso, con primera aportación en el mes siguiente; no reactivar por editar la meta ni por gastar la reserva tras alcanzarla (v9.30).
4. **Avisos persistentes** en el centro de avisos y el detalle: «Alcanzaste tu meta…», «Aumentar meta» como acción principal y «Reactivar aportaciones» tras gastar la reserva; antirrepetición diaria.
5. **Cierre de fondos con advertencia**: el cierre sigue bloqueado a nivel de base (0015 exige reservado cero); falta la operación y su advertencia visual.
6. Pruebas de aceptación CA-040/050 con DB real desechable, incluida la reducción de la última cuota y el aviso de fecha vencida.

## Migraciones para Neon development

| Orden | SQL exacto | SHA-256 | Impacto |
| --- | --- | --- | --- |
| 0018 | [Metas de fondos](../../src/db/migrations/0018_F3-04_fund_targets.sql) | `4c62bba415814ba33ade9d7a19a674ffbd557c27afd3711cf72faac0f5e11383` | Habilita `UPDATE (target_amount, target_date)` para el rol de aplicación. Sin cambios de filas ni esquema. |

Aplicación a Neon **pendiente de autorización específica** según [ADR 0004](../adr/0004-google-only-allowlist-auth.md). Verificado en solo lectura: development tiene 0017 aplicado y `finanzas_app` aún no puede actualizar las columnas de meta. Hasta aplicar 0018, la edición de metas responde 503 en producción de datos.

## Verificación local

- `npm run check` — formato, lint, tipos y build aprobados.
- `npm run test:unit` — 44 pruebas aprobadas (normalización de meta/fecha, fecha inválida, ahorro orientativo exacto y estado opcional).
- `npm run test:integration` — nueva prueba F3-04 escrita (persistencia, idempotencia, protección de meta alcanzada); **no ejecutada localmente** por falta de PostgreSQL desechable/Docker; pendiente en CI o Codex.
- Pruebas e2e de metas: requieren 0018 aplicada a Neon development; quedan para Codex junto con las de CA-040/050.
