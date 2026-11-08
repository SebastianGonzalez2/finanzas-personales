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

## SQL autorizado y aplicado en development

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

**Actualización 2026-11-08:** el titular autorizó expresamente este hash y la
provisión runtime. Se aplicó con `auth:google:migrate`, resultado applied=true,
y se crearon las credenciales restringidas con el script aprobado. Esta nueva
autorización es independiente de la histórica del PR #12.

La provisión de las dos credenciales restringidas fue autorizada mediante el
[script exacto](../../scripts/provision-google-runtime.mjs). Ejecuta
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

Base automatizada del código `24c2c0f` y verificación de Neon previa a OAuth:

| Prueba | Resultado | Alcance |
| --- | --- | --- |
| `npm run check` | Pasa local y CI | Formato, lint, TypeScript, build Next.js |
| `npm run test:unit` | 11/11 | Guards y contratos, incluyendo Google-only |
| `npm run test:integration` | 21/21 en CI | PostgreSQL 17.6 real; 10 escenarios Google-only más regresiones F0-05 y suites padre |
| `npm run test:e2e` | 4/4 local y CI | Chromium escritorio/móvil; acceso cerrado y API anónima |
| Checks requeridos | 6/6 verdes | Quality, database, auth spike, contracts, provider evidence, visual documentation |
| SQL Neon development | Aplicado, hash autorizado | Tres esquemas aditivos, ledger y dos roles nuevos |
| Runtime Neon nuevo | Verificación real pasa | Ambas conexiones limitadas, guards/permisos, seis tablas financieras con RLS/FORCE; allowlist, usuarios y sesiones vacíos |
| Google OAuth real | No ejecutado | Credenciales Google pendientes, no equivale al mock |

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

Evidencia Neon: [registro sin secretos](../evidence/f0-04-google-runtime.json).
`npm run auth:google:verify` es una comprobación de solo lectura de este estado
inicial cerrado/vacío. La primera consulta diagnóstica intentaba resolver por
nombre una tabla sin USAGE del esquema, y obtuvo 42501 correctamente. Se corrigió
la inspección usando OID del catálogo; no se concedieron permisos adicionales.
El guard de runtime de la aplicación pasó con ambos roles reales.

Pendientes de aceptación: cliente Google propio, pruebas reales A/B y cuenta no autorizada, persistencia
en dos navegadores, cambio de cuenta y revocación efectiva en Neon. La eliminación
de cuenta/datos sigue en el alcance global con flujo explícito; el endpoint genérico
delete-user permanece deshabilitado en este ticket para impedir borrar identidad
sin el tratamiento financiero y respaldo correspondientes.

F0-07: cuotas/términos Hobby y Neon Free, configuración/operación OAuth. SMTP,
OTP y recuperación de contraseñas propias ya no son dependencias de acceso.
F0-04/F0 abiertas, sin F1, merge, despliegue nuevo ni pago.

## Avance OAuth real local (2026-11-08)

El titular configuró Google personalmente y guardó Client ID/Secret en su archivo
privado. Se copiaron únicamente esos dos campos a `.env.google.local`, conservando
el resto y las URLs owner vacías. No se imprimieron credenciales. El launcher
corregido ejecuta `npm run dev:google -- --test-login`: habilita OAuth solo en el
proceso local, sin cambiar el flag false del archivo privado. Admisión sigue
dependiendo de la lista persistente. No se desplegó HTTPS nuevo.

Prueba real asistida por el titular, con Google y Neon (no mock):

- Cuenta A fuera de lista: Google retorna a la app con rechazo; conteos reales de
  allowlist, usuarios, cuentas y sesiones permanecen en cero.
- Alta de A en allowlist mediante CLI auditada; OAuth permite entrar. Neon tiene
  un usuario y una identidad Google vinculada al sub; tokens Google descartados.
- API real con su sesión existente: 200; owner en query 400, cookie inválida 401,
  no-store. Harness privado con rol Auth restringido, firma oficial de Better Auth
  y sesiones ya creadas por Google, sin emitir usuarios/sesiones ni exportar tokens.
- Logout desde el botón: /account denegado, cero sesiones en DB y replay de la
  cookie anterior devuelve 401. Nuevo OAuth conserva el mismo owner y la recarga
  permanece conectada.
- Ventana normal e incógnito con A: dos sesiones reales y un titular único.
  Revocar A elimina ambas sesiones y bloquea las dos ventanas y un nuevo OAuth.
  Rehabilitar A conserva la identidad, no restaura sesiones y el replay sigue 401.
- La CLI anterior usaba INSERT ON CONFLICT al rehabilitar, lo cual activaba el
  trigger BEFORE INSERT de auditoría y anotaba un add de más. El registro
  histórico se conserva. La CLI corregida bloquea por correo, actualiza la fila
  existente o inserta solo si falta; el no-op real no genera auditoría. Regresión
  automatizada comprueba que rehabilitar solo incrementa enable y no add.

[Evidencia sin datos personales](../evidence/f0-04-google-oauth-local.json).
Los tokens de replay viven solo en memoria del proceso de prueba interactivo;
no se guardan en archivos, logs ni argv. La allowlist contiene únicamente A.
La inspección de runtime cerrado/vacío anterior es una evidencia inicial, no una
expectativa posterior al alta de prueba.

**Limitación comunicada por el titular:** no dispone de una segunda cuenta de
prueba. Sesiones y revocación de A probadas; A/B real y continuidad de A al
revocar B siguen pendientes. No sustituir B por otra sesión o alias de A.
La persistencia entre dispositivos requiere el destino HTTPS autorizado posterior.

Guía paso a paso del titular: [Google Cloud y pruebas](../development-google-auth.md).

Fuentes: [Google](https://better-auth.com/docs/authentication/google),
[validación y vinculación](https://better-auth.com/docs/concepts/users-accounts),
[PostgreSQL](https://better-auth.com/docs/adapters/postgresql).
