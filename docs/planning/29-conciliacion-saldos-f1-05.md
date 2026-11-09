# F1-05 — Ajuste manual y conciliación de saldos

**Trazabilidad:** F1 · RF-008/012 · CA-011/015 · I-01/10/11/12 · R-04. [Plan](05-plan-de-implementacion.md) · [Modelo, §6](02-modelo-de-dominio-y-datos.md) · [Decisiones del producto, §6 y §12.1](../product/decisiones-producto.md).

En **Resumen → Dinero disponible → Bancos** de una moneda configurada, **Actualizar saldo real** confirma el total bancario de la fecha ingresada, con nota opcional. **Confirmaciones de saldo** muestra el cálculo al confirmar, el ajuste registrado y la diferencia respecto del cálculo actualizado. La diferencia tiene signo **confirmado menos calculado**. El ajuste no es un movimiento ni altera ingresos, gastos o categorías.

Cada saldo confirmado queda como ancla inmutable. El saldo actual parte de la última ancla por fecha y moneda, más los movimientos que le siguen. Para cada confirmación se suman los efectos confirmados entre la anterior y esa confirmación. En la misma fecha se usa el instante de registro del movimiento original: sus correcciones posteriores conservan ese lugar aunque se registren después de confirmar. Los movimientos de una fecha anterior se tratan como históricos aunque se carguen después. Se aceptan confirmaciones intermedias desde la fecha de apertura; una confirmación posterior conserva su importe y puede mostrar una nueva diferencia. Dos confirmaciones de la misma fecha se conservan en orden de registro.

Las correcciones de importe desde **Ingresos recientes** y **Gastos recientes** actualizan el período original. Si la corrección queda cubierta por un ancla, modifica la conciliación del tramo y conserva el saldo bancario actual. Las revisiones que afectan el saldo actual siguen verificando fondos. La edición de movimientos fuera de las listas recientes y el historial paginado corresponden a F1-07.

## Cómo revisar

1. Para **CA-011**, configurá 9.000 USD y confirmá 8.700 USD en una fecha igual o posterior. Verificá el saldo, el ajuste de −300 USD y que no aparezca un gasto.
2. Para **CA-015**, configurá 32.000 UYU en enero. Registrá un gasto de febrero por 2.000 UYU y confirmá 30.000 UYU en marzo. En **Gastos recientes**, corregí el importe a 1.500 UYU. La confirmación debe quedar en 30.000 UYU; el cálculo actualizado de marzo debe ser 30.500 UYU y la diferencia de conciliación −500 UYU. Recargá para comprobar que persiste. La prueba de integración también verifica que el total de gastos de febrero queda en 1.500 UYU.

El recorrido con datos sintéticos pasó en Chromium [móvil 390×844](../evidence/f1-05/ajuste-movil.png) y [escritorio 1440×900](../evidence/f1-05/conciliacion-escritorio.png). Se verificaron pérdida de respuesta después del guardado, reintento sin duplicados, foco, recarga y aislamiento entre titulares. `npm run check` pasó; `npm run test:unit`, `npm run test:integration` y `npm run test:e2e` pasaron con 18, 36 y 14 pruebas, respectivamente.

## Migración y límites

[0004_F1-05_balance_reconciliation.sql](../../src/db/migrations/0004_F1-05_balance_reconciliation.sql) agrega una tabla de detalles con acceso por titular mediante [RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), un índice para seguir la cadena de correcciones y una vista que usa los permisos de quien consulta. No modifica registros existentes. El ancla, su proyección original, la nota, la clave de reintento y la auditoría se guardan en la misma transacción. Los esquemas previos conservan los flujos de F1-04, incluido el bloqueo de correcciones cubiertas hasta aplicar F1-05.

Destino previsto: **Neon development / `neondb`**, después de aplicar F1-04. SHA-256: `6834177c48fdd7aa3c73d2f25417e6c704beed30b9ea7d9ac10b20ce35fdf37f`. `npm run db:plan` muestra el plan sin conectarse. La migración de Neon requiere aprobación del SQL exacto según [ADR 0004](../adr/0004-google-only-allowlist-auth.md). La prueba local utiliza datos sintéticos; no verifica el nuevo flujo con Google y Neon reales.

**Siguiente ticket:** F1-06, transferencias entre saldos y cambios de moneda con importes reales de ambos lados (RF-009, CA-012).
