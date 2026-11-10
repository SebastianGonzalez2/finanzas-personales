# Fondos de ahorro virtuales en F3-01

**Ruta MIX.** OpenCode entregó el catálogo de fondos y sus estados, sin operar dinero. Codex debe completar las reservas, liberaciones, traspasos internos, la validación de disponible y su prueba real en la misma rama.

**Trazabilidad:** F3 de [plan de implementación](05-plan-de-implementacion.md) — RF-026/027 de [alcance y requisitos](01-alcance-y-requisitos.md) — CA-038 de [criterios de aceptación](03-criterios-de-aceptacion.md) — I-03/I-12 de [modelo de dominio](02-modelo-de-dominio-y-datos.md) — §11.3 de [decisiones de producto](../product/decisiones-producto.md).

## Alcance entregado por OpenCode

- Migración `0015_F3-01_savings_funds.sql`: `finance.savings_funds` y `finance.fund_changes`, con RLS forzada por titular, versión optimista e idempotencia por comando.
- `src/domain/savings-funds.ts`: contrato del catálogo (alta con nombre/moneda, edición de nombre y estado activo/pausado) y rechazo de campos de dinero o propietario inyectado.
- `src/server/savings-funds.ts`: listado y guardado con filtro `owner_id`, bloqueo consultivo por titular, replay idempotente y control de versión.
- `src/app/api/funds/route.ts`: alta/edición autenticada con las mismas guardas de origen y tamaño que el resto de comandos.
- `src/app/fondos/page.tsx` y `src/components/savings-fund-catalog.tsx`: navegación, listado por estado, importe reservado, moneda y formularios de alta/edición.
- Pruebas unitarias del contrato y una prueba de integración para idempotencia, versión y aislamiento A/B.

## Límite explícito: no mueve dinero

La migración no otorga a `finanzas_app` privilegio de actualización sobre `reserved_amount`. Una reserva, liberación o traspaso no puede cambiar el saldo reservado desde el catálogo ni desde una escritura accidental: requiere una migración posterior autorizada. Las altas crean fondos con `reserved_amount = 0` y `status = 'active'`.

`reserve_effects`, el cierre de fondos y la pausa por meta quedan fuera de esta parte. El catálogo muestra `paused_target_reached` y `closed`, pero no permite asignarlos.

## Trabajo pendiente para Codex

1. Añadir `finance.reserve_effects` y el privilegio mínimo sobre `reserved_amount` en una migración nueva.
2. Implementar reservar, liberar y traspasar entre fondos de la misma moneda con transacción atómica, idempotencia y auditoría. No deben crear efectos bancarios, ingresos ni gastos.
3. Calcular y validar el disponible libre por moneda como saldo bancario menos fondos reservados y compromisos aplicables (RF-026, CA-038); impedir reservas por encima del disponible y traspasos por encima del saldo libre del fondo.
4. Agregar las acciones de UI para reservar, liberar y traspasar, con confirmación del importe y los fondos involucrados.
5. Probar A/B que un titular no pueda reservar, liberar, traspasar ni leer fondos ajenos, y que un fallo no deje efectos parciales.
6. Verificar la migración en PostgreSQL desechable y aplicar el SQL a Neon development solo con aprobación expresa, según ADR 0004.

## Decisiones de esquema

- Moneda inmutable por fondo: el comando de edición no acepta `currency`.
- `status` admite `active`, `paused_manual`, `paused_target_reached` y `closed`; el catálogo solo alterna los dos primeros.
- `paused_target_reached` exige meta; `closed` exige reserva cero. Codex debe liberar y cerrar en la misma operación atómica.
- `fund_changes` conserva clave de idempotencia, hash del comando, versión y configuración. No reemplaza la auditoría de movimientos de dinero.
- El bloqueo es `finanzas:funds:<titular>`. Las operaciones monetarias futuras deben tomar primero el bloqueo de Bancos para conservar el orden global.

## Verificación local

- `npm run test:unit`: 32 pruebas aprobadas, incluidas las dos nuevas de F3-01.
- `npm run typecheck`, `npm run lint` y `npm run format:check`: aprobados.
- La prueba de integración nueva y la regresión de esquema requieren el PostgreSQL desechable documentado en [pruebas](../testing.md). En este entorno no había Docker ni el puerto `127.0.0.1:55432` disponible, por lo que **no se ejecutaron** y no se declaran aprobadas.
- La migración no se aplicó a Neon development ni production. SHA-256 de `0015_F3-01_savings_funds.sql`: `f1c728994b1a6c103d79516fea3998e871e798419423d7b9b157d46d1a8018d7`; debe presentarse y autorizarse antes de aplicarla.

La aceptación funcional de CA-038 queda pendiente hasta completar las operaciones de dinero y su prueba real. Este documento no declara F3-01 terminado.
