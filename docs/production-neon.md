# Entorno Neon de production — inicialización controlada (OPS)

Este procedimiento prepara la **base financiera**, la **migración Google Auth**
y los **roles runtime** de Neon Production. Las herramientas son exclusivas de
production y **no modificaron Neon durante su desarrollo**: cada operación se
ejecuta cuando el titular lo decide, con autorización explícita por hash.

Destino fijo verificado en `src/server/neon-targets.ts` y
`src/server/neon-production-config.ts`:

| Campo | Valor |
| --- | --- |
| Proyecto | `dry-voice-45959315` |
| Rama (production) | `br-wild-mode-b64fgovd` |
| Endpoint directo | `ep-morning-sunset-b6i4kxdg.c-2.sa-east-1.aws.neon.tech` |
| Endpoint pooled | `ep-morning-sunset-b6i4kxdg-pooler.c-2.sa-east-1.aws.neon.tech` |
| Base | `neondb` |
| Rol de operaciones | `neondb_owner` |

Los hosts son identificadores públicos, no credenciales. Las variables de
entorno **no pueden seleccionar otro destino**: solo confirman proyecto, rama,
host, base y rol; cualquier discrepancia falla sin fallback a development.

## Requisitos previos (una vez)

1. Node 24 y las dependencias instaladas (`npm ci`). Trabajar desde la raíz del
   repositorio, en la rama con estas herramientas.
2. Crear el archivo privado **`.env.production.local`** (ignorado por Git, no
   sobrescribir uno existente). Debe contener:

   ```ini
   NEON_PROJECT_ID=dry-voice-45959315
   NEON_BRANCH_ID=br-wild-mode-b64fgovd
   DATABASE_URL=<URL pooled con rol neondb_owner>
   DATABASE_URL_UNPOOLED=<URL directa con rol neondb_owner>
   ```

3. Obtener ambas URLs del panel: [proyecto autorizado](https://console.neon.tech/app/projects/dry-voice-45959315)
   → rama **production** (`br-wild-mode-b64fgovd`) → **Connect**, base
   **neondb**, rol **neondb_owner**: una con *Connection pooling* (pooled) y
   otra sin pooling (directa). Copiar solo la URL, sin `psql` ni comillas.
4. Confirmar `git check-ignore .env.production.local`. Nunca enviar su
   contenido al chat, Git, capturas, logs ni variables `NEXT_PUBLIC_*`.

Los pasos 1–3 usan la conexión **directa** (`DATABASE_URL_UNPOOLED`) con TLS
verificado y channel binding, obligatorios por configuración.

## Paso 1 — Base financiera (38 migraciones)

1. Plan sin conexión:

   ```sh
   npm run db:plan:production
   ```

   Imprime JSON con el destino, las 38 migraciones con su SHA-256 individual,
   el **SHA-256 del manifiesto completo y ordenado** y el comando de aplicación
   con ese hash exacto (`applyCommand`). Registrar el hash del manifiesto.

2. Aplicar **solo** con ese hash (rechaza cualquier otro antes de abrir
   conexión):

   ```sh
   npm run db:migrate:production -- --apply <sha256-del-manifiesto>
   ```

   Antes de ejecutar verifica en servidor: base, rama (`neon.branch_id`),
   endpoint (host fijado) y `session_user`/`current_user` = `neondb_owner`.
   Luego, en una transacción con advisory lock, aplica las migraciones
   pendientes y sus checksums en `finance_meta.schema_migrations`, y hace
   COMMIT. Un ledger con checksum o versión desconocida **rechaza antes de
   cualquier DDL** ("Historial de migraciones divergente").

3. Idempotencia: re-ejecutar el mismo comando devuelve `applied: []` con
   `alreadyApplied: 38` sin cambios. Si el plan cambia (nueva migración),
   regenerar el plan, revisar el diff y autorizar el nuevo manifiesto.

## Paso 2 — Migración Google Auth (F0-04)

1. Plan sin conexión:

   ```sh
   npm run auth:google:plan:production
   ```

   Imprime el destino, la ruta única `src/db/proposals/0003_F0-04_google_only.sql`
   y su SHA-256.

2. Aplicar con el hash exacto del SQL vigente:

   ```sh
   npm run auth:google:migrate:production -- --apply --approved-sha256=<sha256>
   ```

   En una transacción con advisory lock verifica: sesión del titular
   (production + `neondb_owner`), que **las 38 migraciones financieras estén
   completas y con checksums idénticos** al repositorio, que `finanzas_app`
   exista, y que `app_auth_meta.migrations` no exista todavía. Aplica el SQL,
   registra el hash en `app_auth_meta.migrations` y hace COMMIT.

3. No re-ejecutar: un segundo intento es **rechazado** ("La migración Google ya
   está aplicada en production; no se re-ejecuta") y no genera cambios. Un
   ledger presente con contenido distinto al hash vigente rechaza como
   "Historial Google divergente".

## Paso 3 — Credenciales de runtime (roles de aplicación)

1. Plan:

   ```sh
   npm run auth:google:runtime:production
   ```

2. Aplicar con autorización expresa (genera contraseñas aleatorias de 32 bytes
   para `finanzas_google_auth` y `finanzas_google_finance`):

   ```sh
   npm run auth:google:runtime:production -- --approved-runtime-credentials
   ```

   Antes de ejecutar verifica la sesión del titular y que la migración Google
   esté registrada con el hash exacto. Comprueba que cada rol existe y **no
   tiene** superuser/bypassrls/createdb/createrole, configura solo sus
   contraseñas (sin conceder membresías ni privilegios adicionales), genera las
   dos conexiones pooled con `sslmode=verify-full&channel_binding=require` y
   crea **`.env.production.google.local`** (permisos 0600). Nunca imprime ni
   registra secretos.

3. El archivo se crea con `wx`: si ya existe, **falla en lugar de
   sobrescribirlo**. Contiene `NEON_PROJECT_ID`, `NEON_BRANCH_ID`,
   `GOOGLE_AUTH_DATABASE_URL`, `GOOGLE_FINANCE_DATABASE_URL`,
   `GOOGLE_AUTH_SECRET` y `GOOGLE_AUTH_READY=false`; `DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, `GOOGLE_AUTH_ORIGIN` y las credenciales OAuth de
   Google quedan vacíos para completar en Vercel.

4. Verificación de solo lectura (una vez, antes de Vercel y sin datos reales):

   ```sh
   npm run auth:google:verify:production
   ```

   Requiere el archivo privado. Comprueba con `assertGoogleRuntime` que cada
   rol conecta al destino de production con mínimos privilegios (sin acceso a
   `neon_auth`, sin propiedad de objetos, RLS forzada en las 6 tablas
   financieras y estados de allowlist/usuarios/sesiones vacíos). Debe pasar
   antes del Paso 4.

## Paso 4 — Vercel (posterior a esta preparación)

En el proyecto de Vercel → Settings → Environment Variables, alcance
**Production** únicamente (no usar «All Environments» para las URLs):

- `NEON_PROJECT_ID=dry-voice-45959315`
- `NEON_BRANCH_ID=br-wild-mode-b64fgovd`
- `GOOGLE_AUTH_DATABASE_URL` y `GOOGLE_FINANCE_DATABASE_URL`: copiar del
  archivo `.env.production.google.local` (rotar con el Paso 3 si se sospecha
  exposición).
- `GOOGLE_AUTH_SECRET`: copiar del archivo privado (no reutilizar el de
  development).
- `GOOGLE_AUTH_ORIGIN=https://<dominio-production>`
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: credenciales OAuth con el
  redirect `https://<dominio-production>/api/auth/callback/google`.
- `GOOGLE_AUTH_READY=false` hasta completar la aceptación A/B con cuentas
  reales; exponer las System Environment Variables `VERCEL` y `VERCEL_ENV`.

El alcance **Preview** mantiene los valores de development
(`docs/development-neon.md`). El despliegue en Production y la validación
HTTPS entre dispositivos con cuentas Google reales son pasos posteriores,
condiciones de ADR 0004; esta preparación no despliega ni habilita uso real.

## Controles y garantías

| Control | Dónde |
| --- | --- |
| Destino cerrado; variables solo confirman | `neon-targets.ts`, `neon-production-config.ts` |
| Conexión directa, TLS verificado y channel binding | `neonDatabaseConfig` (modo `direct`) |
| Sesión del titular: base, rama, endpoint y rol | `assertProductionOwnerSession` |
| Autorización por manifiesto (SHA-256 completo) | `migrate-production.mjs`, `production-migrations.mts` |
| Transacción única + advisory lock (`705005` financiero, `704049` Google) | ambos migradores |
| Historial divergente rechazado antes de DDL | `migrateProductionInTransaction`, `applyGoogleAuthProduction` |
| Base financiera completa + `finanzas_app` antes de Google Auth | `assertProductionFinanceMigrationsComplete` |
| Duplicada de Google Auth rechazada | `applyGoogleAuthProduction` |
| Roles sin privilegios adicionales | `provisionGoogleRuntimeProduction` |
| Archivo privado sin sobrescribir; secretos sin imprimir | `provision-google-runtime-production.mjs` |

## Seguridad

- Los hashes del plan (manifiesto y SQL de Google) se calculan siempre del
  repositorio local: si los archivos cambian, la autorización anterior deja de
  ser válida.
- Nada de este flujo imprime contraseñas, URLs privadas ni diagnósticos del
  driver; los errores controlados son cadenas fijas y el resto se omite.
- No enviar `.env.production.local`, `.env.production.google.local` ni
  capturas del panel a Git, chat, logs o herramientas externas.
- Los datos usados en pruebas automatizadas son sintéticos; no conectar datos
  financieros reales hasta completar la validación HTTPS entre dispositivos.

Trazabilidad: ADR 0004, `docs/development-neon.md` (separación OPS),
`docs/planning/57-preparacion-uso-real-f6-07.md`. Sin cambios contables ni de
producto; no se ejecutó SQL remoto ni se crearon credenciales reales al
preparar estas herramientas.
