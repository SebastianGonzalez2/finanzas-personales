# OPS-RESET · Reinicio financiero de un titular

**Desde Mi cuenta**, el titular puede pulsar **Reiniciar mis datos** y escribir `REINICIAR`. Este flujo borra su dominio financiero, conserva el acceso con Google y funciona sin descargar una copia. Este documento describe además el procedimiento administrativo del PR #100.

Operación puntual de mantenimiento. Referencias [F5-08](f5-08-privacidad-y-retencion.md), [F6-04](55-backup-recuperacion-f6-04.md) y [ADR 0004](../adr/0004-google-only-allowlist-auth.md). Aplica el aislamiento I-12 y la atomicidad I-11. La copia y su validación reutilizan RF-048/049 y CA-062/063.

## Alcance

El script [reset-financial-owner.mjs](../../scripts/reset-financial-owner.mjs) elimina todas las filas del titular que coincida con el ID interno, correo normalizado, vínculo Google vigente y sesión autorizada. Incluye filas activas, anuladas, corregidas y archivadas, junto con configuraciones, revisiones e historial de auditoría financiera.

Las siguientes **59 tablas de `finance`** integran la copia cifrada y el reinicio.

| Dominio | Tablas |
| --- | --- |
| Preferencias y catálogos | `user_preferences`, `categories`, `people`, `tags`, `merchants`, `name_catalog_changes` |
| Saldos, movimientos e historial | `financial_events`, `balance_checkpoints`, `bank_effects`, `audit_changes`, `ordinary_movements`, `balance_adjustments`, `classification_changes`, `movement_allocations`, `event_tags`, `event_merchants`, `bulk_classification_changes` |
| Tarjetas, cuotas y compras mixtas | `cards`, `card_currencies`, `card_changes`, `credit_operations`, `credit_lines`, `credit_allocations`, `installment_plans`, `card_cycle_changes`, `mixed_purchases`, `mixed_purchase_categories` |
| Reembolsos, créditos y beneficios | `purchase_refunds`, `refund_parts`, `refund_installments`, `card_credit_changes`, `bank_benefits` |
| Deudas, préstamos y gastos compartidos | `loans`, `loan_operations`, `loan_people`, `shared_expenses`, `shared_expense_details` |
| Fondos, reservas y aportes | `savings_funds`, `fund_changes`, `reserve_effects`, `contribution_plans`, `contribution_periods`, `contribution_changes`, `fund_event_allocations`, `fund_payment_allocations` |
| Presupuestos, avisos y cotizaciones por titular | `budget_limits`, `budget_changes`, `budget_quotes`, `budget_rates`, `budget_notices`, `fx_valuations` |
| Recurrencias | `recurring_series`, `recurring_periods`, `recurring_commands`, `recurring_allocations`, `recurring_share_participants` |
| Filtros y estadísticas | `saved_history_filters`, `saved_filter_changes`, `statistics_favorites` |

El reinicio elimina **otras 3 tablas por titular** fuera de la copia portátil.

- `finance.card_push_attempts` y `finance.card_push_subscriptions`. Incluye intentos históricos y ajustes de suscripción por dispositivo. Para volver a recibir avisos push, habrá que suscribir los dispositivos de nuevo.
- `finance_meta.account_restores`. Incluye los recibos de idempotencia de restauraciones previas. La restauración desde la copia genera un recibo nuevo.

Se conservan todas las filas de los demás titulares. Se conservan el ID de usuario, el vínculo con la misma cuenta de Google, las sesiones de la app y su vencimiento normal, `app_auth` (usuario, cuenta, sesión, estado OAuth y límites de solicitudes), `app_access` (allowlist y auditoría administrativa), `app_auth_meta`, cualquier esquema gestionado de identidad, el ledger `finance_meta.schema_migrations`, el diseño `finance_meta.account_backup_layout` y las cotizaciones públicas `finance.fx_reference_rates` y `finance.fx_reference_refreshes`. Las vistas consultan las tablas base y se conservan. La preferencia local del tutorial pertenece al navegador. La operación usa el identificador de Google como vínculo de identidad de la app y prescinde de `delete_own_account`.

## Dependencias, aislamiento y reversión

El inventario se contrasta con el catálogo de PostgreSQL y el ledger completo de migraciones. Se revisan las **81 claves foráneas entrantes** del esquema ensayado, incluidas las autorreferencias de categorías, comercios y personas. El orden de los 59 conjuntos portátiles se toma de `finance.account_backup_tables()` y se invierte. Los intentos push se borran antes de suscripciones y tarjetas. Los recibos son independientes y se borran al final.

Cada sentencia de borrado tiene el predicado parametrizado `WHERE owner_id = $1`. La comprobación previa exige que cada FK entrante provenga de una tabla del inventario, comparta la columna `owner_id` y tenga acción `NO ACTION`. También comprueba el orden de las FK, las políticas RLS del propietario, la ausencia de triggers de borrado personalizados y la ausencia de reglas de reescritura, herencia o particiones entre los destinos. Una divergencia detiene la operación antes del primer borrado. El rol propietario se valida contra el destino fijado y contra el propietario de la función de backup. La política de tarjetas de runtime puede restringir el borrado de posiciones registradas. Si resulta aplicable al rol propietario, el plan se detiene para revisar la configuración sin modificarla. [Políticas de filas en PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) · [Roles de Neon](https://neon.com/docs/manage/roles)

La transacción usa el bloqueo exclusivo que los flujos financieros y el cron comparten por titular. Vuelve a verificar la sesión bajo el bloqueo sin devolver su token. Compara huellas de los datos actuales con las aprobadas e incluye en la huella del estado las tres tablas excluidas de la copia. Compara los recuentos por tabla, fuerza las restricciones diferidas y vuelve a contar las 62 tablas antes del `COMMIT`. Un error revierte todo. Si se pierde la conexión al confirmar, se repite el inventario para determinar el resultado antes de cualquier reintento.

## Preparación y autorización del reinicio real

1. Confirmar de forma privada el correo y el ID interno del titular autenticado. Usar el destino fijado por el repositorio, Neon `production`, rama `br-wild-mode-b64fgovd`, DB `neondb`, conexión directa como `neondb_owner`. El comando sin argumentos muestra el destino y el SHA-256 del script sin conectarse.
2. En sesión con la cuenta Google del titular, abrir **Mi cuenta → Copias de seguridad**. Marcar **Proteger esta copia con contraseña**, descargar el JSON y guardarlo en una ubicación privada junto con acceso a su contraseña por separado. En esa misma pantalla, volver a cargar el archivo y pulsar **Verificar copia**. El archivo queda ligado al titular y a la versión financiera vigente. El botón de verificación solo valida la copia.
3. En entorno privado, usar las variables de destino del migrador de producción y `OPS_RESET_OWNER_ID` y `OPS_RESET_EMAIL`. Para la comprobación del archivo usar `OPS_RESET_BACKUP_PATH`, `OPS_RESET_BACKUP_PASSWORD` y la clave `FINANCE_BACKUP_SIGNING_KEY` vigente. Cargar la contraseña y la clave mediante el mecanismo privado del operador. Ejecutar `node --conditions=react-server scripts/reset-financial-owner.mjs --plan <SHA-256 del archivo>`. El plan devuelve los recuentos, la huella del estado y las huellas del archivo y del script. Valida cifrado, firma, titular y coincidencia exacta con la instantánea actual. La transacción de inventario termina con `ROLLBACK` y ejecuta consultas y bloqueos.
4. Presentar al titular el destino, identidad, recuentos por tabla, impacto, archivo verificado, forma de comprobación posterior y los tres SHA-256 del paso anterior. Pedir autorización expresa para ese plan exacto. Cualquier cambio de estado o de archivo exige repetir la verificación y presentar el plan actualizado.
5. Solo después de esa autorización, ejecutar `node --conditions=react-server scripts/reset-financial-owner.mjs --apply <SHA-256 del estado> <SHA-256 del archivo> <SHA-256 del script>` en el entorno privado, con el titular sin registrar operaciones mientras se ejecuta. El resultado especifica las filas eliminadas y el recuento final por tabla. Volver a comprobar el inventario con `--plan` **sin archivo** y verificar Resumen, Historial y las configuraciones con la sesión existente. Abrir además una sesión nueva con la misma cuenta Google y verificar que usa el mismo ID de titular. La creación de un saldo y un movimiento nuevos se ensaya con datos sintéticos. En producción la registra el titular cuando tenga sus primeros datos.

La copia permite recuperar las 59 tablas portátiles desde **Mi cuenta → Copias de seguridad** con la misma firma, contraseña, titular y diseño financiero. Un fallo previo a confirmar se recupera por `ROLLBACK` de las 62 tablas. Una recuperación posterior al `COMMIT` mediante el archivo exige una autorización separada y reemplaza los datos financieros nuevos por los de la copia. La copia de la app excluye el historial de push, sus credenciales de dispositivos y los recibos previos.

## Ensayo reproducible

PostgreSQL 17.6 desechable de [pruebas](../testing.md), esquema versionado hasta 0039, dos titulares sintéticos y sesión OAuth real de Better Auth con endpoints y JWT de Google simulados.

```powershell
$env:TEST_DATABASE_CONFIRM = 'isolated-local-test'
$env:TEST_DATABASE_URL = 'postgresql://f0_test:f0_test@127.0.0.1:55432/neondb'
node --conditions=react-server --test tests/integration/google-auth.test.mjs
node --conditions=react-server --test --test-concurrency=1 tests/integration/account-backup.test.mjs tests/integration/disaster-recovery-f6-04.test.mjs
$env:PLAYWRIGHT_CHANNEL = 'chrome'
node node_modules/@playwright/test/cli.js test --config playwright.finance.config.mjs tests/e2e-finance/exports.spec.mjs
```

El caso OPS-RESET cifra y verifica una copia del titular A, rechaza una identidad cruzada y huellas incorrectas, inyecta un error de PostgreSQL al final del borrado y verifica la reversión. A continuación aplica el reinicio, verifica las 62 tablas y compara el estado completo de B, autenticación y tablas administrativas antes y después. Verifica la sesión existente, vuelve a iniciar sesión vía OAuth con el mismo titular y registra un nuevo saldo inicial de 100,1234 UYU y un gasto de 10,0034 UYU. El saldo calculado sale de esos dos importes y es 90,1200 UYU.

Resultados observados en el ensayo local.

| Verificación | Resultado |
| --- | --- |
| Better Auth, aislamiento y OPS-RESET | 13 de 13 |
| Inventario de backup y recuperación F6-04 | 3 de 3 |
| Descarga privada, verificación de copia y restauración en Chrome | 4 de 4, escritorio y móvil |
| Build Next.js | Correcto |

El ensayo usa el esquema del repositorio y datos sintéticos. El correo, ID, recuentos y huellas de la copia de producción se obtienen en el plan del paso 3.
