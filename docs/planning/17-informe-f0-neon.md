# F0-NEON — Conectar entorno de desarrollo

Fecha: 2026-11-07, America/Montevideo. Estado: preparación y validación parcial;
**F0-04/F0-05 y puerta F0 siguen abiertos**. Ticket de apoyo solicitado por el
titular; [procedimiento seguro](../development-neon.md).

## Base y alcance

Inicio limpio en `codex/F0-04-neon-auth-invitaciones`, 0 commits exclusivos
locales y 32 por detrás de `origin/main`. `git fetch origin` completado;
base verificada `de0eec2`. Nueva rama `codex/F0-NEON-conectar-entorno-desarrollo`
desde `origin/main`, conservando la anterior y sin modificar main. Se leyeron
AGENTS, planificación 00/01…09, decisiones v9.48 e informes F0 integrados,
incluido el estado vigente F0-INTEGRATE. Chat renombrado con ID del ticket.

La integración Neon tiene acceso efectivo. La búsqueda por nombre exacto
devolvió dos proyectos homónimos; se detuvo la selección y el titular confirmó
`dry-voice-45959315`. Solo después se consultaron sus recursos development.
No se consultaron ramas/datos del proyecto homónimo ni la rama production.

Destino real: proyecto `finanzas-personales-dev`, región `aws-sa-east-1`,
PostgreSQL 18.6; rama `development` `br-late-feather-b6czfkx0`, lista y
no predeterminada/primaria, con padre e ID diferentes. Endpoint propio
`ep-falling-queen-b63xbfuk`. El titular indicó Free y Auto Delete Never;
las respuestas consultadas no incluyen plan de organización ni un campo
explícito de expiración: no se certifican esos ajustes por suposición.
No se cambiaron límites, facturación ni ciclo de vida.

## Evidencia remota y configuración

`get_auth` y `get_neon_auth_config` devuelven integración **better_auth** para
la rama/base correctas. SQL de catálogo confirma `neon_auth` sin leer usuarios
ni modificar el esquema. `current_setting('neon.branch_id')` y endpoint
coinciden con los IDs esperados. La transacción remota con
`SET TRANSACTION READ ONLY` confirma modo de lectura y `NUMERIC` exacto.

Antes: altas email permitidas, verificación no requerida y revocación en reset
apagada. Se aplicó exclusivamente en development: `disable_sign_up=true`,
verificación OTP requerida/envío al alta y revocación en reset activadas.
Relectura de API confirmó todos los valores. Google compartido, localhost y
SMTP compartido ya estaban configurados. No se cambiaron proveedores ni se
crearon usuarios. Webhook de admisión desactivado; no afirmar rechazo global de
Google ni invitación segura. No hay endpoints/UI Auth publicados en la app.

## SDK y compatibilidad actuales

Registro npm consultado: `@neon/auth` **0.8.2**, Apache-2.0, Node >=20.19,
Next >=16 y React >=18; scaffold Node 24.19/Next 16.4.5/React 19.3.1 cumple
esos pares directos. `@neondatabase/auth` informa 0.7.0-beta; no se sustituyó
el paquete vigente por documentación antigua de GitHub o snippets.

Persisten dos hallazgos reproducidos: el boolean `disableCookieCache: true`
no evita el caché del wrapper; el proxy HTTP sí consulta upstream con
`?disableCookieCache=true`, comprobado dos veces con cookie firmada sintética
y respuesta upstream anónima. El contrato Next tipa esa vía sin casts. No es
una prueba de revocación real. La primera ejecución del test importando el
adaptador Next directamente desde Node falló por resolución ESM `next/headers`;
se probó el export público del proxy HTTP utilizado por ese adaptador, y se
mantuvo el contrato Next como compilación, sin afirmar E2E App Router.

El SDK fija `@better-fetch/fetch` 1.3.2 y el peer del OAuth provider 1.7.18
requiere 1.3.3. Verificado de nuevo en npm; no se forzó resolución ni se
introdujo ese SDK en runtime de la app. Permanece aislado con lockfile.

Fuentes oficiales actuales: [Next API quickstart](https://neon.com/docs/auth/quick-start/nextjs-api-only),
[referencia servidor](https://neon.com/docs/auth/reference/nextjs-server),
[webhook bloqueante](https://neon.com/docs/auth/guides/webhooks),
[método de conexión](https://neon.com/docs/connect/choose-connection).

## Entrega local y pruebas

Configuración fijada al destino verificado, parser seguro/TLS, sonda pg de solo
lectura, `.env.example` sin valores privados, `.env.local` ignorado con secret
generado sin mostrarlo. `pg` 8.23.1 pasa de dev a runtime, con `server-only`
0.0.1 y `@types/pg` 8.23.1 MIT; sin ORM adicional ni migraciones.

| Comando/verificación | Resultado observado |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Pasa desde lockfile integrado y desde lockfile final (219 paquetes), sin scripts de dependencias. |
| `npm run test:unit` | 7/7; incluye rechazo de otras ramas/proyectos/hosts y opciones TLS inseguras, sin red. |
| `npm run check` | Formato, lint, typecheck y build Webpack pasan (exit 0); build lee `.env.local` sin imprimir valores. |
| `npm test`, `npm run typecheck` en `spikes/neon-auth` | 27/27 y tipos pasan, incluida extensión HTTP sin caché. |
| `npm run probe` en `spikes/neon-auth` | **Real development**: sesión anónima vacía y JWKS Ed25519 disponibles. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades conocidas de producción reportadas; no garantía absoluta. |
| SQL por MCP, transacción de solo lectura | Rama esperada, `neon_auth`, NUMERIC y READ ONLY pasan. |
| `npm run probe:neon` desde la app | **Real, exit 0:** conexión pooled, rama development, READ ONLY y NUMERIC exacto. Primera ejecución sin configuración devolvió 2 sin conectar. |
| `npm run probe:neon -- --direct` | **Real, exit 0:** conexión directa, rama development, READ ONLY y NUMERIC exacto. Sin migraciones. |

Una repetición de la sonda Auth sin acceso de red fuera del sandbox falló con
salida 1 genérica; la ejecución con red autorizada sí pasó. La primera consulta
npm en sandbox tampoco resolvía el registro; se verificaron los metadatos
mediante consulta autorizada. No se atribuyen esos fallos al proveedor.

No se ejecutan los tests locales desechables contra Neon. Migraciones,
aislamiento real A/B, concurrencia/idempotencia DB, sesiones autenticadas,
Google/invitación/OTP/reset y entregabilidad no se declaran probados.
Sin cambios visuales: no hay nueva UX móvil/escritorio que aceptar.

## Límites y siguiente paso

El titular guardó las URLs pooled/direct en el `.env.local` preparado y ambas
conexiones reales pasaron; no se recuperaron ni publicaron esas credenciales.
El conector no inyecta credenciales en Next. Para F0-04 siguen faltando receptor HTTPS,
admisión persistente, resolver compatibilidad e integración App Router y pruebas
reales. Para F0-05 faltan esquema/migraciones propias y aislamiento con dos
identidades confiables; no se creó toda la aplicación.

R-19 parcialmente mitigado por acceso efectivo y entorno identificado;
R-01/02/13/17 siguen abiertos. RF-001…004, RNF-01/02/03/09/11/12,
CA-001…006 e I-11/I-12 referenciados como preparación, sin cierre funcional.
Sin datos financieros, efectos monetarios, nuevas ramas/proyectos Neon,
servicios pagos, merge ni deploy.
