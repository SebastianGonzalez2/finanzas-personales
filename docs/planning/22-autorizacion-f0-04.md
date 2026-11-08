# F0-04 — SQL y pruebas pendientes de autorización

Estado: **SQL y fixtures autorizados explícitamente y ejecutados**. Fecha:
2026-11-08, America/Montevideo. El titular seleccionó «Autorizar ese SQL y las
pruebas con rollback». Se conserva debajo la propuesta exacta presentada.
Aplicación confirmada, reaplicación sin DDL y 29 comprobaciones SQL con rollback;
16 comprobaciones adicionales con LOGIN restringidos reales pasan.
HTTPS/altas permanecen sin autorizar/habilitar.

## SQL exacto y destino

Archivo íntegro: [0002_F0-04_admission.sql](../../src/db/proposals/0002_F0-04_admission.sql).
SHA-256: `2e085527fae59d84c2ac4183e7f907f219b07c819543a919d7be3fdb078545ab`.
`npm run auth:sql:plan` reproduce el hash sin conectarse.

Único destino: proyecto `dry-voice-45959315`, rama **development**
`br-late-feather-b6czfkx0`, base `neondb`, endpoint directo
`ep-falling-queen-b63xbfuk.c-2.sa-east-1.aws.neon.tech`.
El SQL verifica rama/base antes de DDL. No se ejecuta en production ni en otra DB.

## Consecuencias

- Crea el esquema privado `admission` y siete tablas: versión/checksum,
  política única, límites de intentos, permisos temporales, decisiones de webhook,
  titulares admitidos y auditoría de rotaciones. Inicialmente **no hay código activo**.
- Crea `finanzas_runtime` y `finanzas_admission`, LOGIN sin contraseña asignada,
  NOINHERIT/NOBYPASSRLS y sin privilegios de propietario/creación de roles o bases.
  No crea un proyecto ni base de datos nuevos.
- `finanzas_runtime` puede asumir únicamente el rol financiero existente
  `finanzas_app` y consultar la función booleana `admission.is_admitted`.
  No puede escribir admisiones ni leer códigos/permisos/decisiones.
- `finanzas_admission` lee política y gestiona límites/permisos/decisiones/admisiones;
  no puede rotar la política, cambiar roles ni acceder al esquema financiero.
  Es un componente de servidor confiable: sus credenciales permiten admitir
  identidades y deben protegerse como un secreto de autorización.
- La única función SECURITY DEFINER fija `search_path=pg_catalog`, usa nombres
  cualificados y tiene EXECUTE revocado a PUBLIC. No modifica `neon_auth`.
- No cambia las seis tablas, RLS, movimientos, importes o checkpoints de F0-05.
  Consume almacenamiento/cómputo dentro del proyecto existente; no activa pagos.
- No contiene DROP ni reversión destructiva. Ante fallo de aplicación se revierte
  la transacción; si se abandona después de aplicar, mantener código revocado y
  Auth deshabilitada. Eliminar objetos requeriría otra revisión/autorización.

El runner mantiene el ledger dentro del SQL aprobado mediante un `set_config`
de sesión **no secreto** que proporciona el checksum. Reaplicar el mismo hash
comprueba el ledger; otra versión aborta. El migrador F0-05 no carga propuestas.

## Pruebas que se propone autorizar con el SQL

`npm run test:auth:development -- --approved-rollback-fixtures`:
transacción única con advisory lock, código aleatorio sintético, permisos para
dos identidades sintéticas, invitación incorrecta/reutilizable, retry de evento,
alteración/replay, método incorrecto, expiración, rotación, revocación y límites.
Inserta dos preferencias sintéticas en F0-05 para comprobar lectura RLS A/B y
consulta con owner manipulado. **Siempre ROLLBACK**, sin correos ni altas Auth.
El evento de entrada se simula: esta suite verifica SQL, no Google/OTP/firma real.
Usa la conexión administrativa local solamente para el harness de rollback.

La suite se ejecutó después de la autorización expresa: 29 comprobaciones y rollback.
Usa owner para la lógica de admisión; no añade membresías al administrador.
La suite `test:auth:runtime` comprueba aparte los LOGIN reales: 16 controles con
rollback, RLS sintética A/B y permisos negativos. Ninguna crea usuarios Auth.
El indicador `--approved-rollback-fixtures` no sustituye autorización explícita.

## Pasos separados después de autorizar

**Ejecutados:** SQL/ledger y rollback. También se prepararon las credenciales
solicitadas para los roles aprobados mediante `auth:runtime:prepare`, sin nuevos
grants: contraseñas aleatorias de 256 bits, archivo exclusivo `.env.runtime.local`
ignorado y pruebas de login/RESET ROLE. No se muestra ni rastrea ningún secreto.
Las variables propietarias quedan vacías en ese archivo para impedir que Next
las complete desde `.env.local`. Este último no se modificó. No repetir la
provisión sobre credenciales existentes; el script falla si el archivo ya existe.
`npm run dev:auth` carga esa configuración; Auth sigue deshabilitada allí.

Los pasos siguientes documentan el procedimiento reproducible; el código grupal
sigue revocado y no se ejecutó rotación persistente ni se habilitaron altas.

1. Aplicar exactamente el checksum aprobado con
   `npm run auth:sql:apply -- --apply-approved-sql <sha256>` y repetir para verificar
   ledger. Luego ejecutar el harness autorizado y comprobar rollback.
2. Preparar contraseñas aleatorias privadas para ambos LOGIN mediante operación
   administrativa revisada; sin imprimirlas ni guardarlas en Git/chat. El SQL
   propuesto no asigna contraseñas. Validar conexiones reales de ambos roles,
   rechazo de `SET ROLE neondb_owner`, ausencia de acceso cruzado y privilegios.
3. Guardar URLs pooled respectivas en `DATABASE_RUNTIME_URL` y
   `DATABASE_ADMISSION_URL`; generar `NEON_ADMISSION_SECRET` privado >=32 bytes.
   **No desplegar DATABASE_URL ni DATABASE_URL_UNPOOLED de propietario.**
4. Administrar el código desde proceso local con credencial administrativa:
   `npm run auth:invitation -- --rotate` lee `NEON_NEXT_INVITATION_CODE` privado,
   de 24–256 caracteres; usar un valor generado con aleatoriedad criptográfica.
   `--revoke` lo desactiva. Cambios auditados por generación, sin registrar secreto.
   No desplegar el código, su variable de rotación ni el proceso administrativo.

## HTTPS y servicios externos: todavía no autorizados

El webhook bloqueante exige HTTPS público y rechaza localhost, IPs y redirects:
[contrato Neon](https://neon.com/docs/auth/guides/webhooks).
El receptor está en `/api/webhooks/neon-auth`; habilitar solo `user.before_create`,
timeout 5 s. No suscribir eventos de envío, que sustituirían el SMTP integrado.

Opción a evaluar: **un preview temporal de Vercel Hobby**, subdominio gratuito,
sin dominio propio, pagos ni datos reales. [Hobby](https://vercel.com/docs/plans/hobby)
admite pruebas personales sujetas a sus términos y cuotas. Antes de publicar
deben confirmarse cuenta/proyecto de Vercel, URL final, visibilidad, acceso del
webhook sin challenge de login, duración y retirada del preview.
No hay proyecto Vercel vinculado en el workspace ni despliegue realizado.
No se ha creado un túnel ni contratado un servicio alternativo.

Primero publicar solamente con las altas cerradas y política revocada; configurar
el webhook y probar firma inválida, ausencia de permiso, caída/timeout y llamada
directa a Neon. **No habilitar altas hasta demostrar rechazo bloqueante**.
La selección del destino HTTPS y su publicación requieren autorización separada.

Google compartido y correo compartido ya existen en development; no hace falta
crear credenciales OAuth propias ni SMTP externo para estas primeras pruebas:
[Google de desarrollo](https://neon.com/docs/auth/guides/setup-oauth).
El titular indicó que aún necesita preparar dos buzones sintéticos y Google de prueba.
Nunca compartir contraseñas/OTP/tokens en el chat. Producción y SMTP pertenecen
también a las verificaciones abiertas de F0-07.
