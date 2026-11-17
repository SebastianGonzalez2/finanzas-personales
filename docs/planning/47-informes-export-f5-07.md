# F5-07 · Informes y copias de seguridad

RF-048/049 · CA-061…063 · Ruta MIX. Se conservan las secciones y el flujo de descarga preparados por OpenCode.

## Informes

- En **Informes**, se eligen dos fechas inclusivas (hasta 366 días). Los tres formatos comparten resumen por moneda y categoría, movimientos confirmados, saldo confirmado y proyección bancaria al cierre, ciclos de tarjeta, presupuestos y fondos. El gráfico PDF compara dos tramos del rango elegido. Los saldos al cierre pueden tener un checkpoint anterior al inicio.
- Los importes viajan como decimales exactos. Los ingresos/gastos excluyen transferencias, capital de préstamos y pagos de tarjeta. Para el gasto se reutiliza el consumo propio y el calendario de cuotas de Presupuestos. Las devoluciones acreditadas aparecen por separado en su fecha real. Los presupuestos muestran el límite mensual y el consumo dentro del rango, con referencias históricas cuando se usaron cotizaciones.
- CSV UTF-8 con BOM y separador punto y coma. Los valores textuales con prefijo de fórmula se neutralizan. XLSX guarda importes y datos textuales como celdas de texto. PDF incluye barras por moneda y páginas por sección.
- `POST /api/export` valida origen propio, sesión Google y autorización vigente antes de consultar datos con RLS. Las descargas son privadas y sin caché. El servidor rechaza una sección con más de 4.000 filas y solicita acortar el rango.

## Copia y restauración

- En **Mi cuenta → Copias de seguridad**, la descarga incluye una instantánea versionada de las tablas financieras del titular, con registros históricos, auditoría financiera y relaciones. Los esquemas de autenticación y los recibos operativos de restauración quedan fuera del archivo.
- La copia v1 contiene JSON comprimido con gzip y firmado con HMAC-SHA-256. La firma autentica el titular, la fecha y el contenido. La opción con contraseña cifra el contenido firmado con AES-256-GCM, sal y nonce aleatorios y scrypt (`N=131072, r=8, p=1`). El archivo admite hasta 4.200.000 bytes y la instantánea descomprimida hasta 24 MiB. [Parámetros de scrypt de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
- Verificar el archivo comprueba contraseña, firma, titular y versión del esquema. La confirmación caduca a los 15 minutos y se vincula a la sesión, el archivo y la revisión actual. La pantalla muestra la fecha y la pérdida de cambios posteriores y ofrece descargar primero el estado actual.
- La restauración revalida la sesión y adquiere el bloqueo exclusivo del titular. Si la revisión cambió, solicita verificar otra vez. El reemplazo se hace en una transacción, con claves foráneas y restricciones activas y un recibo idempotente en `finance_meta`. Se conserva la identidad Google y el acceso. La tarea programada y las solicitudes financieras ordinarias comparten el mismo bloqueo por titular.

## Operación

- `0034_F5-07_account_backup.sql` agrega el inventario, los permisos acotados y las funciones de copia y restauración. El runtime conserva sus permisos ordinarios sobre tablas. Aplicar únicamente con autorización específica de ADR 0004 sobre el SQL y su SHA-256.
- Configurar `FINANCE_BACKUP_SIGNING_KEY` con 32 bytes aleatorios en hexadecimal y conservar la misma clave en recuperaciones del entorno. Si se pierde la clave, las copias que firmó no se pueden restaurar. Esta clave se administra fuera del archivo y es independiente de la contraseña de cada copia.
- El inventario cubre el esquema financiero integrado hasta F5-07. Las suscripciones push y el caché público de cotizaciones quedan fuera de la copia. Al restaurar, se conservan las suscripciones y los intentos de envío de las tarjetas que siguen presentes. Las valoraciones históricas por titular se incluyen y conservan sus referencias al caché público del entorno.
- PDFKit y write-excel-file se ejecutan localmente en el servidor de la app. Ambas bibliotecas tienen licencia MIT. [PDFKit](https://github.com/foliojs/pdfkit) · [write-excel-file](https://gitlab.com/catamphetamine/write-excel-file).

## EXPORT-FIX — Auditoría final de exportaciones (v1.0)

Informe completo con matriz, defectos y pruebas: [EXPORT-FIX-v1.md](EXPORT-FIX-v1.md). Resumen de los cambios de contrato:

- `POST /api/export` prepara las referencias históricas igual que Presupuestos antes de leer: calcula las fechas pendientes, consulta los proveedores fuera de transacción y fija las cotizaciones del titular (`listBudgets` por mes). Después lee todo desde una instantánea `REPEATABLE READ`. Si esa preparación falla, la fila afectada indica «Faltan cotizaciones históricas». Las cuotas de meses futuros muestran la estimación provisional, marcada como tal.
- Resumen: los ingresos divididos cuentan por categoría como en Estadísticas, y todos los importes usan cuatro decimales (también el cero).
- Movimientos: la categoría refleja el desglose vigente. Un pago de tarjeta con conversión o comisión añade filas «Pago de tarjeta (débito bancario)» y «Comisión bancaria de pago», para poder trazar el gasto por comisión que cuenta Resumen.
- Saldos: sin movimientos posteriores al checkpoint, la proyección es el saldo confirmado.
- Tarjetas: dos columnas nuevas al final, «Compras sin ciclo asignado» (tarjetas sin día de cierre) y «Monto oficial del resumen».
- PDF: la fuente estándar solo dibuja Latin-1. Las comillas y guiones tipográficos, `€` y similares se sustituyen por su equivalente simple y el resto por `?`. CSV y Excel conservan el texto original.
