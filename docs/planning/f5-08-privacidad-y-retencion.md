# F5-08 — Borrado de cuenta y retención

RF-049 · CA-063 · I-11/I-12 · R-13/R-14 · [Decisión §11.4.4](../product/decisiones-producto.md#1144-eliminación-de-cuenta-y-datos--confirmada) · [ADR 0004](../adr/0004-google-only-allowlist-auth.md)

## Borrado en la aplicación

En **Mi cuenta → Eliminar cuenta**, el titular puede descargar la copia de F5-07, con contraseña opcional, y debe escribir `ELIMINAR` para continuar. La solicitud exige origen propio, sesión vigente y una confirmación ligada a esa sesión. El servidor exige que la sesión haya sido creada por el flujo Google en los últimos diez minutos. Si venció esa ventana, el titular debe cerrar sesión y volver a entrar. La API de Google documenta el selector de cuenta y una declaración sobre cuándo se autenticó el usuario en Google. El flujo vigente de la app verifica un inicio de sesión OAuth reciente en la app. La sesión que Google ya tiene abierta puede evitar que vuelva a pedir credenciales. [Referencia de Google OpenID Connect](https://developers.google.com/identity/openid-connect/reference)

La operación usa el rol limitado, el bloqueo exclusivo del titular que usa la restauración y una función acotada que vuelve a verificar sesión y titular. Borra en la misma transacción los datos financieros activos e históricos, auditoría financiera, preferencias, suscripciones e intentos de push, recibos de restauración, perfil de Better Auth, vínculo OAuth y todas las sesiones. Si falla un paso, PostgreSQL revierte el conjunto. El cron vuelve a comprobar que el titular sigue activo bajo el bloqueo compartido antes de generar datos o enviar avisos. La cuenta conserva su vinculación administrativa deshabilitada para impedir un alta automática y preservar el vínculo inmutable del ADR 0004.

CA-063 sigue cubierto por F5-07. La restauración advierte sobre la pérdida de cambios posteriores, ofrece descargar una copia actual y reemplaza el dominio financiero del titular. Las copias descargadas están ligadas al titular que las generó. El borrado definitivo deja sin acceso a ese titular y, por tanto, a la restauración desde la aplicación.

## Inventario de retención

| Datos | Ciclo de vida y alcance de la eliminación |
| --- | --- |
| Finanzas, historial y preferencias | Se conservan durante la vida de la cuenta. Cambiar de mes o año solo cambia el filtro. Al confirmar el borrado se purga el dominio del titular de la base activa. |
| Identidad y sesiones de la app | La sesión vence a los siete días y se elimina al salir de esa sesión. El borrado de cuenta purga todas sus sesiones y el perfil y vínculo de Better Auth. Los tokens OAuth de Google se descartan en el alta. La identidad Google se administra en Google. |
| Allowlist y auditoría administrativa | Se conserva el correo, el identificador Google vinculado, el ID interno y el registro administrativo con la revocación. El esquema vigente carece de vencimiento automático para ese registro. Cumple la vinculación inmutable del ADR 0004 y requiere intervención administrativa para una nueva admisión. |
| Estado OAuth y control de abuso | Son registros técnicos por flujo o por clave de límite de solicitudes, sin vínculo por titular en el esquema. El estado tiene vencimiento y consumo de uso único. El rate limiter poda claves vencidas durante su actividad. La expiración de uso y el borrado físico son eventos distintos. |
| Descargas y archivos locales | El dispositivo o el destino elegido por el usuario conserva informes y copias. La descarga se sirve con `private, no-store`. El usuario gestiona los archivos descargados y su contraseña. |
| Historial de recuperación de Neon | El borrado en la base activa precede al vencimiento del historial de recuperación. Neon publica una ventana de hasta seis horas en Free. Una rama o instantánea anterior que siga existiendo puede conservar su propio estado. [Ventana Free](https://neon.com/blog/neon-free-plan-1-gb-per-project) · [Restauración de Neon](https://neon.com/docs/postgres/backup-restore/branch-restore) |
| Logs de Vercel | Hobby publica una hora para logs de runtime. Los endpoints usan respuestas genéricas, el código de Auth deshabilita su logger y las solicitudes de borrado no llevan datos privados en la URL. La retención publicada de runtime se refiere a ese tipo de logs. [Logs de runtime](https://vercel.com/docs/logs/runtime) |

## Operación y recuperación

- El 12 de noviembre de 2026, el proyecto Neon de desarrollo tenía una ventana configurada de 21.600 segundos (seis horas). La consulta de instantáneas no devolvió ninguna y la rama `development` carecía de una programación de instantáneas. Se verificó solo la configuración de desarrollo.
- Antes de exponer una restauración del proveedor, aislarla de tráfico y crons. Conciliar las revocaciones y bajas posteriores con el estado autorizado más reciente, repetir la purga para los titulares que reaparezcan y verificar que sus sesiones y suscripciones hayan desaparecido. Si falta evidencia sobre bajas posteriores, mantener la restauración aislada hasta reconciliarla.
- Verificar antes de usar datos reales la ventana efectiva de recuperación, las ramas e instantáneas retenidas y la configuración de logs del proyecto. Los valores publicados describen el plan y pueden cambiar.
- Aplicar `0035_F5-08_delete_account.sql` antes del código en el entorno autorizado. La migración agrega dos funciones y una política de borrado acotada. El SQL de migración no ejecuta bajas de cuentas. La aplicación en Neon development requiere autorización específica del SQL y su SHA-256 conforme al ADR 0004.
