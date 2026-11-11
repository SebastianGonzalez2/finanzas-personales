# F3-07 — Avisos internos de presupuestos y metas

Parte MIX de OpenCode en `codex/F3-07-avisos-internos` (rama creada sobre
`codex/F3-06-presupuestos`, que ya contiene `origin/main`). RF-032/038,
CA-042/050. La persistencia de umbrales, la deduplicación y las pruebas de
concurrencia quedan para Codex.

## Comportamiento entregado (mensajes, estados y componentes)

- `src/domain/notices.ts`: estados y mensajes puros de avisos. Porcentaje
  entero con piso sobre unidades de 4 decimales; 80% advertencia y 100%
  límite alcanzado (CA-042); meta incumplida cuando la fecha objetivo está
  vencida y lo reservado es menor que la meta, sin alterar el fondo ni los
  aportes (CA-050). Sin correos ni servicios externos (RF-032/038).
- `src/components/notices.tsx`: `NoticeCard`, `BudgetThresholdNotice` y
  `GoalDueNotice`, con nivel `warning` (ámbar) y `danger` (rojo), enlaces al
  origen y roles `status`/`alert`.
- La página `/avisos` agrega secciones «Presupuestos» y «Metas de fondos»
  junto a las aportaciones existentes, con estado «No tenés avisos nuevos».
- `/presupuestos` muestra el aviso de 80% y 100% en cada presupuesto; antes
  solo existía el mensaje de 100%.
- `/fondos` muestra el aviso de meta incumplida en la tarjeta del fondo.

No hay migraciones ni cambios de esquema, API o movimientos financieros.

## Pendiente de Codex (parte crítica)

- Registrar el cruce de umbral 80%/100% **una sola vez por umbral y mes**
  (CA-042): hoy el aviso es derivado del consumo corriente, sin historial de
  avisos. Definir persistencia/migración si corresponde, con SQL exacto,
  destino, impacto y SHA-256, y aprobación según ADR 0004.
- Validación de concurrencia del sistema de avisos (comandos simultáneos,
  idempotencia y deduplicación con datos reales en DB desechable) y pruebas
  A/B de aislamiento.
- Integración y E2E dirigidas de los avisos (no ejecutadas localmente por
  falta del servicio desechable en 127.0.0.1:55432; ver evidencia).

## Evidencia

- `npm run check`: formato, lint, tipos y build correctos.
- `npm run test:unit`: 53 pruebas correctas, incluidas 6 nuevas de
  `tests/unit/notices.test.mjs` (umbrales, mensajes, metas vencidas).
- `npm run test:integration`: no ejecutada en este entorno (sin Docker ni
  servicio PostgreSQL local); pendiente en CI o entorno con DB desechable.
- `npm run test:e2e` / `test:e2e:finance`: pendientes de Codex con entorno
  autenticado.
