# F1-07 — Historial y edición segura

**Trazabilidad** · F1 · RF-004/010/011/012 · CA-013/014/015/016/017 · I-01/10/11/12. [Plan](05-plan-de-implementacion.md) · [Decisiones del producto, §5](../product/decisiones-producto.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Historial** reúne ingresos, gastos, cambios de moneda y saldos confirmados. La búsqueda literal por concepto o nota se puede combinar con fechas, moneda, tipo, categoría, medio, importe y estado. Se muestran hasta 20 registros por página con paginación por cursor. En un cambio de moneda, los filtros de moneda e importe deben coincidir en el mismo lado de la operación. El detalle conserva los filtros al volver a la lista y enlaza las revisiones con el registro anterior o su reemplazo.

El titular puede corregir los campos disponibles de un ingreso, un gasto o un cambio de moneda y confirmar su anulación desde el detalle. Cada corrección conserva el tipo de operación y deja el registro original vinculado a su reemplazo. Los saldos iniciales y los ajustes confirmados se consultan como referencias de solo lectura. Las escrituras usan la sesión verificada, las políticas de propietario, el bloqueo por titular y la idempotencia del motor existente. Los efectos se recalculan por moneda con importes exactos. Cuando una corrección alcanza un tramo ya confirmado, su diferencia queda visible en **Conciliación** y el importe confirmado se conserva.

## Cómo revisar

1. Con datos de prueba, configurá un saldo inicial de 32.000 UYU. Registrá un gasto de 2.000 UYU en febrero con concepto «Alquiler» y confirmá un saldo de 30.000 UYU en marzo.
2. En **Historial**, buscá «alquiler» y aplicá un rango de fechas. Usá **Página siguiente** si hay más de 20 coincidencias. Abrí el gasto y corregí el importe a 1.500 UYU.
3. Verificá que el original figure **Corregido** y enlace al reemplazo. En **Resumen → Conciliación**, el saldo confirmado de marzo sigue en 30.000 UYU y la diferencia es −500 UYU. Desde el reemplazo podés confirmar una anulación y verificar que la traza persiste al recargar.

## Migración y verificación

[Migración 0006](../../src/db/migrations/0006_F1-07_movement_history.sql) · SHA-256 `b320b1b12ec2af49919b5bb3cc47d0f01e3764db7f97bda35a5ce9eb005df874`. Agrega índices de historial y habilita la transición auditada de reemplazo para cambios de moneda. Conserva las filas existentes y reutiliza los permisos por titular. `npm run db:plan` muestra el hash sin conectarse. Aplicarla en Neon development requiere autorización del SQL exacto según ADR 0004.

- `npm run check` y `npm run test:unit` pasaron. La suite unitaria ejecutó 21 pruebas.
- `npm run test:integration` pasó 47 pruebas en PostgreSQL 17.6 desechable. Cubre paginación de registros de la misma fecha, aislamiento, edición con cambio de moneda y fecha, anulación y reintentos.
- `npm run test:e2e` pasó 18 pruebas, incluidas las nuevas comprobaciones de acceso sin sesión y de otro origen.
- Chromium verificó filtros, paginación, corrección, reintento tras perder la respuesta, anulación, persistencia y aislamiento A/B con sesiones sintéticas y PostgreSQL local. [Escritorio 1440×900](../evidence/f1-07/historial-escritorio.png) · [Móvil 390×844](../evidence/f1-07/edicion-movil.png).

Quedan pendientes la aplicación de `0006` en Neon development y la validación del recorrido con Google OAuth real y HTTPS entre dispositivos. **Siguiente ticket** · F1-08, regresión y aislamiento con dos cuentas y dos sesiones.
