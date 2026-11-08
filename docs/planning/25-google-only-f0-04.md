# F0-04 — Implementación Google-only v9.49

Rama nueva desde main `7181a39` (PR #13), ADR 0004. RF-001…004,
CA-001…006 e I-12. PR #12 se conserva en borrador y no se fusiona. Nuevo PR #14.

## Implementación y límites actuales

Better Auth 1.7.18 (MIT) ejecutado en Next.js con pg 8.23.1. Kysely 0.29.8
(MIT) se declara directamente porque es el adaptador incorporado de Better Auth
y permite fijar `schemaName: app_auth` y `transaction: true` sin depender del
search_path de PgBouncer. No se introduce otro ORM para finanzas.

Únicas rutas de acceso: POST sign-in/social para Google, GET callback/google y
POST sign-out. Contraseñas, OTP, enlaces, Admin, unión de identidades, tokens
Google suministrados por cliente y redirects/scopes arbitrarios están bloqueados.
La app no importa @neon/auth, no expone receptor de webhook ni usa su proveedor.
El proveedor anterior y los esquemas históricos no se cambian ni se borran.

La política vive en SQL, privada. Perfil Google verificado y sub se comprueban en
`validateUserInfo` (también en retornos OAuth). El hook user.create.before vuelve
a verificar la autorización y solo inserta el sub validado por el proveedor.
El transporte entre esos dos hooks está ligado al contexto de esa solicitud,
sin guardar políticas en memoria ni aceptar identidad del navegador. Triggers
de PostgreSQL vuelven a verificar usuario, vínculo y sesión de forma atómica.

La regresión JWT detectó que el flujo redirect de Better Auth 1.7.18 decodifica
el ID token por defecto. Se reemplaza `getUserInfo` por el verificador oficial
exportado `verifyGoogleIdToken`: firma RS256/JWKS de Google, issuer, audience,
exp/iat y edad máxima, antes de permitir que el perfil llegue a los hooks.
Se rechazan audiencias múltiples/azp ajeno. State y PKCE permanecen en el flujo
oficial de código OAuth. No se habilita login por ID token enviado por cliente.

Se conserva una vinculación inmutable email/sub/titular. No se combinan aliases
Gmail ni identidades por email. Un cambio de correo observado para un sub ya
vinculado deniega la entrada y revoca sus sesiones; para aprobar ese cambio se
necesita revisión manual explícita, sin reasignación automática de datos.

Cada lectura financiera verifica sesión sin cookie cache y autorización de DB.
La función de autorización mantiene locks hasta COMMIT, con orden allowlist →
session para coordinar revocación y logout. Se reutilizan los contratos y RLS
F0-05. `/api/account` solo lee preferencias; no implementa operaciones F1.

## SQL pendiente de autorización

Archivo exacto: `src/db/proposals/0003_F0-04_google_only.sql`.
Destino único: proyecto `dry-voice-45959315`, development
`br-late-feather-b6czfkx0`, DB `neondb`.

SHA-256 exacto del archivo:
`093bbf05c22d8aa7caa12e93b50856820123d13eade827bb34879cdfd5fab969`.

Se proponen tres esquemas nuevos: app_auth (user, account, session, verification
y rateLimit persistente), app_access (allowlist/auditoría), app_auth_meta (ledger).
Dos LOGIN sin contraseña inicial, finanzas_google_auth y
finanzas_google_finance, sin propiedad de tablas ni bypass RLS. El segundo
puede asumir finanzas_app; el primero no accede a finanzas. finanzas_app recibe
únicamente USAGE de app_access y EXECUTE de authorize_session, sin SELECT de
allowlist ni tablas Auth. Funciones SECURITY DEFINER tienen search_path fijo,
nombres calificados y EXECUTE PUBLIC revocado. No se cambia finance/finance_meta,
admission ni neon_auth; no se cargan identidades ni correos de prueba remotos.

`npm run auth:google:plan` calcula el hash del archivo. El runner requiere
`--apply --approved-sha256=<hash>` y verifica el destino antes de escribir;
agrega un registro de versión/hash a app_auth_meta.migrations en la misma
transacción. No ejecuta DDL automáticamente al iniciar la aplicación.

**Ningún SQL nuevo aplicado a Neon todavía.** La autorización del SQL histórico
del PR #12 no se interpreta como autorización de este archivo.

La provisión posterior de las dos credenciales restringidas también requiere
autorización: [script exacto](../../scripts/provision-google-runtime.mjs). Ejecuta
solo `ALTER ROLE finanzas_google_auth PASSWORD <secreto aleatorio>` y
`ALTER ROLE finanzas_google_finance PASSWORD <secreto aleatorio>` en transacción,
con nombres fijos, contraseñas nuevas de 256 bits generadas localmente y literales
escapados por `format` de PostgreSQL. Crea el archivo ignorado `.env.google.local`
sin sobrescribirlo, con conexiones limitadas y secreto Better Auth independiente.
No se puede incluir la contraseña futura en un SQL público. No se imprimen sus
valores; tampoco se usan credenciales owner en la aplicación. El modo por defecto
del script solo muestra el plan. No cambia contraseñas de roles anteriores ni
habilita acceso Google: flag false, allowlist vacía y OAuth sin configurar.

SHA-256 del script de provisión:
`5971bfeaea69f9a85d97123d7ce2164fb4a9d798a0717220a6ede1cab87ce6b7`.

## Entorno definido antes de pedir credenciales

Primera prueba real: Next.js local, Neon development existente. Origen exacto
`http://localhost:3000`; callback Google:
`http://localhost:3000/api/auth/callback/google`.
Arranque futuro: `npm run dev:google`. No se pide un deployment ni servicio nuevo.
Google Cloud requiere cliente de tipo Web application, scopes openid/email/profile
y ninguna API Gmail/Drive ni facturación. Se guiará al titular cuando estén listos
el SQL, runtime privado y tests; no compartir Client Secret, cookies ni códigos.

Configuración privada prevista: `.env.google.local`; administración de la lista
en `.env.google-admin.local` (GOOGLE_ALLOWLIST_EMAIL), con comandos --allow/--revoke.
Los comandos administrativos no imprimen el correo ni usan credenciales en argv.
Auth permanece cerrada por defecto (GOOGLE_AUTH_READY=false).

## Verificación y pendientes

Resultado verificado del código `24c2c0f`:

| Prueba | Resultado | Alcance |
| --- | --- | --- |
| `npm run check` | Pasa local y CI | Formato, lint, TypeScript, build Next.js |
| `npm run test:unit` | 11/11 | Guards y contratos, incluyendo Google-only |
| `npm run test:integration` | 21/21 en CI | PostgreSQL 17.6 real; 10 escenarios Google-only más regresiones F0-05 y suites padre |
| `npm run test:e2e` | 4/4 local y CI | Chromium escritorio/móvil; acceso cerrado y API anónima |
| Checks requeridos | 6/6 verdes | Quality, database, auth spike, contracts, provider evidence, visual documentation |
| Neon development | Solo lectura | Nuevos esquemas/roles ausentes; seis tablas financieras mantienen RLS y FORCE RLS |
| Google real + runtime Neon nuevo | No ejecutado | SQL/OAuth pendientes, no equivale al mock |

Evidencia: [CI del código probado](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42533938569).
Los commits anteriores conservan los fallos encontrados y corregidos: nombres
SQL reservados, harness acelerado que chocaba con el límite real y verificación
JWT del redirect. No se relajaron las aserciones de identidad o autorización.

La suite nueva de integración usa
PostgreSQL real desechable y Better Auth instalado con intercambio Google/JWKS
simulado, verificando OAuth/state/PKCE, hooks previos, allowlist, cierre/revocación
y A/B con RLS. Nunca puede apuntar a Neon; usa el guard localhost de F0-05.
No hay bypass del proveedor en el código de aplicación. Prueba además firma,
issuer/audience/caducidad inválidos, fallo DB/red, límite persistente, cambio de
email sin transferir titular y locks de revocación hasta el COMMIT financiero.

Pendientes de aceptación: SQL autorizado, credenciales runtime restringidas,
cliente Google propio, pruebas reales A/B y cuenta no autorizada, persistencia
en dos navegadores, cambio de cuenta y revocación efectiva en Neon. La eliminación
de cuenta/datos sigue en el alcance global con flujo explícito; el endpoint genérico
delete-user permanece deshabilitado en este ticket para impedir borrar identidad
sin el tratamiento financiero y respaldo correspondientes.

F0-07: cuotas/términos Hobby y Neon Free, configuración/operación OAuth. SMTP,
OTP y recuperación de contraseñas propias ya no son dependencias de acceso.
F0-04/F0 abiertas, sin F1, merge, despliegue nuevo ni pago.

Guía paso a paso del titular: [Google Cloud y pruebas](../development-google-auth.md).

Fuentes: [Google](https://better-auth.com/docs/authentication/google),
[validación y vinculación](https://better-auth.com/docs/concepts/users-accounts),
[PostgreSQL](https://better-auth.com/docs/adapters/postgresql).
