# F6-04 · Backup, restauración y recuperación ante desastres

[F6-04](05-plan-de-implementacion.md) · RF-048/049 · CA-062/063. Rama `codex/F6-04-backup-recuperacion`, creada desde `origin/main` (incluye F5-07, F5-08, F5-09, F6-01 a F6-03). Se reutiliza el sistema de [F5-07](47-informes-export-f5-07.md); no se reimplementó ningún mecanismo y **no hay migraciones nuevas** ni SQL pendiente de aprobación ADR 0004.

## 1. Auditoría del sistema existente

| Verificación | Resultado |
| --- | --- |
| Inventario frente al esquema vigente (0001–0037) | 59 tablas de `finance` con titular. `0035` (beneficios, F5-09) las amplió a 59 y refrescó el diseño registrado; `0036` y `0037` no agregan tablas con titular. Solo quedan fuera `card_push_subscriptions` y `card_push_attempts` (dispositivos), y el caché público `fx_reference_*`. Los recibos de restauración (`finance_meta.account_restores`) y Auth/allowlist tampoco viajan. |
| Orden de claves foráneas | Ya cubierto por `account-backup.test.mjs` (padres antes que hijos). |
| Deriva de esquema | `account_backup_snapshot` y `restore_account` comparan el diseño vivo (columnas, tipos, restricciones) con el registrado y las tablas con el inventario. Una migración posterior que agregue una columna o una tabla sin actualizarlos hace fallar la copia («Esquema financiero no compatible»): **nunca omite datos en silencio**. Ahora está probado. |
| Datos de autenticación o secretos | Ninguna tabla del inventario tiene columnas de credenciales (comprobado por nombre sobre el esquema real). La copia no contiene `owner_id`; el titular va en el sobre firmado. |
| Restauración con dominio poblado | **Brecha encontrada:** la prueba existente restauraba un dominio casi vacío (solo balances de referencia). F6-04 repite el ciclo completo con 45 de las 59 tablas pobladas por los servicios reales (ver sección 4). No se detectó ningún defecto de reemplazo. |
| Contenido firmado pero malformado | **Defecto menor corregido:** un contenido firmado pero que no fuera JSON producía un `SyntaxError` sin clasificar. Ahora `decodeBackup` lo rechaza como `BackupError` («contenido inválido»). |

## 2. Procedimiento operativo

**Copia.** *Mi cuenta → Copias de seguridad → Descargar copia.* Se recomienda protegerla con contraseña (mínimo 12 caracteres). Guardarla fuera del dispositivo. La contraseña **no se puede recuperar**: sin ella la copia cifrada es inservible. Descargar una copia nueva después de cada despliegue que cambie tablas financieras (ver limitaciones).

**Restauración.**
1. *Archivo de copia* y, si corresponde, la contraseña. «Verificar copia» comprueba contraseña, integridad AES-GCM, firma HMAC, titular y versión del esquema. Una contraseña incorrecta, un archivo alterado, de otra cuenta o de otra versión no toca ninguna fila.
2. La pantalla muestra la fecha de la copia, advierte que se pierden los cambios posteriores y ofrece **descargar antes el estado actual**.
3. Con la casilla de confirmación se restaura. La confirmación caduca a los 15 minutos y queda ligada a la sesión, la copia y la revisión actual; si la cuenta cambió, hay que verificar de nuevo.
4. El reemplazo es una sola transacción con el bloqueo exclusivo del titular. Un fallo en cualquier tabla revierte todo, incluidos los borrados previos. Auth, identidad Google y allowlist no se tocan. El reintento con la misma operación es idempotente.

**Clave de firma.** `FINANCE_BACKUP_SIGNING_KEY` (32 bytes hexadecimales) debe respaldarse fuera del repositorio y de la copia. Si se pierde, las copias firmadas con ella no se pueden restaurar, aunque se conozca su contraseña.

## 3. Estrategia de recuperación y limitaciones reales

- **Misma versión de esquema.** Una copia solo se restaura si el diseño financiero coincide exactamente con el vigente; en otro caso responde 409 («otra versión del esquema financiero») y no cambia nada. No existe conversión entre versiones: **una copia anterior a una migración que modifica tablas financieras deja de ser restaurable**. Estrategia: copia nueva tras cada migración financiera y conservar la última copia válida; la recuperación de una copia obsoleta exigiría una herramienta de conversión específica, no implementada.
- **Tamaño.** Máximo 4.200.000 bytes de archivo y 24 MiB de instantánea; al superarlo la descarga falla con un mensaje explícito (nunca se produce una copia truncada). No se midió el volumen de filas equivalente.
- **Fuera de la copia:** suscripciones push y caché público de cotizaciones (se conservan las suscripciones y los intentos de las tarjetas presentes en la copia).
- **Complemento de infraestructura.** Esta copia es por titular y manual. La recuperación ante la pérdida de toda la base (restauración puntual de Neon) es una capacidad del proveedor que **no se activó ni verificó en este ticket**.
- La verificación HTTPS entre dispositivos con cuentas Google reales sigue pendiente antes de usar datos reales (ver AGENTS.md); estas pruebas usan PostgreSQL desechable y datos sintéticos.

## 4. Prueba controlada de recuperación

`tests/integration/disaster-recovery-f6-04.test.mjs` (con `tests/support/f6-04-dataset.mjs`). Solo corre contra el PostgreSQL desechable de `docs/testing.md` (`testDatabaseConfig` rechaza cualquier otro destino, incluido Neon). Pasos:

1. Dos titulares sintéticos. El A se puebla con los servicios reales: saldos (incluido un importe de 13 dígitos enteros), categorías y subcategoría, etiqueta, gasto con clasificación dividida y comercio, presupuesto, cotización de presupuesto, fondo con reserva, tarjetas de crédito, débito y USD, compra, pago con asignación, compra mixta, compra en cuotas con captura de cotización, reembolso, préstamo con cobro parcial, gasto compartido, beneficio bancario, filtro guardado, ciclo de tarjeta, recurrencia con período registrado y moneda de visualización. Quedan sin ejercitar 14 tablas (lista explícita en la prueba): ajustes de saldo, contribuciones programadas, asignaciones de cobertura de fondos, avisos de presupuesto, favoritos de estadísticas, valoraciones cambiarias y otras. Su reemplazo usa el mismo mecanismo genérico y el orden/diseño están verificados, pero no se probaron con filas.
2. Se genera la copia cifrada y se vuelcan las 59 tablas con una consulta independiente de la copia.
3. **Desastre:** se borran todas las filas del titular A y se agrega un balance posterior a la copia.
4. Contraseña incorrecta y archivo con el cifrado alterado: rechazados, sin recibo y sin cambios.
5. Fallo simulado en una tabla tardía (trigger temporal, error no relacionado con restricciones): la transacción completa se revierte, no queda recibo.
6. Cargas con una clave foránea rota, con una tabla ausente y con la sesión de otro titular: rechazadas sin cambios.
7. Restauración correcta e idempotente: las 59 tablas quedan idénticas a las originales (incluidas marcas de tiempo y decimales), los efectos bancarios por moneda no cambian (no hay efectos ficticios), el otro titular y la identidad (usuarios, cuentas, sesiones, allowlist) no cambian y existe un único recibo.

Reproducir en local (PostgreSQL 17 desechable en `127.0.0.1:55432`, valores públicos de `docs/testing.md`; la clave de firma es solo de prueba):

```powershell
$env:TEST_DATABASE_CONFIRM = 'isolated-local-test'
$env:TEST_DATABASE_URL = 'postgresql://f0_test:f0_test@127.0.0.1:55432/neondb'
$env:FINANCE_BACKUP_SIGNING_KEY = '01' * 32
node --conditions=react-server --test --test-concurrency=1 tests/integration/disaster-recovery-f6-04.test.mjs
```

Otras pruebas del ticket: `tests/unit/backup-format-f6-04.test.mjs` (sobre firmado y cifrado: contraseña, manipulación de sal/nonce/etiqueta/texto cifrado, versiones y formatos, bomba de descompresión, caducidad y ligadura de la confirmación) y, ya existentes, `tests/integration/account-backup.test.mjs` y `tests/e2e-finance/exports.spec.mjs` (CA-062/063 en el navegador).

## 5. Evidencia

Windows 11, Node 24.19, Chrome instalado (`PLAYWRIGHT_CHANNEL=chrome`), PostgreSQL 17.6 desechable local en `127.0.0.1:55432`. Datos sintéticos; no se tocó Neon.

| Comando/prueba | Resultado |
| --- | --- |
| `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` | Pasan |
| `npm run test:unit` | 157/157 (5 nuevas) |
| `npm run test:integration` | 134/134 (3 nuevas: recuperación completa, inventario/deriva y la prueba previa de copias), sin omisiones |
| `playwright test --config playwright.finance.config.mjs tests/e2e-finance/exports.spec.mjs` | 4/4 (escritorio y móvil) |

No se ejecutó la batería E2E completa: el ticket no modifica pantallas ni rutas, solo el decodificador del archivo (`src/server/backup-format.ts`).

## 6. Riesgos residuales

1. Copias anteriores a una migración financiera no son restaurables (sección 3); no hay conversión de versiones.
2. 14 tablas sin filas en la prueba de recuperación (sección 4).
3. Sin medición de tiempo de restauración con volúmenes grandes ni del límite de duración de la función en Vercel.
4. Restauración puntual de Neon y validación HTTPS con cuentas Google reales: fuera de este ticket.

