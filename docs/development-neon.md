# Entorno Neon de desarrollo — F0-NEON

Este procedimiento prepara F0-04/F0-05; no los declara aceptados. Usar solo
`finanzas-personales-dev`, proyecto `dry-voice-45959315`, rama `development`
`br-late-feather-b6czfkx0`, base `neondb`, región AWS São Paulo.
El titular confirmó el ID después de que la búsqueda exacta devolviera dos
proyectos homónimos. No usar el otro proyecto ni `production`.

**Actualización F0-05 (2026-11-08):** esquema propio y migrador ya implementados
y probados en development tras autorización expresa. Ver
[propuesta exacta autorizada](planning/18-autorizacion-f0-05.md),
[ADR](adr/0003-esquema-migraciones-f0-05.md) e
[informe de resultados y comandos](planning/19-informe-f0-05.md).
Las indicaciones posteriores de migraciones pendientes corresponden al estado
F0-NEON anterior. `.env.local` se conservó íntegro. La autenticación completa
y credencial runtime restringida siguen pendientes; no se habilita acceso público.

## Configuración privada

Ya se preparó `.env.local` en la raíz sin sobrescribir un archivo existente.
Está ignorado por Git; contiene los IDs y la URL Auth verificados y un secreto
de cookies generado localmente con 32 bytes aleatorios, sin imprimirlo.
El código fija el destino permitido en `src/server/neon-development-config.mts`;
las variables de entorno no pueden seleccionar otro endpoint o rama.

1. Abrir [el proyecto autorizado](https://console.neon.tech/app/projects/dry-voice-45959315).
2. Seleccionar **development → Connect**, base **neondb**, rol **neondb_owner**.
3. Copiar la URL PostgreSQL con **Connection pooling** en `DATABASE_URL` de
   `.env.local`. Copiar solo la URL, sin `psql`, comillas del comando ni JDBC.
4. Desactivar pooling y copiar la URL directa en `DATABASE_URL_UNPOOLED`.
   Se reserva para futuras migraciones; este ticket no ejecuta migraciones.
5. Conservar `NEON_PROJECT_ID`, `NEON_BRANCH_ID`, `NEON_AUTH_BASE_URL` y
   `NEON_AUTH_COOKIE_SECRET`. Guardar el archivo. No enviar su contenido al chat,
   GitHub, capturas, logs ni variables `NEXT_PUBLIC_*`.
6. Ejecutar `git check-ignore .env.local`, `npm run probe:neon` y
   `npm run probe:neon -- --direct` desde la raíz.
   La sonda imprime solo indicadores y devuelve 0 si pasa, 2 si falta
   configuración y 1 si falla conexión/consulta. No imprimir excepciones de pg.

En esta entrega el titular ya guardó ambas URLs: las dos sondas reales pasaron,
confirmando además el ID de rama devuelto por PostgreSQL. No hace falta volver
a copiar credenciales si el archivo continúa configurado.

Host pooled permitido:
`ep-falling-queen-b63xbfuk-pooler.c-2.sa-east-1.aws.neon.tech`.
Host directo permitido:
`ep-falling-queen-b63xbfuk.c-2.sa-east-1.aws.neon.tech`.
Son identificadores públicos, no credenciales.

`DATABASE_URL` y `DATABASE_URL_UNPOOLED` incluyen contraseña y son secretos.
Las URLs Auth/IDs no son secretos, pero permanecen en configuración de servidor.
No se solicitó una API key de Neon ni se recuperó una contraseña mediante MCP:
la copia local por el titular evita trasladarla entre herramientas o mensajes.
La autorización del conector permite SQL remoto, pero no inyecta variables
automáticamente en el proceso Next.js.

## Pruebas permitidas

`npm run probe:neon` valida primero proyecto, rama, host, base y opciones TLS.
Abre una transacción `READ ONLY`, comprueba conexión y aritmética `NUMERIC`
(`0.1 + 0.2 = 0.3`), y ejecuta `ROLLBACK`. No crea tablas temporales, usuarios,
movimientos ni migraciones. Exige TLS con certificado verificado y habilita
channel binding. Rechaza parámetros arbitrarios de conexión, otro endpoint,
otra base y opciones que debiliten TLS; los errores no incluyen URLs.

Desde `spikes/neon-auth`, `npm run probe` lee primero el `.env.local` de raíz y
comprueba solo sesión anónima vacía y una clave pública Ed25519 en JWKS.
No carga un `.env.local` propio del spike; rechaza
IDs/URL que no correspondan al destino autorizado. No envía correo ni registra
cuentas. Una clave JWKS **no demuestra** que haya un webhook configurado.

Los tests `npm run test:integration` siguen restringidos al PostgreSQL local
desechable de CI y **no aceptan Neon**; no sustituir sus variables por estas URLs.
El driver conserva `NUMERIC` como string; no se instala un parser float.

## Auth verificado y siguiente configuración

Better Auth ya estaba habilitado en `development`: proveedor `better_auth`,
URL y esquema `neon_auth` confirmados mediante API/SQL, además de la sonda pública.
Se configuró y volvió a leer:

- Email/password habilitado, altas por correo deshabilitadas provisionalmente.
- Verificación obligatoria por **código OTP** y envío al registrarse activados.
- Revocación de sesiones al restablecer contraseña activada.
- Google compartido y correo compartido ya existentes; localhost permitido.

El webhook `user.before_create` sigue deshabilitado porque todavía no hay
receptor HTTPS con admisión persistente. La configuración de alta email no se
presenta como bloqueo global de Google: falta probar el rechazo directo de
altas por ambos métodos. No publicar ni usar datos personales reales.

Antes de habilitar altas: implementar/revisar admisiones y límites persistentes,
configurar el receptor HTTPS seguro en esta rama y probar rechazo sin invitación
por email y Google, rotación y reintentos. No conectar los Maps del spike.
No activar `send.otp`/`send.magic_link`, porque sustituirían el envío integrado.
Después probar con buzones de test: entrega/expiración/reenvío/abuso de OTP,
Google, recuperación, revocación real y aislamiento con dos sesiones/titulares.

`developmentAuthConfig` prepara configuración exacta y silenciosa para el SDK;
no monta rutas ni concede acceso a datos. `@neon/auth` sigue aislado en el spike:
el conflicto de peers y la caché de 0.8.2 están abiertos. El contrato Next
incluye una lectura HTTP con `?disableCookieCache=true`, probada con transporte
simulado en el proxy del SDK. Aún falta integración App Router y revocación real.

El SMTP compartido sirve para esta preparación; entregabilidad, cuotas y
alternativa gratuita de producción continúan en F0-07. No se contrata nada.

## Decisión de acceso PostgreSQL

Se reutiliza `pg` 8.23.1 (MIT), ya fijado para CI, ahora como dependencia runtime.
Es compatible con Node 24 y con transacciones interactivas. La
[guía vigente de Neon](https://neon.com/docs/connect/choose-connection) recomienda
`pg` para Vercel Fluid. El adaptador de este incremento es una sonda local
marcada `server-only`, sin pool permanente ni consultas financieras.
La gestión del pool con `@vercel/functions` se evaluará antes de desplegar.

No añadir otro SDK DB u ORM para una consulta diagnóstica. Las migraciones
versionadas, rol de aplicación con privilegios mínimos, esquema propio,
FK por titular, concurrencia/idempotencia y prueba real A/B siguen en F0-05.
No alterar `neon_auth` mediante SQL. No interpretar el rol propietario de prueba
como rol final de la aplicación ni la sonda como autorización multicuenta.

Trazabilidad: RF-001…004, RNF-01/02/03/09/11/12, CA-001…006, I-11/I-12 como
preparación; sin aceptación funcional. I-01…I-10 no se modifican.
