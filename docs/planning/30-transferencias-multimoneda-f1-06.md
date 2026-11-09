# F1-06 — Transferencias y cambios de moneda

**Trazabilidad** · F1 · RF-009 · CA-012 · I-01/10/11/12. [Plan](05-plan-de-implementacion.md) · [Modelo de datos](02-modelo-de-dominio-y-datos.md) · [Decisiones del producto, §7 y v9.43](../product/decisiones-producto.md).

En **Resumen → Nueva transacción → Cambio de moneda**, elegí dos saldos configurados de distinta moneda y cargá cuánto entregaste, cuánto recibiste y cuándo ocurrió. El sistema guarda un único evento con un débito, un crédito y su auditoría en la misma transacción. Cada importe conserva su moneda y su precisión original. La operación aparece en **Cambios de moneda recientes** y queda fuera de ingresos, gastos y categorías.

Las transferencias entre bancos propios en la misma moneda ya están reflejadas en el saldo agregado. Las comisiones y las diferencias de cambio tienen un tratamiento pendiente según §7. El formulario usa exclusivamente los importes registrados por el titular.

El servidor verifica la sesión y ambos saldos del titular. Serializa las escrituras bancarias por titular y vincula cada reintento al contenido original del envío. Si el débito afecta el saldo actual, comprueba que haya fondos suficientes. Cada lado se aplica según la fecha y la posición del evento respecto de la última confirmación de esa moneda. Un efecto cubierto cambia la conciliación del tramo y conserva el importe confirmado.

**Deshacer** anula el registro en la aplicación y conserva los importes originales y la auditoría. Si la anulación dejaría sin fondos al saldo de destino, la operación queda registrada y la app indica cuánto falta. Las confirmaciones bancarias se conservan también al anular. La búsqueda, paginación y edición desde el historial se abordan en F1-07.

## Cómo revisar

1. Configurá **Bancos UYU** en 10.000 y **Bancos USD** en 0. Registrá un cambio posterior a ambos saldos iniciales de 4.000 UYU por 100 USD.
2. Verificá **6.000 UYU** y **100 USD** en Bancos, un cambio con ambos importes en **Cambios de moneda recientes** y los mismos totales de ingresos y gastos. Recargá para comprobar que persiste.
3. En un registro de prueba, pulsá **Deshacer** antes de recargar. Verificá que ambos efectos desaparezcan del saldo calculado. Para probar el rechazo, repetí con un importe entregado superior al disponible.

## Pruebas

- `npm run check` · formato, ESLint, tipos y build.
- `npm run test:unit` · 19 pruebas.
- `npm run test:integration` · 42 pruebas en PostgreSQL 17.6 desechable. Incluye CA-012, concurrencia, atomicidad ante fallos, permisos, deshacer y conciliación independiente por moneda.
- `npm run test:e2e` · 16 pruebas en Chromium, incluidas las solicitudes anónimas y de otro origen.
- Recorrido completo de formulario, API, PostgreSQL y recarga con identidad sintética en [móvil 390×844](../evidence/f1-06/formulario-movil.png) y [escritorio 1440×900](../evidence/f1-06/resultado-escritorio.png). Incluye saldo insuficiente, reintento después de perder la respuesta, deshacer y aislamiento A/B.
- En Neon development, el rol restringido de finanzas pasó los escenarios de alta, corrección, conciliación, cambio de moneda, reintento, deshacer y aislamiento con titulares sintéticos. Se verificó el rollback. Una sesión Google vigente pasó la autorización de la app y confirmó que el esquema estaba disponible. El inicio de una sesión OAuth nueva y la prueba HTTPS entre dispositivos quedan pendientes de verificación.

## Migración y permisos

[0005_F1-06_bank_transfers.sql](../../src/db/migrations/0005_F1-06_bank_transfers.sql) agrega un índice parcial para la lista reciente y amplía la política de actualización de estado para permitir la anulación auditada de cambios de moneda. Reutiliza las tablas, el rol de la app y el aislamiento por titular existentes. La migración no reescribe filas.

Con autorización del titular, se aplicaron en **Neon development / `neondb`** las migraciones `0002` a `0005` en una sola transacción. Se verificaron la rama, los hashes de los cinco archivos y el registro final de migraciones. SHA-256 de `0005` · `7c7a062b69f2031bc38a2f208ff6aad115cfdaea2cf7f2c2e0b52dbf1655e5a0`. `npm run db:plan` muestra los nombres y hashes sin conectarse. [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

**Siguiente ticket** · F1-07, historial permanente paginado, búsqueda y filtros base, edición y anulación segura.
