# F0-06 — Pruebas y CI

## Actualización F0-04 Google-only (v9.49)

La rama nueva agrega casos unitarios de perfil verificado, runtime limitado,
orígenes y rutas permitidas; Playwright prueba la pantalla cerrada y API anónima
en escritorio/móvil. La suite PostgreSQL usa conexiones LOGIN reales distintas
para Auth y finanzas, Better Auth instalado y el SQL propuesto de la aplicación.
Google token endpoint y JWKS están simulados; los JWT se firman con RSA de prueba
y se verifican mediante el verificador oficial, con casos de firma/issuer/aud/exp
inválidos. Incluye OAuth/state/PKCE, alta previa a usuario/sesión, binding inmutable,
RLS A/B, revocación concurrente, logout, fallo DB/red y rate limit persistente.

No hay parámetro para omitir verificación Google en producción. El mock de fetch
existe exclusivamente en el test y rechaza redes ajenas. Solo el administrador del
contenedor puede atrasar el reloj de fixtures de rateLimit entre escenarios; el
caso específico verifica el 429 real sin ese ajuste. El harness crea y elimina
esquemas solo dentro de `localhost:55432/finanzas_test`, con la guarda F0-05 intacta;
no se ejecuta contra Neon. Las suites se serializan para compartir ese contenedor.

[SQL pendiente de aprobación y resultados](planning/25-google-only-f0-04.md).
Las pruebas Google/Neon con cuentas reales siguen siendo obligatorias según ADR
0004. El éxito de CI no sustituye esa aceptación.

Base: scaffold F0-03, PR #2 integrado; F0-06 también integrado. Este ticket agrega infraestructura de pruebas; no implementa auth, esquema ni motor financiero de aplicación. Estado vigente: [integración controlada](planning/16-integracion-controlada-f0.md).

Los spikes aislados llevan sus propios package/tsconfig/pruebas y quedan fuera del formato/lint/tsconfig de la app. Evita que el target ES2017 de Next compile contratos Node/BigInt o que la app requiera dependencias de un experimento. Al incorporar un spike hay que ejecutar sus verificaciones propias; F0-09 incluye workflow dedicado. Esto no excluye src ni tests de aplicación.

- `npm ci`: instalación reproducible en Node 24.19.0/npm 11.17.0.
- `npm run check`: formato, ESLint, tipos y build.
- `npm run test:unit`: Node test runner incorporado; guardas del entorno desechable.
- `npx playwright install chromium`, `npm run build`, `npm run test:e2e`: Chromium real, 1440×900 y 390×844, portada/teclado/desborde. Puerto 3106 exclusivo; no reutiliza servidores ajenos. No certifica navegadores móviles nativos.
- `npm run test:integration`: PostgreSQL real; **falla** si no existe el servicio o faltan las variables; no salta tests ni toma `DATABASE_URL`.

## PostgreSQL desechable

CI provisiona PostgreSQL 17.6 en el runner Ubuntu. El driver `pg` es solo de desarrollo y no decide ORM/driver de producción F0-05. Las credenciales siguientes son públicas y solo corresponden a ese contenedor, sin datos persistentes ni reales. En local, requiere Docker ya instalado:

```sh
docker run --rm --name finanzas-f0-test -p 127.0.0.1:55432:5432 -e POSTGRES_USER=f0_test -e POSTGRES_PASSWORD=f0_test -e POSTGRES_DB=finanzas_test postgres:17.6
```

En otra terminal PowerShell:

```powershell
$env:TEST_DATABASE_CONFIRM = 'isolated-local-test'
$env:TEST_DATABASE_URL = 'postgresql://f0_test:f0_test@127.0.0.1:55432/finanzas_test'
npm run test:integration
```

Detener con Ctrl+C la terminal del contenedor al terminar. Nunca adaptar la guarda a una DB real. La prueba usa tabla temporal y rollback: verifica NUMERIC exacto, clave compuesta por titular y ausencia de escritura parcial. **No prueba aislamiento del esquema de la aplicación**; eso depende de F0-04/F0-05 y CA-001/006.

## Merge y seguridad de CI

**Configuración vigente verificada por API:** main protegido con rama actualizada obligatoria, reglas también para administradores, sin fuerza/borrado y seis checks requeridos de GitHub Actions: `F0 quality`, `F0 database`, `F0 visual documentation`, `F0 contracts`, `F0 auth spike`, `F0 provider evidence`. PR obligatorio, mínimo de reviews aprobatorias 0. Se observó bloqueo mientras checks pendientes y habilitación al pasar; no se intentó fusionar un head fallido. La inspección sin protección y recomendaciones siguientes son históricas, anteriores a F0-INTEGRATE.

Checks únicos: `F0 quality` y `F0 database`. Workflow en PR/push de la rama F0-06 y main; sin filtros que omitan archivos, sin secretos ni `pull_request_target`, permisos `contents: read`, checkout sin persistir credenciales, 15/10 minutos y cancelación de runs obsoletos. No publica artefactos financieros ni despliega. Node nativo evita otra dependencia para unidad; Playwright 1.65.0 Apache-2.0 y pg 8.23.1 MIT son compatibles con Node 24; lockfile y licencias de la instalación conservados.

**Inspección 2026-11-07:** repositorio privado, permisos admin disponibles, `main` sin protección (404) y sin rulesets (`[]`). Un check rojo por sí solo **no impide** un merge. [GitHub limita protección en repos privados según plan](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). No se cambió visibilidad ni plan. Activar checks obligatorios después de integrar scaffold/CI y comprobar disponibilidad en la cuenta; antes dejaría PR anteriores sin checks requeridos. No se afirma cumplido ese criterio de F0-06 hasta verificar bloqueo efectivo con prueba negativa.

Referencias oficiales: [Node 24 test runner](https://nodejs.org/docs/latest-v24.x/api/test.html), [Playwright web server](https://playwright.dev/docs/test-webserver), [pg transacciones](https://node-postgres.com/features/transactions), [PostgreSQL en Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

## Evidencia local 2026-11-07

`npm run check`: pasa. `npm run test:unit`: 3/3. `npm run test:e2e`: 2/2. `npm audit --json`: cero avisos. Integración local sin variables: falla cerrada, esperada; no hay Docker/psql/postgres instalados. Primer intento E2E aislado quedó sin respuesta local; se canceló y repetición fuera del sandbox pasó. Un segundo intento simultáneo falló EADDRINUSE y no se ocultó reutilizando el servidor.

RF-004/RNF-01/02/03/12, CA-001/006/013/014/066, I-11/12: infraestructura y comprobaciones parciales, **no aceptación funcional**. Sin migraciones ni cambios de UI, Neon o datos. R-13/R-19 abiertos. CI remoto y prueba negativa se registran en el PR con su SHA. Siguiente: F0-05 en entorno Neon aislado; protección ya aplicada, con los límites descritos arriba.

## Evidencia remota negativa

[Run 42405689022](https://github.com/SebastianGonzalez2/finanzas-personales/actions/runs/42405689022), SHA `14b8ff3`: `F0 quality` falla exactamente en el centinela unitario (3 pasan, 1 falla); formato/lint/tipos/build pasan. `F0 database` pasa contra PostgreSQL real. El test temporal se elimina en un commit nuevo, conservando la evidencia histórica. Esto demuestra propagación del fallo al check, **no** protección efectiva de merge. No se intentó hacer merge como experimento.

## F0-05 — Esquema real y Neon development

Actualización 2026-11-08: `pg` ya es dependencia runtime desde F0-NEON; F0-05
lo reutiliza sin ORM ni paquetes adicionales. Las notas anteriores sobre
ausencia de esquema son históricas. [Informe y límites actuales](planning/19-informe-f0-05.md).

`npm run test:integration` ahora usa `--conditions=react-server` y agrega una
suite que aplica el SQL versionado desde cero, lo reejecuta sin duplicarlo y
verifica RLS, FK por titular, NUMERIC exacto y rollback. Mantiene intacta la
guarda de localhost: nunca reemplazar TEST_DATABASE_URL por una URL Neon.
El esquema neon_auth simulado solo se crea en ese contenedor vacío, sin
identidades, para verificar denegación de permisos; no altera Neon Auth real.

Hay comandos separados, fijados al único development autorizado:

- `npm run db:plan`: muestra destino/versiones/SHA-256 sin conectar.
- `npm run db:migrate -- --apply <sha256 autorizado>`: conexión directa,
  verificación de rama, DDL + ledger atómicos y reejecución sin cambios.
- `npm run test:db:development -- --approved-rollback-fixtures`: requiere
  autorización de fixtures; 48 verificaciones reales con ROLLBACK, sin datos
  persistentes. Por defecto usa conexión directa. Para pooled, establecer
  `F0_05_TEST_CONNECTION=pooled` solamente para ese proceso.

El titular autorizó la migración inicial y esas pruebas; se ejecutaron y
pasaron directo/pooled. El código de prueba no autoriza nuevas migraciones,
escrituras de otro alcance ni cambios en production. No se ejecutan
DELETE/TRUNCATE ni limpieza; se verifica ausencia de esos privilegios.
Los IDs A/B sintéticos de persistencia no son sesiones Auth: CA-001 de API,
CA-006 y puerta F0 continúan pendientes de F0-04/F1-08.
