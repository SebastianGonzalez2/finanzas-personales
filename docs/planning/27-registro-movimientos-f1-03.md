# F1-03 — Registro manual de ingresos y gastos

**Trazabilidad** · F1 · RF-004, RF-006 y RF-007 · CA-008 a CA-010 · I-01, I-10, I-11 e I-12. [Plan](05-plan-de-implementacion.md) · [Decisiones del producto, §§4, 5, 8 y 11.3](../product/decisiones-producto.md) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md).

En **Resumen → Nueva transacción**, se puede cargar un ingreso acreditado o un gasto pagado por débito bancario o transferencia. El importe positivo se guarda como decimal exacto en UYU, USD o EUR, con fecha real hasta hoy en Montevideo. El concepto es obligatorio para gastos. Los ingresos sin concepto se muestran como «Ingreso». La categoría y la nota son opcionales. Las sugerencias básicas de v6.3 se guardan en el catálogo privado al elegirlas por primera vez. Un movimiento sin categoría se muestra como «Sin categorizar».

El saldo inicial de la moneda es el punto de referencia. Resumen muestra el saldo calculado junto al importe y la fecha del saldo confirmado. Un movimiento anterior al ancla se incorpora a su mes y a los movimientos recientes por fecha. Si se registra un movimiento el día de referencia, se aplica al saldo calculado cuando el registro es posterior al ancla. Para esa fecha, corresponde cargar solo operaciones posteriores al saldo que se confirmó.

Los gastos que afectan la proyección requieren saldo disponible suficiente en esa moneda. El servidor muestra el faltante y serializa los movimientos del mismo titular y moneda antes de comprobar el disponible. Un solo guardado escribe el evento, el detalle, el efecto bancario y la auditoría en la misma transacción. La clave por titular permite reintentar después de una respuesta perdida. La sesión y las relaciones se verifican en servidor, y la base aplica RLS y claves foráneas por titular. [Aislamiento de transacciones](https://www.postgresql.org/docs/17/transaction-iso.html) · [Seguridad de filas](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Resumen muestra los totales del mes por moneda y los cinco movimientos más recientes de cada tipo. La reversión auditada corresponde a F1-04, la conciliación histórica a F1-05, el historial con filtros y paginación a F1-07, y la gestión del catálogo a F5.

## Migración de desarrollo

La migración aditiva [0002_F1-03_ordinary_movements.sql](../../src/db/migrations/0002_F1-03_ordinary_movements.sql) crea el detalle por evento con RLS, claves foráneas por titular y permisos de lectura e inserción para el rol existente. Los registros previos de F0-05 se conservan. Mientras falte la migración, Resumen conserva el acceso a los saldos y muestra que el registro todavía no está disponible.

El destino de aplicación previsto es **Neon development**, base `neondb`. El ADR 0004 requiere aprobación previa del SQL exacto. `npm run db:plan` lista el plan sin conectarse a la base. El SHA-256 de esta migración es `adbf2b59941f6712dc0f1df2d06cae2386b43d48d3f9c10b0af12653b0b0c9dd`. El ejecutor comprueba que la única migración pendiente coincida con el hash autorizado antes de aplicar el SQL.

## Revisión manual

En un entorno de pruebas con la migración aplicada, abrir `/resumen` y configurar **10.000 UYU** y **100 USD** de saldo inicial. Registrar un gasto de **1.500 UYU** por débito, con concepto y sin categoría. Debe aparecer una vez como «Sin categorizar», con **1.500 UYU** en Gastos del mes y **8.500 UYU** en Bancos. Después registrar un ingreso acreditado de **5.000 UYU** con concepto vacío y categoría Sueldo. Resumen debe mostrar **13.500 UYU**, **5.000 UYU** en Ingresos del mes, la referencia inicial de **10.000 UYU** y el saldo de **100 USD**. Recargar y repetir la consulta con otro titular de prueba para comprobar persistencia y aislamiento.

## Verificación

- `npm run check` pasó formato, lint, tipos y build. `npm run test:unit` pasó 16 pruebas.
- `npm run test:integration` pasó 25 pruebas en PostgreSQL 17.6 desechable, incluidos A/B, rollback, saldo insuficiente concurrente y migración sobre datos anteriores.
- `npm run test:e2e` pasó 10 pruebas en Chromium. El recorrido positivo adicional se comprobó en 1440×900 y 390×844 con API y PostgreSQL reales y dos titulares sintéticos. Incluyó reintento después de una respuesta perdida y verificación de saldos tras recargar. [Formulario móvil](../evidence/f1-03/formulario-movil.png) · [Resumen de escritorio](../evidence/f1-03/resumen-escritorio.png).
- Quedan pendientes la aplicación del SQL y la prueba de F1-03 con Google y Neon development reales.
