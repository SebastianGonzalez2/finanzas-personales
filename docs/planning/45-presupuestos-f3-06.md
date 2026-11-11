# F3-06 — Presupuestos mensuales

Continuación MIX del commit de OpenCode `cd0738d`, en `codex/F3-06-presupuestos`. RF-031/032, CA-043 y base de cálculo de CA-042; invariantes I-01/02/10/11/12. Los avisos internos de CA-042 corresponden a F3-07.

## Comportamiento

- Un presupuesto opcional por categoría, con moneda UYU/USD/EUR. El padre incluye gastos directos y descendientes sin sumar nuevamente esos indicadores al gasto global. Se reutilizan los repartos exactos de compras mixtas y la parte propia de gastos compartidos.
- Las cuotas consumen el mes del plan. Pagar capital de tarjeta, reservar fondos, transferir dinero o acreditar un reembolso no agrega consumo. Un reembolso de enero recibido en febrero queda separado: febrero conserva sus compras completas (v9.42). Las cuotas canceladas dejan de consumirse según los planes y devoluciones confirmados existentes.
- El nuevo importe y moneda habituales rigen desde el mes actual inclusive. Las versiones anteriores permanecen consultables mediante el selector mensual. Quitar un presupuesto conserva su historia; volver a crearlo reutiliza su identidad con una nueva versión.
- Las excepciones afectan un mes y no se arrastran. Una edición habitual de importe mantiene la excepción. Cambiar moneda deja sin efecto las excepciones actuales/futuras en la moneda anterior, con advertencia y vista previa de este mes y el siguiente; las filas históricas permanecen intactas. La baja también invalida excepciones futuras para evitar que reaparezcan al recrear el presupuesto.
- Los comandos se serializan por titular dentro de la transacción existente, con clave idempotente, huella y versión esperada. Dos ediciones con la misma versión permiten solo una confirmación. Ante respuesta perdida se bloquean los campos y se reenvía exactamente el mismo cuerpo y clave. Una excepción guardada se puede reintentar después de cambiar de mes; una nueva excepción retroactiva se rechaza.
- Las cuatro tablas nuevas fuerzan RLS por titular y FK compuestas. El runtime solo puede leer/insertar; no actualizar ni borrar historial. Las APIs conservan sesión Google validada, autorización fresca, origen permitido y respuestas privadas.

## Cotizaciones y límites actuales

El proveedor automático de referencia aún no existe en esta base y corresponde a F5-06. Se implementa la alternativa manual ya prevista en §10/§11.2 de decisiones de producto, identificada como `manual`, con par, fecha y tasa decimal positiva de hasta ocho decimales. Cada par se informa expresamente; no se inventan tasas inversas/cruzadas ni equivalencias 1:1.

Se toma la última referencia con fecha anterior o igual al gasto. Para cuotas se captura al registrar la compra, para todas las monedas de destino disponibles, aunque todavía no haya presupuesto. Todas sus cuotas reutilizan la referencia original. Cambiar la moneda del presupuesto selecciona la referencia fija del otro par; no recotiza por el paso del tiempo.

Para gastos/planes anteriores o sin tasa disponible, la primera referencia histórica suministrada resuelve la conversión pendiente y queda fijada al evento/par. Una referencia posterior no reemplaza una ya usada. La vista muestra fecha, fuente y tasa; si falta alguna conversión, muestra consumo sin calcular, sin presentar un total parcial como cero. Una corrección financiera que crea un evento sustituto obtiene su propia referencia. Este mecanismo no ejecuta cambios de moneda bancarios.

Las consultas pueden insertar únicamente referencias faltantes en `budget_rates`; no crean movimientos ni modifican bancos, deudas o fondos. Los cálculos usan NUMERIC y el porcentaje de interfaz usa enteros exactos.

## Migración preparada, no aplicada en Neon

SQL exacto en [0020_F3-06_monthly_budgets.sql](../../src/db/migrations/0020_F3-06_monthly_budgets.sql).

- SHA-256: `333afc91a98b25bf39ccb9af9f17b1a0c58c5599b673c1ce2da5abb33000189f`.
- Destino previsto: proyecto `dry-voice-45959315`, rama **development** `br-late-feather-b6czfkx0`, base `neondb`, conexión directa del destino fijado en el repositorio. No se verificó ni modificó el historial remoto durante F3-06.
- Impacto: crea cuatro tablas vacías, índices, políticas RLS, una vista de consumo y una función/disparador sobre nuevas versiones de planes de cuotas. El disparador captura referencias disponibles sin alterar el plan. Puede requerir un bloqueo breve de DDL en `installment_plans`. No reescribe registros financieros ni checkpoints.
- Requiere que 0001–0019 estén aplicadas. El runner exige el hash del único SQL pendiente. Cada migración previa requiere su propia autorización.
- Aplicar 0020 en el destino compartido requiere aprobación específica conforme a [ADR 0004](../adr/0004-google-only-allowlist-auth.md). Las pruebas ejecutan el SQL en PostgreSQL local desechable. Hasta aplicar 0020, la página y la API informan que la actualización está pendiente.

## Evidencia

- `npm run check`: formato, lint, tipos y build correctos.
- `npm run test:unit`: 47 pruebas correctas.
- Integración dirigida `budgets.test.mjs` y `schema.test.mjs`: 13 pruebas correctas, incluidas migración autorizada por hash, datos anteriores, RLS A/B, concurrencia, historial, cuotas, compras mixtas/compartidas y reembolsos.
- Regresión completa `npm run test:integration`: 67 pruebas correctas sobre PostgreSQL 17.6 local desechable.
- `npm run test:e2e:finance`: 28 pruebas correctas, escritorio 1440×900 y móvil 390×844. F3-06 verifica formulario/API/DB/vista, rechazos 400/401/403/404/409, respuesta perdida tras COMMIT con reintento idéntico, cotización manual, historial, baja y ausencia de errores de página/desbordamiento horizontal.
- Capturas de editor en ambos tamaños revisadas visualmente: controles y vista previa legibles, foco y navegación preservados. Solo fixtures sintéticos.
- `npm run test:e2e`: 18 pruebas de acceso/smoke correctas.

Siguiente ticket: F3-07 para avisos internos 80%/100% sin duplicados y concurrencia del sistema de avisos. F5-06 incorporará las fuentes automáticas y su fallback; no se activaron servicios ni dependencias nuevas.
